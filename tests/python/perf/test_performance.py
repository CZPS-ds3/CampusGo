"""Performance tests: latency budgets, many parallel sessions, first question time and bundle size."""

import gzip
import json
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import pytest

from conftest import Player, connect_db, query, unique_email

ROOT = Path(__file__).resolve().parents[3]
BUDGETS = json.loads((ROOT / "tests" / "perf" / "budgets.json").read_text(encoding="utf-8"))


def p95(samples):
    """95th percentile of a list of numbers."""
    ordered = sorted(samples)
    return ordered[min(len(ordered) - 1, int(len(ordered) * 0.95))]


def timed(call, times):
    """Milliseconds for `times` calls of call()."""
    out = []
    for _ in range(times):
        started = time.perf_counter()
        reply = call()
        out.append((time.perf_counter() - started) * 1000)
        assert reply.status_code == 200, reply.text
    return out


@pytest.fixture
def crowd():
    """Many students straight in the database, so the leaderboard has real work to do."""
    connection = connect_db()
    with connection.cursor() as cursor:
        cursor.executemany(
            "INSERT INTO students (email, first_name, last_name, total_points, points_exact_x100, "
            "points_updated_at, created_at) VALUES (%s, 'Crowd', 'Member', %s, %s, NOW(3), NOW(3))",
            [
                (f"perf-{i}-{unique_email('c')}", i * 7 % 5000, i * 7 % 5000 * 100)
                for i in range(BUDGETS["seeded_players"])
            ],
        )
    yield
    query(connection, "DELETE FROM students WHERE email LIKE 'perf-%'")
    connection.close()


@pytest.mark.api
def test_health_is_fast():
    visitor = Player(unique_email("perf"))
    assert p95(timed(lambda: visitor.get("/health"), BUDGETS["samples"])) < BUDGETS["health_p95_ms"]


@pytest.mark.api
@pytest.mark.db
@pytest.mark.usefixtures("crowd")
def test_the_solo_leaderboard_stays_fast_with_many_players(player):
    student = player("board")
    result = p95(timed(lambda: student.get("/leaderboards/solo"), BUDGETS["samples"]))
    assert result < BUDGETS["solo_board_p95_ms"], f"p95 {result:.0f} ms"


@pytest.mark.api
def test_requesting_a_login_code_is_fast():
    def request_code():
        visitor = Player(unique_email("code"))
        return visitor.post("/auth/request-otp", {"email": visitor.email})

    result = p95(timed(request_code, BUDGETS["samples"]))
    assert result < BUDGETS["login_request_p95_ms"], f"p95 {result:.0f} ms"


@pytest.mark.api
@pytest.mark.slow
def test_fifty_parallel_sessions_are_served_in_time(player):
    sessions = [player("parallel") for _ in range(BUDGETS["parallel_sessions"])]
    started = time.perf_counter()
    with ThreadPoolExecutor(max_workers=BUDGETS["parallel_sessions"]) as pool:
        replies = list(pool.map(lambda s: s.get("/checkpoints"), sessions))
    elapsed = time.perf_counter() - started
    assert all(reply.status_code == 200 for reply in replies)
    assert elapsed < BUDGETS["parallel_total_seconds"], f"{elapsed:.1f} s"


@pytest.mark.api
def test_the_first_question_arrives_quickly_after_the_location_check(player):
    student = player("first")
    started = time.perf_counter()
    reply = student.start_quiz("Sensoricum")
    elapsed_ms = (time.perf_counter() - started) * 1000
    attempt = reply.json()["attempt"]
    assert attempt["questions"][0]["text"] and len(attempt["questions"][0]["options"]) == 4
    assert elapsed_ms < BUDGETS["first_question_ms"], f"{elapsed_ms:.0f} ms"


def gzip_size(paths):
    """Total gzip size in bytes of some files."""
    return sum(len(gzip.compress(path.read_bytes())) for path in paths)


# The 3D map (MapLibre) is a chunk of its own that is only downloaded when someone opens the 3D map.
LAZY_3D_PREFIX = "MapView3D-"


def built_assets():
    """The built assets folder, or a skip when the web app was not built."""
    assets = ROOT / "frontend" / "dist" / "assets"
    if not assets.exists():
        pytest.skip("run the build first: npm run build")
    return assets


def first_load(assets, pattern):
    """The files of one type that every visitor downloads (all except the 3D map chunk)."""
    return [p for p in assets.glob(pattern) if not p.name.startswith(LAZY_3D_PREFIX)]


def test_the_built_web_app_stays_within_its_size_budget():
    assets = built_assets()
    js = gzip_size(first_load(assets, "*.js"))
    css = gzip_size(first_load(assets, "*.css"))
    assert js < BUDGETS["bundle_js_gzip_bytes"], f"JS {js} bytes gzipped"
    assert css < BUDGETS["bundle_css_gzip_bytes"], f"CSS {css} bytes gzipped"


def test_the_3d_map_is_loaded_separately_and_stays_within_its_budget():
    assets = built_assets()
    js_files = list(assets.glob(f"{LAZY_3D_PREFIX}*.js"))
    assert js_files, "the 3D map should be a chunk of its own"
    js = gzip_size(js_files)
    css = gzip_size(assets.glob(f"{LAZY_3D_PREFIX}*.css"))
    assert js < BUDGETS["map3d_js_gzip_bytes"], f"3D map JS {js} bytes gzipped"
    assert css < BUDGETS["map3d_css_gzip_bytes"], f"3D map CSS {css} bytes gzipped"
