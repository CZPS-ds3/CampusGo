"""Integration tests over real HTTP for the 2026-11-10 changes.

BR54 leaving a team and the team order, BR52 the OTP code preview switch, BR49 deleting quests without
breaking the app (regression for the "proxy error after a checkpoint was deleted" report).
"""

import pytest

from conftest import Player, unique_email

pytestmark = pytest.mark.api

QUEST_LINK = "https://www.google.com/maps/@49.1503,9.2203,19z"


def make_team(lead, mates, name):
    """Lead creates a team and every mate accepts an invitation, in this order."""
    assert lead.post("/teams", {"name": name}).status_code == 201
    for mate in mates:
        assert lead.post("/teams/me/invitations", {"email": mate.email}).status_code == 202
        invitation = mate.get("/invitations").json()["invitations"][-1]
        assert mate.post(f"/invitations/{invitation['id']}/accept").status_code == 200
    return lead.get("/teams/me").json()["team"]


def team_name(prefix):
    """A unique team name of at most 30 characters."""
    return f"{prefix} {unique_email()[7:15]}"


# ----- BR54 leaving a team and the team order -----


def test_br54_a_leader_who_leaves_hands_the_team_to_the_next_member(player):
    lead, amy, ben = player("lead"), player("amy"), player("ben")
    make_team(lead, [amy, ben], team_name("Hand"))
    assert lead.post("/teams/me/leave").status_code == 200
    assert lead.get("/teams/me").json()["team"] is None
    team = amy.get("/teams/me").json()["team"]
    assert team["leaderId"] == amy.id
    assert [(m["id"], m["position"]) for m in team["members"]] == [(amy.id, 1), (ben.id, 2)]
    # The new leader has the leader rights at once; the other member does not.
    assert ben.delete(f"/teams/me/members/{amy.id}").json()["error"]["code"] == "NOT_LEADER"
    assert amy.delete(f"/teams/me/members/{ben.id}").status_code == 200


def test_br54_the_last_member_leaving_deletes_the_team(player):
    lead = player("solo")
    name = team_name("Last")
    make_team(lead, [], name)
    assert lead.post("/teams/me/leave").status_code == 200
    assert lead.post("/teams/me/leave").json()["error"]["code"] == "NO_TEAM"
    assert player("next").post("/teams", {"name": name}).status_code == 201


def test_br54_an_admin_sets_the_leader_and_the_order(admin, player):
    lead, amy, ben = player("lead"), player("amy"), player("ben")
    team = make_team(lead, [amy, ben], team_name("Order"))
    reply = admin.put(f"/admin/teams/{team['id']}/leader", {"studentId": ben.id})
    assert reply.status_code == 204, reply.text
    assert lead.get("/teams/me").json()["team"]["leaderId"] == ben.id
    order = [amy.id, ben.id, lead.id]
    assert admin.put(f"/admin/teams/{team['id']}/order", {"studentIds": order}).status_code == 204
    listed = next(t for t in admin.get("/admin/teams").json()["teams"] if t["id"] == team["id"])
    assert [m["id"] for m in listed["members"]] == order
    # The leader (ben) leaves: the first in the new order (amy) takes over.
    assert ben.post("/teams/me/leave").status_code == 200
    assert lead.get("/teams/me").json()["team"]["leaderId"] == amy.id
    wrong = admin.put(f"/admin/teams/{team['id']}/order", {"studentIds": [lead.id]})
    assert wrong.status_code == 400 and wrong.json()["error"]["code"] == "ORDER_MISMATCH"


def test_br54_students_cannot_choose_the_leader_or_the_order(player):
    lead, amy = player("lead"), player("amy")
    team = make_team(lead, [amy], team_name("Rights"))
    assert lead.put(f"/admin/teams/{team['id']}/leader", {"studentId": amy.id}).status_code == 403
    order = {"studentIds": [amy.id, lead.id]}
    assert lead.put(f"/admin/teams/{team['id']}/order", order).status_code == 403


# ----- BR52 the OTP code preview switch -----


