"""Security and privacy tests (OWASP style) against the running API and the test database."""

import re

import pytest
import requests

from conftest import (
    API_URL,
    REPORTS,
    Player,
    connect_db,
    known_code,
    query,
    unique_email,
    unique_ip,
)

pytestmark = pytest.mark.api
CANARY_LAT, CANARY_LNG = 49.123457, 9.654321


def anonymous():
    """A client without a session."""
    return Player(unique_email("anon"))


def test_responses_carry_the_basic_security_headers():
    headers = anonymous().get("/health").headers
    assert headers.get("X-Content-Type-Options") == "nosniff"
    assert "X-Powered-By" not in headers
    assert "Strict-Transport-Security" in headers or "X-Frame-Options" in headers


def test_the_session_cookie_cannot_be_read_by_scripts():
    visitor = anonymous()
    visitor.post("/auth/request-otp", {"email": visitor.email})
    code = known_code(visitor.email)
    reply = visitor.post(
        "/auth/verify",
        {"email": visitor.email, "otp": code, "firstName": "Co", "lastName": "Okie"},
    )
    cookie = reply.headers["Set-Cookie"]
    assert "HttpOnly" in cookie and "SameSite=Lax" in cookie and "cq_session=" in cookie


def test_a_forged_session_cookie_is_refused():
    forged = requests.get(
        f"{API_URL}/api/me",
        cookies={"cq_session": "0" * 64},
        headers={"X-Forwarded-For": unique_ip()},
        timeout=10,
    )
    assert forged.status_code == 401


@pytest.mark.parametrize(
    "email",
    ["a'--@heilbronn.dhbw.de", "' OR 1=1 --@heilbronn.dhbw.de", "x@heilbronn.dhbw.de.evil.com"],
)
def test_hostile_e_mail_strings_never_cause_a_server_error(email):
    reply = anonymous().post("/auth/request-otp", {"email": email})
    assert reply.status_code in (200, 400), reply.text
    if email.endswith("evil.com"):
        assert reply.status_code == 400


def test_a_cross_site_request_is_blocked_but_a_plain_client_is_not():
    visitor = anonymous()
    blocked = visitor.post(
        "/auth/request-otp", {"email": visitor.email}, headers={"Origin": "https://evil.example"}
    )
    assert blocked.status_code == 403 and blocked.json()["error"]["code"] == "FORBIDDEN_ORIGIN"
    assert visitor.post("/auth/request-otp", {"email": visitor.email}).status_code == 200


def test_five_wrong_codes_lock_the_login_even_for_the_right_code():
    visitor = anonymous()
    visitor.post("/auth/request-otp", {"email": visitor.email})
    right = known_code(visitor.email)
    wrong = "000000" if right != "000000" else "111111"
    body = {"email": visitor.email, "firstName": "L", "lastName": "Ock"}
    for _ in range(5):
        assert visitor.post("/auth/verify", {**body, "otp": wrong}).status_code == 400
    late = visitor.post("/auth/verify", {**body, "otp": right})
    assert late.status_code == 400 and late.json()["error"]["code"] == "INVALID_CODE"


def test_the_login_rate_limit_answers_429_after_thirty_requests_from_one_address():
    visitor = anonymous()
    codes = [
        visitor.post("/auth/request-otp", {"email": unique_email("flood")}).status_code
        for _ in range(35)
    ]
    assert codes[0] == 200 and 429 in codes


def test_the_administrator_is_in_no_ranking(player, admin):
    student = player("ranked")
    solo = student.get("/leaderboards/solo").json()["entries"]
    assert admin.id not in {entry["id"] for entry in solo}
    assert student.get(f"/players/{admin.id}").status_code == 404


def test_nobody_but_the_owner_can_read_an_attempt(player):
    owner = player("owner")
    other = player("snoop")
    attempt = owner.start_quiz("Sensoricum").json()["attempt"]
    assert other.get(f"/attempts/{attempt['id']}").status_code == 404
    assert other.get(f"/attempts/{attempt['id']}/result").status_code == 404


def test_no_coordinates_codes_or_tokens_are_stored_or_logged(player):
    student = player("canary")
    student.post("/me/location-consent")
    cp = student.checkpoint("Library")
    student.post(
        f"/checkpoints/{cp['id']}/verify",
        {"lat": CANARY_LAT, "lng": CANARY_LNG, "accuracy": 10, "ageMs": 0},
    )
    token = student.http.cookies.get("cq_session")
    assert token

    connection = connect_db()
    try:
        tables = [next(iter(row.values())) for row in query(connection, "SHOW TABLES")]
        for table in tables:
            if table in ("checkpoints", "schema_migrations"):
                continue  # the checkpoint centres are public map points, not people
            dump = str(query(connection, f"SELECT * FROM `{table}`"))
            assert "123457" not in dump and "654321" not in dump, f"coordinates found in {table}"
            assert token not in dump, f"the session token is stored in clear text in {table}"
    finally:
        connection.close()

    log = REPORTS / "api.log"
    if log.exists():
        text = log.read_text(encoding="utf-8", errors="replace")
        assert not re.search(r"123457|654321", text), "coordinates were written to the API log"
        assert token not in text, "the session token was written to the API log"


def test_br49_quest_management_is_for_administrators_only():
    student = Player(unique_email("quests")).sign_in()
    assert student.get("/admin/checkpoints").status_code == 403
    assert student.post("/admin/checkpoints", {"name": "Nope"}).status_code == 403
    assert student.delete("/admin/checkpoints/1").status_code == 403
    assert anonymous().get("/admin/checkpoints").status_code == 401


def test_br51_the_map_link_box_cannot_be_used_to_reach_other_servers(admin):
    for target in [
        "http://169.254.169.254/latest/meta-data",
        "https://169.254.169.254/maps",
        "https://localhost:3000/maps",
        "file:///etc/passwd",
        "https://google.com.evil.example/maps/@49.1,9.2,17z",
        "https://www.google.com@evil.example/maps/@49.1,9.2,17z",
    ]:
        reply = admin.post("/admin/checkpoints/check-link", {"mapLink": target})
        assert reply.status_code == 400, target
        assert reply.json()["error"]["code"] == "INVALID_MAP_LINK", target


def test_br48_a_map_style_cannot_carry_markup_or_other_styles():
    student = Player(unique_email("markup")).sign_in()
    for bad in ["red; background: url(//evil)", "</style><script>x</script>", "#12345g"]:
        reply = student.request("PUT", "/me/map-style", json={"highlight": bad})
        assert reply.status_code == 400, bad
        assert reply.json()["error"]["code"] == "INVALID_MAP_STYLE"
    assert student.get("/me/map-style").json()["style"]["highlight"] != "red"


def test_br44_only_the_leader_can_remove_a_member():
    lead = Player(unique_email("lead")).sign_in()
    mate = Player(unique_email("mate")).sign_in()
    assert lead.post("/teams", {"name": f"Safe {lead.id}"}).status_code == 201
    assert lead.post("/teams/me/invitations", {"email": mate.email}).status_code == 202
    invitation = mate.get("/invitations").json()["invitations"][-1]
    mate.post(f"/invitations/{invitation['id']}/accept")
    assert mate.delete(f"/teams/me/members/{lead.id}").status_code == 403
    outsider = Player(unique_email("outsider")).sign_in()
    assert outsider.delete(f"/teams/me/members/{mate.id}").status_code == 403
    assert lead.get("/teams/me").json()["team"]["size"] == 2
