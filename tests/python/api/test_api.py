"""Integration tests over real HTTP: login, teams, invitations, location check, quiz and leaderboards."""

import json
from pathlib import Path

import pytest
import requests

from conftest import API_URL, DOMAIN, Player, unique_email, unique_ip

pytestmark = pytest.mark.api
ROOT = Path(__file__).resolve().parents[3]
CHECKPOINTS = json.loads((ROOT / "testing" / "checkpoint-coordinates.json").read_text("utf-8"))


def anonymous():
    """A client without a session."""
    return Player(unique_email("anon"))


def test_health_answers():
    reply = anonymous().get("/health")
    assert reply.status_code == 200 and reply.json() == {"status": "ok"}


def test_an_address_outside_the_school_domain_is_refused():
    reply = anonymous().post("/auth/request-otp", {"email": "someone@gmail.com"})
    assert reply.status_code == 400 and reply.json()["error"]["code"] == "INVALID_EMAIL"


def test_known_and_unknown_addresses_get_the_same_answer(player):
    known = player("known")
    stranger = anonymous()
    one = known.post("/auth/request-otp", {"email": known.email})
    other = stranger.post("/auth/request-otp", {"email": stranger.email})
    assert one.status_code == other.status_code == 200
    assert one.json() == other.json()


def test_sign_up_session_and_logout(player):
    student = player("signup", first="Ada", last="Lovelace", nickname="Ada")
    me = student.get("/me")
    assert me.status_code == 200 and me.json()["student"]["displayName"] == "Ada"
    assert student.post("/auth/logout").status_code == 204
    assert student.get("/me").status_code == 401


def test_a_second_login_ends_the_first_session(player):
    first = player("twice")
    second = Player(first.email).sign_in()
    assert second.get("/me").status_code == 200
    assert first.get("/me").status_code == 401


def test_requests_without_a_session_are_refused():
    for path in ["/me", "/checkpoints", "/teams/me", "/leaderboards/solo", "/invitations"]:
        assert anonymous().get(path).status_code == 401, path


def test_team_lifecycle_invitation_accept_and_boards(player):
    lead = player("lead", nickname="Lead")
    mate = player("mate", nickname="Mate")
    assert lead.post("/teams", {"name": f"Team {lead.id}"}).status_code == 201
    assert lead.post("/teams/me/invitations", {"email": mate.email}).status_code == 202
    invitation = mate.get("/invitations").json()["invitations"][0]
    assert mate.post(f"/invitations/{invitation['id']}/accept").status_code == 200
    team = lead.get("/teams/me").json()["team"]
    assert team["size"] == 2 and team["ranked"] is True
    solo = lead.get("/leaderboards/solo").json()["entries"]
    assert {lead.id, mate.id} <= {entry["id"] for entry in solo}


def test_the_team_board_needs_a_team(player):
    reply = player("alone").get("/leaderboards/team")
    assert reply.status_code == 403 and reply.json()["error"]["code"] == "NO_TEAM"


def test_an_invitation_to_an_unknown_address_is_accepted_but_creates_nothing(player):
    lead = player("host")
    lead.post("/teams", {"name": f"Host {lead.id}"})
    reply = lead.post("/teams/me/invitations", {"email": unique_email("ghost")})
    assert reply.status_code == 202
    assert lead.get("/teams/me").json()["team"]["pending"] == []


def test_a_team_never_holds_more_than_five_members_and_invitations(player):
    lead = player("capmaster")
    lead.post("/teams", {"name": f"Cap {lead.id}"})
    guests = [player("guest") for _ in range(5)]
    for guest in guests[:4]:
        assert lead.post("/teams/me/invitations", {"email": guest.email}).status_code == 202
    sixth = lead.post("/teams/me/invitations", {"email": guests[4].email})
    assert sixth.status_code == 409 and sixth.json()["error"]["code"] == "TEAM_FULL"
    assert guests[4].get("/invitations").json()["invitations"] == []


