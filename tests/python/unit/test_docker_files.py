"""Static checks of the Docker development stack (no Docker needed, so they run in every pipeline).

The stack: docker-compose.yml (mysql + backend + frontend), backend/Dockerfile.dev, frontend/Dockerfile.dev.
They must build Linux images that work from Windows and Ubuntu, keep secrets in the .env files only, and must
not break `npm run dev`, which starts only the mysql service of the same compose file.
"""

import json
import re
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[3]
COMPOSE = ROOT / "docker-compose.yml"
BACKEND = ROOT / "backend" / "Dockerfile.dev"
FRONTEND = ROOT / "frontend" / "Dockerfile.dev"
SECRET_NAMES = ("SESSION_SECRET", "OTP_SECRET", "SMTP_PASSWORD", "SMTP_USER")


def read(path):
    """The file as text; the test fails with a clear message when it is missing."""
    assert path.exists(), f"{path.relative_to(ROOT)} is missing"
    return path.read_text("utf-8")


def service_block(compose, name):
    """The lines of one top-level service in docker-compose.yml (indentation based, no YAML library)."""
    match = re.search(rf"^  {name}:\n((?:    .*\n|\n)+)", compose, re.MULTILINE)
    assert match, f"service {name} is missing"
    return match.group(1)


@pytest.mark.parametrize("path", [COMPOSE, BACKEND, FRONTEND], ids=lambda p: p.name)
def test_docker_files_use_linux_line_endings(path):
    assert "\r" not in read(path), f"{path.name} has Windows line endings; the Linux shell needs LF"


def test_compose_runs_mysql_backend_and_frontend_with_the_right_ports():
    compose = read(COMPOSE)
    assert "'3307:3306'" in service_block(compose, "mysql")
    assert "'3000:3000'" in service_block(compose, "backend")
    assert "'5173:5173'" in service_block(compose, "frontend")


def test_compose_links_the_env_files_and_the_containers_by_service_name():
    compose = read(COMPOSE)
    backend = service_block(compose, "backend")
    frontend = service_block(compose, "frontend")
    assert "path: backend/.env" in backend and "path: frontend/.env" in frontend
    assert "required: false" in backend and "required: false" in frontend
    assert "DATABASE_URL: mysql://cq:cq_dev_password@mysql:3306/campusquest" in backend
    assert "BACKEND_URL: http://backend:3000" in frontend
    assert "condition: service_healthy" in backend and "condition: service_healthy" in frontend
    assert "dockerfile: backend/Dockerfile.dev" in backend
    assert "dockerfile: frontend/Dockerfile.dev" in frontend


def test_compose_holds_no_secret_of_the_env_files():
    compose = read(COMPOSE)
    for name in SECRET_NAMES:
        assert not re.search(rf"^\s*{name}\s*[:=]", compose, re.MULTILINE), name


@pytest.mark.parametrize(
    ("path", "workspace"),
    [(BACKEND, "backend"), (FRONTEND, "frontend")],
    ids=["backend", "frontend"],
)
def test_dockerfiles_install_linux_dependencies_inside_the_image(path, workspace):
    text = read(path)
    assert re.search(r"^FROM node:22-bookworm", text, re.MULTILINE)
    assert f"npm ci --workspace {workspace}" in text
    assert (
        "--ignore-scripts" in text
    ), "the root postinstall must not write .env files into the image"
    assert "COPY package.json package-lock.json ./" in text
    assert "USER node" in text, "the container must not run as root"
    # Copying the whole folder would bring Windows node_modules (wrong native builds) into the image.
    assert not re.search(r"^COPY \. ", text, re.MULTILINE)
    assert not re.search(rf"^COPY {workspace}/? ", text, re.MULTILINE)


def test_backend_image_migrates_and_seeds_before_it_listens():
    cmd = re.search(r"^CMD (.+)$", read(BACKEND), re.MULTILINE).group(1)
    steps = ["migrate.js", "seed.js", "seed-demo.js", "index.js"]
    positions = [cmd.index(step) for step in steps]
    assert positions == sorted(positions), cmd
    assert "EXPOSE 3000" in read(BACKEND)


def test_frontend_image_listens_on_all_interfaces():
    text = read(FRONTEND)
    assert '"--host", "0.0.0.0"' in text and "EXPOSE 5173" in text


