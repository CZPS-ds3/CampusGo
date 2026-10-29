"""Regression tests: one test for every bug that was found and fixed in this project.

Each name starts with the bug and names the business rule it protects. If one of these fails, an old
bug is back.
"""

import pytest

from conftest import Player, connect_db, query, unique_email

pytestmark = pytest.mark.api


def ceil_div(a, b):
    """Integer ceiling division."""
    return -(-a // b)


def make_team(lead, mates, name):
    """Lead creates a team and every mate accepts an invitation."""
    assert lead.post("/teams", {"name": name}).status_code == 201
    for mate in mates:
        assert lead.post("/teams/me/invitations", {"email": mate.email}).status_code == 202
        invitation = mate.get("/invitations").json()["invitations"][-1]
        assert mate.post(f"/invitations/{invitation['id']}/accept").status_code == 200


def test_bug_cass_was_blocked_because_it_contains_ass_br27(admin):
    for harmless in ["Cass", "Classic", "Scunthorpe", "Hancock", "Assistant"]:
        verdict = admin.post("/admin/names/test", {"text": harmless}).json()
        assert verdict["blockedBy"] is None, harmless
    for vulgar in ["Big Ass", "f.u.c.k", "5h1t", "Scheiße", "Arschloch"]:
        verdict = admin.post("/admin/names/test", {"text": vulgar}).json()
        assert verdict["blockedBy"], vulgar


def test_bug_open_invitations_did_not_count_towards_five_br32(player):
    lead = player("cap")
    mates = [player("m") for _ in range(2)]
    make_team(lead, mates, f"Cap {lead.id}")
    waiting = [player("w") for _ in range(3)]
    for guest in waiting[:2]:
        assert lead.post("/teams/me/invitations", {"email": guest.email}).status_code == 202
    sixth = lead.post("/teams/me/invitations", {"email": waiting[2].email})
    assert sixth.status_code == 409 and sixth.json()["error"]["code"] == "TEAM_FULL"


def test_bug_a_team_with_an_admin_was_ranked_br42(player, admin):
    pair = [player("a"), player("b")]
    make_team(pair[0], pair[1:], f"Students {pair[0].id}")
    staff = [player("s"), player("t")]
    make_team(admin, staff, f"Staff {admin.id}")
    team = staff[0].get("/teams/me").json()["team"]
    assert team["ranked"] is False and team["hasAdmin"] is True
    names = [entry["name"] for entry in pair[0].get("/leaderboards/team").json()["entries"]]
    assert f"Students {pair[0].id}" in names and f"Staff {admin.id}" not in names
    assert pair[0].get(f"/players/{staff[0].id}").json()["player"]["team"]["rank"] is None


def test_bug_team_score_must_be_the_average_rounded_up_br43(player):
    lead = player("avg")
    mates = [player("m") for _ in range(2)]
    name = f"Average {lead.id}"
    make_team(lead, mates, name)
    done = lead.answer_all(lead.start_quiz("Sensoricum").json()["attempt"])
    total = done["result"]["totalPoints"]
    board = lead.get("/leaderboards/team").json()["entries"]
    entry = next(e for e in board if e["name"] == name)
    assert entry["points"] == ceil_div(total, 3) and entry["members"] == 3
    result = done["result"]
    assert result["team"]["teamScoreAfter"] == ceil_div(total, 3)
    assert result["team"]["teamRankAfter"] >= 1


def test_bug_building_b_blocked_students_standing_a_little_outside_br12(player):
    student = player("lenient")
    reply = student.start_quiz("Building B", dy_m=70)
    assert reply.json()["status"] == "OK", reply.text
    far = player("too-far").start_quiz("Building B", dy_m=130)
    assert far.json()["status"] == "OUTSIDE"


def test_bug_deleting_an_account_must_free_the_address_and_never_hit_the_admin_br30(player, admin):
    leaver = player("leaver")
    address = leaver.email
    assert leaver.delete("/me").status_code == 204
    assert leaver.get("/me").status_code == 401
    again = Player(address).sign_in(first="New", last="Start")
    assert again.id != leaver.id
    assert admin.delete("/me").status_code == 403
    assert admin.delete(f"/admin/users/{admin.id}").status_code == 403


def test_bug_one_address_in_other_letters_made_a_second_account_br31(player):
    first = player("case")
    shouting = Player(first.email.upper()).sign_in()
    assert shouting.id == first.id


def test_bug_a_resent_code_must_work_br01():
    visitor = Player(unique_email("resend"))
    visitor.post("/auth/request-otp", {"email": visitor.email})
    visitor.post("/auth/request-otp", {"email": visitor.email})
    latest = visitor.get(f"/dev/last-otp?email={visitor.email}").json()["otp"]
    reply = visitor.post(
        "/auth/verify",
        {"email": visitor.email, "otp": latest, "firstName": "Re", "lastName": "Send"},
    )
    assert reply.status_code == 201


def test_bug_admin_points_could_not_be_reset_and_admin_was_ranked_br41(player, admin):
    admin.post("/me/reset-points")
    library = admin.checkpoint("Library")
    started = admin.post(
        f"/checkpoints/{library['id']}/verify", {"lat": 0, "lng": 0, "accuracy": 5000, "ageMs": 0}
    )
    assert started.json()["status"] == "OK"
    done = admin.answer_all(started.json()["attempt"])
    assert done["result"]["passed"] is True
    me = admin.get("/me").json()["student"]
    assert me["totalPoints"] > 0 and me["rank"] is None
    assert done["result"]["rankBefore"] is None
    board = player("watcher").get("/leaderboards/solo").json()["entries"]
    assert admin.id not in {entry["id"] for entry in board}
    assert admin.post("/me/reset-points").json() == {"totalPoints": 0}
    assert admin.get("/me").json()["student"]["totalPoints"] == 0
    assert player("plain").post("/me/reset-points").status_code == 403


def test_bug_points_must_follow_the_documented_formula_br14_to_br21(player):
    student = player("formula")
    student.answer_all(student.start_quiz("Sensoricum").json()["attempt"])
    connection = connect_db()
    try:
        row = query(
            connection,
            "SELECT * FROM attempts WHERE student_id = %s AND status = 'passed'",
            (student.id,),
        )[0]
    finally:
        connection.close()
    base = row["correct_count"] * 1000
    exact = (base + row["time_bonus"] + row["full_clear_bonus"]) * row["multiplier_percent"]
    assert row["points_earned"] == ceil_div(exact, 100)
    assert row["multiplier_percent"] == 100 and row["full_clear_bonus"] == 200


def test_bug_equal_scores_must_share_a_rank_br24(player):
    one, two = player("tie"), player("tie")
    connection = connect_db()
    try:
        for student in (one, two):
            query(
                connection,
                "UPDATE students SET total_points = 4242, points_exact_x100 = 424200 WHERE student_id = %s",
                (student.id,),
            )
    finally:
        connection.close()
    entries = {e["id"]: e for e in one.get("/leaderboards/solo").json()["entries"]}
    assert entries[one.id]["rank"] == entries[two.id]["rank"]