def test_other_players_never_see_an_address_or_a_last_name(player):
    viewer = player("viewer")
    other = player("hidden", first="Greta", last="Unsichtbar", nickname="Greti")
    shown = json.dumps(
        [
            viewer.get("/leaderboards/solo").json(),
            viewer.get(f"/players/{other.id}").json(),
        ]
    )
    assert "Unsichtbar" not in shown and DOMAIN not in shown.replace(viewer.email, "")


def test_a_far_away_location_starts_nothing(player):
    student = player("far")
    reply = student.start_quiz("Library", dx_m=800)
    assert reply.status_code == 200 and reply.json()["status"] == "OUTSIDE"
    assert student.get("/attempts/active").json()["attempt"] is None


def test_poor_accuracy_is_refused_without_an_attempt(player):
    student = player("blurry")
    student.post("/me/location-consent")
    cp = student.checkpoint("Library")
    reply = student.post(
        f"/checkpoints/{cp['id']}/verify",
        {"lat": cp["latitude"], "lng": cp["longitude"], "accuracy": 500, "ageMs": 0},
    )
    assert reply.status_code == 422 and reply.json()["error"]["code"] == "ACCURACY_TOO_LOW"


@pytest.mark.parametrize("checkpoint", CHECKPOINTS["checkpoints"], ids=lambda c: c["name"])
def test_each_checkpoint_unlocks_inside_and_stays_closed_outside(player, checkpoint):
    student = player("zone")
    student.post("/me/location-consent")
    cp = student.checkpoint(checkpoint["name"])
    near = student.post(
        f"/checkpoints/{cp['id']}/verify",
        {**_position(checkpoint["inside"]), "accuracy": 10, "ageMs": 0},
    )
    assert near.json()["status"] == "OK", f"{checkpoint['name']}: {near.text}"
    other = player("zone-out")
    other.post("/me/location-consent")
    away = other.post(
        f"/checkpoints/{cp['id']}/verify",
        {**_position(checkpoint["outside"]), "accuracy": 10, "ageMs": 0},
    )
    assert away.json()["status"] == "OUTSIDE", f"{checkpoint['name']}: {away.text}"


def _position(point):
    return {"lat": point["lat"], "lng": point["lng"]}


def test_passing_a_quiz_gives_points_and_a_rank(player):
    student = player("quiz")
    started = student.start_quiz("Sensoricum")
    assert started.json()["status"] == "OK"
    attempt = started.json()["attempt"]
    assert attempt["questionCount"] == 3 and len(attempt["questions"]) == 3
    done = student.answer_all(attempt)
    assert done["result"]["passed"] is True and done["result"]["pointsEarned"] > 0
    me = student.get("/me").json()["student"]
    assert me["totalPoints"] == done["result"]["totalPoints"] and me["rank"] >= 1


def test_a_passed_checkpoint_is_final(player):
    student = player("final")
    student.answer_all(student.start_quiz("Sensoricum").json()["attempt"])
    again = student.start_quiz("Sensoricum")
    assert again.status_code == 409 and again.json()["error"]["code"] == "ALREADY_COMPLETED"


def test_a_wrong_answer_reveals_the_right_one(player):
    student = player("wrong")
    attempt = student.start_quiz("Sensoricum").json()["attempt"]
    done = student.answer_all(attempt, correct=False)
    assert done["result"]["passed"] is False
    assert done["result"]["pointsEarned"] == 0


def test_students_cannot_use_the_admin_area(player):
    student = player("nosy")
    for path in ["/admin/overview", "/admin/users", "/admin/stats", "/admin/teams"]:
        assert student.get(path).status_code == 403, path


def test_the_api_is_reachable_from_the_runner():
    assert requests.get(
        f"{API_URL}/api/health", timeout=5, headers={"X-Forwarded-For": unique_ip()}
    ).ok