def test_npm_run_dev_starts_only_the_database_container():
    scripts = json.loads(read(ROOT / "package.json"))["scripts"]
    assert scripts["db:up"] == "docker compose up -d --wait mysql"
    assert scripts["docker:up"] == "docker compose up --build"
    assert "docker compose up -d --wait mysql" in read(ROOT / "scripts" / "ensure-db.mjs")
    # The test runner too: starting every service took the ports of a running `npm run dev`.
    assert "docker compose up -d --wait mysql" in read(ROOT / "tests" / "run-all.mjs")
    # The API is started without the backend's own predev hook, so the database is prepared only once.
    assert "npm run watch --prefix backend" in scripts["dev"]


def test_vite_polls_for_changes_inside_docker():
    assert "CHOKIDAR_USEPOLLING" in read(ROOT / "frontend" / "vite.config.js")
    assert "CHOKIDAR_USEPOLLING: 'true'" in service_block(read(COMPOSE), "frontend")


PROD_COMPOSE = ROOT / "docker-compose.prod.yml"
PROD_BACKEND = ROOT / "backend" / "Dockerfile"
PROD_FRONTEND = ROOT / "frontend" / "Dockerfile"
NGINX = ROOT / "frontend" / "nginx.conf"
PROD_ENV_EXAMPLE = ROOT / ".env.production.example"


@pytest.mark.parametrize(
    "path",
    [PROD_COMPOSE, PROD_BACKEND, PROD_FRONTEND, NGINX, PROD_ENV_EXAMPLE],
    ids=lambda p: p.name,
)
def test_production_files_use_linux_line_endings(path):
    assert "\r" not in read(
        path
    ), f"{path.name} has Windows line endings; the Ubuntu server needs LF"


def test_production_stack_publishes_only_the_web_port():
    compose = read(PROD_COMPOSE)
    assert "ports:" not in service_block(compose, "mysql")
    assert "ports:" not in service_block(compose, "backend")
    assert "'${HTTP_PORT:-8080}:80'" in service_block(compose, "web")


def test_production_api_runs_in_production_mode_without_code_preview():
    backend = service_block(read(PROD_COMPOSE), "backend")
    assert "NODE_ENV: production" in backend
    assert "OTP_PREVIEW_DEFAULT: 'false'" in backend
    assert "FRONTEND_ORIGIN: ${PUBLIC_URL:?" in backend
    assert "path: .env.production" in backend


def test_production_stack_needs_its_passwords_and_holds_no_secret():
    compose = read(PROD_COMPOSE)
    for name in ("MYSQL_ROOT_PASSWORD", "MYSQL_PASSWORD", "PUBLIC_URL"):
        assert f"${{{name}:?" in compose, name
    for name in SECRET_NAMES:
        assert not re.search(rf"^\s*{name}\s*[:=]", compose, re.MULTILINE), name


def test_production_example_settings_are_empty_where_they_are_secret():
    example = read(PROD_ENV_EXAMPLE)
    for name in (
        "MYSQL_ROOT_PASSWORD",
        "MYSQL_PASSWORD",
        "SESSION_SECRET",
        "OTP_SECRET",
        "SMTP_PASSWORD",
    ):
        assert re.search(
            rf"^{name}=$", example, re.MULTILINE
        ), f"{name} must be empty in the example"
    assert re.search(r"^PUBLIC_URL=https://", example, re.MULTILINE)


def test_production_images_never_seed_demo_players_or_watch_files():
    backend = read(PROD_BACKEND)
    assert "NODE_ENV=production" in backend and "--omit=dev" in backend
    assert "seed-demo" not in backend and "--watch" not in backend
    frontend = read(PROD_FRONTEND)
    assert "VITE_USE_MOCKS=false" in frontend and "VITE_DEV_FAKE_LOCATION=false" in frontend
    assert "vite build" in frontend and "FROM nginx:" in frontend


def test_nginx_serves_the_app_and_forwards_the_api_with_the_proxy_headers():
    nginx = read(NGINX)
    assert "try_files $uri $uri/ /index.html;" in nginx
    for path in ("/api/", "/uploads/"):
        block = nginx.split(f"location {path} {{", 1)[1].split("}", 1)[0]
        assert "proxy_pass http://backend:3000;" in block
        assert "X-Forwarded-For $proxy_add_x_forwarded_for" in block
        assert "X-Forwarded-Proto" in block


def test_the_real_production_settings_file_is_ignored_by_git():
    ignore = read(ROOT / ".gitignore")
    assert ".env.*" in ignore and "!.env.production.example" in ignore