def test_br52_the_test_inbox_shows_the_emailed_code_only_while_the_admin_switch_is_on(admin):
    visitor = Player(unique_email("preview"))
    try:
        reply = admin.put("/admin/settings", {"otpPreview": True})
        assert reply.status_code == 200 and reply.json()["settings"]["otpPreview"] is True
        assert visitor.get("/auth/config").json()["otpPreview"] is True
        assert visitor.post("/auth/request-otp", {"email": visitor.email}).status_code == 200
        code = visitor.post("/auth/otp-preview", {"email": visitor.email}).json()["otp"]
        body = {"email": visitor.email, "otp": code, "firstName": "Pre", "lastName": "View"}
        assert visitor.post("/auth/verify", body).status_code == 201
    finally:
        assert admin.put("/admin/settings", {"otpPreview": False}).status_code == 200
    late = Player(unique_email("hidden"))
    late.post("/auth/request-otp", {"email": late.email})
    hidden = late.post("/auth/otp-preview", {"email": late.email})
    assert hidden.status_code == 404 and hidden.json()["error"]["code"] == "PREVIEW_OFF"
    assert "otp" not in hidden.json()


def test_br52_only_an_admin_reads_or_changes_the_switch(player):
    student = player("plain")
    assert student.get("/admin/settings").status_code == 403
    assert student.put("/admin/settings", {"otpPreview": True}).status_code == 403


# ----- BR49 deleting quests never breaks the app -----


def new_quest(admin, prefix):
    """An active admin quest with three MCQ questions."""
    body = {
        "name": f"TQ {prefix} {unique_email()[7:13]}",
        "description": "Made by an API test.",
        "mapLink": QUEST_LINK,
        "radius": 40,
        "questionCount": 3,
        "passThreshold": 2,
    }
    reply = admin.post("/admin/checkpoints", body)
    assert reply.status_code == 201, reply.text
    quest = reply.json()["quest"]
    for number in range(3):
        options = [{"text": f"Option {n}", "isCorrect": n == 0} for n in range(4)]
        added = admin.post(
            f"/admin/checkpoints/{quest['id']}/questions",
            {
                "questionText": f"Q{number}",
                "difficulty": "NORMAL",
                "questionType": "MCQ",
                "options": options,
            },
        )
        assert added.status_code == 201, added.text
    return quest


STUDENT_PAGES = ["/me", "/checkpoints", "/teams/me", "/invitations", "/leaderboards/solo"]
ADMIN_PAGES = [
    "/admin/stats",
    "/admin/overview",
    "/admin/users",
    "/admin/teams",
    "/admin/checkpoints",
    "/admin/settings",
]


def assert_every_page_answers(student, admin):
    """No page a student or an admin opens may answer with a server error."""
    for path in STUDENT_PAGES + [f"/players/{student.id}"]:
        reply = student.get(path)
        assert reply.status_code < 500, (path, reply.text)
    for path in ADMIN_PAGES:
        reply = admin.get(path)
        assert reply.status_code == 200, (path, reply.text)


def test_br49_erasing_and_archiving_quests_keeps_every_page_working(admin, player):
    student = player("stays")
    unplayed = new_quest(admin, "Erase")
    assert admin.delete(f"/admin/checkpoints/{unplayed['id']}").json() == {"result": "erased"}
    assert_every_page_answers(student, admin)

    played = new_quest(admin, "Archive")
    activated = admin.patch(f"/admin/checkpoints/{played['id']}", {"isActive": True})
    assert activated.status_code == 200, activated.text
    # An admin test run counts as play (test mode starts anywhere), so the quest is archived.
    started = admin.post(
        f"/checkpoints/{played['id']}/verify",
        {"lat": 49.1503, "lng": 9.2203, "accuracy": 10, "ageMs": 0},
    )
    assert started.status_code == 200, started.text
    assert admin.delete(f"/admin/checkpoints/{played['id']}").json() == {"result": "archived"}
    assert_every_page_answers(student, admin)
    names = {c["name"] for c in student.get("/checkpoints").json()["checkpoints"]}
    assert played["name"] not in names and unplayed["name"] not in names
    stale = student.post(
        f"/checkpoints/{unplayed['id']}/verify",
        {"lat": 49.1503, "lng": 9.2203, "accuracy": 10, "ageMs": 0},
    )
    assert stale.status_code == 404 and stale.json()["error"]["code"] == "NOT_AVAILABLE"
