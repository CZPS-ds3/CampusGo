"""Regression tests: one test for every bug that was found and fixed in this project.

Each name starts with the bug and names the business rule it protects. If one of these fails, an old
bug is back.
"""

import os
import shutil
import struct
import subprocess
import zlib

import pytest
import requests

from conftest import API_URL, DB_URL, ROOT, Player, connect_db, known_code, query, unique_email

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
    reply = student.start_quiz("Building B", dy_m=100)
    assert reply.json()["status"] == "OK", reply.text
    far = player("too-far").start_quiz("Building B", dy_m=170)
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
    latest = known_code(visitor.email)  # replaces the newest code, the one a resend must keep valid
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


def test_bug_a_multi_select_answer_with_a_missing_option_was_not_judged_exactly_br50(admin):
    """A subset of the right options must not count as correct (exact match only)."""
    body = {
        "name": f"TQ regression {unique_email('r')[:12]}",
        "mapLink": "https://www.google.com/maps/@49.1502,9.2201,19z",
        "questionCount": 3,
        "passThreshold": 2,
        "typeMode": "MULTI_ONLY",
    }
    quest = admin.post("/admin/checkpoints", body).json()["quest"]
    for number in range(3):
        options = [{"text": f"O{number}{n}", "isCorrect": n < 2} for n in range(4)]
        reply = admin.post(
            f"/admin/checkpoints/{quest['id']}/questions",
            {
                "questionText": f"Question {number}",
                "difficulty": "NORMAL",
                "questionType": "MULTI",
                "options": options,
            },
        )
        assert reply.status_code == 201, reply.text
    admin.request("PATCH", f"/admin/checkpoints/{quest['id']}", json={"isActive": True})
    admin.post("/me/location-consent")
    started = admin.post(
        f"/checkpoints/{quest['id']}/verify", {"lat": 0, "lng": 0, "accuracy": 10, "ageMs": 0}
    ).json()["attempt"]
    current = next(q for q in started["questions"] if q["number"] == started["currentQuestion"])
    connection = connect_db()
    try:
        right = [
            row["option_id"]
            for row in query(
                connection,
                "SELECT option_id FROM options WHERE question_id = %s AND is_correct = 1 "
                "ORDER BY option_id",
                (current["id"],),
            )
        ]
    finally:
        connection.close()
    partial = admin.post(f"/attempts/{started['id']}/answers", {"optionIds": right[:1]}).json()
    assert partial["correct"] is False and partial["correctOptionIds"] == right
    admin.post("/me/reset-points")
    admin.delete(f"/admin/checkpoints/{quest['id']}")


def test_bug_a_cancelled_invitation_could_still_be_accepted_br45(player):
    lead, guest = player("cancel-lead"), player("cancel-guest")
    assert lead.post("/teams", {"name": f"Cancel {lead.id}"}).status_code == 201
    assert lead.post("/teams/me/invitations", {"email": guest.email}).status_code == 202
    invitation = guest.get("/invitations").json()["invitations"][-1]
    pending = lead.get("/teams/me").json()["team"]["pending"][0]
    assert lead.post(f"/teams/me/invitations/{pending['id']}/cancel").status_code == 200
    assert guest.post(f"/invitations/{invitation['id']}/accept").status_code >= 400
    assert guest.get("/teams/me").json()["team"] is None


def test_bug_a_deleted_account_still_showed_up_as_a_deleted_status_br47(admin, player):
    student = player("vanish")
    admin.delete(f"/admin/users/{student.id}")
    listed = admin.get("/admin/users?limit=200").json()["users"]
    assert student.id not in [user["id"] for user in listed]
    assert admin.get(f"/admin/users/{student.id}").status_code == 404
    # The address is free again, so signing in starts a brand-new account.
    assert Player(student.email).sign_in().id != student.id


def test_bug_a_promoted_admin_had_to_log_in_again_to_get_the_admin_area_br53(admin, player):
    person = player("promoted")
    admin.post(f"/admin/users/{person.id}/role", {"role": "admin"})
    assert person.get("/admin/users").status_code == 200
    admin.post(f"/admin/users/{person.id}/role", {"role": "student"})
    assert person.get("/admin/users").status_code == 403


def test_bug_a_student_at_the_checkpoint_with_a_weak_signal_was_turned_away_br12(player):
    student = player("weak-signal")
    reply = student.start_quiz("Mensa", accuracy=150)
    assert reply.json()["status"] == "OK", reply.text


def tiny_png():
    """A valid 2x2 PNG made without any image library (sharp on the server re-encodes it)."""

    def chunk(kind, data):
        body = kind + data
        return struct.pack(">I", len(data)) + body + struct.pack(">I", zlib.crc32(body))

    raw = b"".join(b"\x00" + b"\xff\x00\x00" * 2 for _ in range(2))
    header = struct.pack(">IIBBBBB", 2, 2, 8, 2, 0, 0, 0)
    return (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", header)
        + chunk(b"IDAT", zlib.compress(raw))
        + chunk(b"IEND", b"")
    )


def upload_picture(student):
    """Uploads a profile picture as the sign-up page does and returns the stored address."""
    reply = student.request(
        "POST", "/me/picture", files={"file": ("me.png", tiny_png(), "image/png")}
    )
    assert reply.status_code == 200, reply.text
    return reply.json()["pictureUrl"]


def test_bug_the_sign_up_picture_did_not_show_and_old_files_piled_up_br02(player):
    student = player("picture")
    first = upload_picture(student)
    assert student.get("/me").json()["student"]["pictureUrl"] == first
    assert requests.get(f"{API_URL}{first}", timeout=15).status_code == 200
    second = upload_picture(student)
    assert second != first
    assert student.get("/me").json()["student"]["pictureUrl"] == second
    # The replaced picture is deleted from the disk, the new one is served.
    assert requests.get(f"{API_URL}{first}", timeout=15).status_code == 404
    assert requests.get(f"{API_URL}{second}", timeout=15).status_code == 200


def test_bug_deleting_a_quest_made_the_app_fail_br49(admin, player):
    student = player("after-delete")
    body = {
        "name": f"TQ Regress {unique_email()[7:13]}",
        "description": "Deleted at once.",
        "mapLink": "https://www.google.com/maps/@49.1504,9.2204,19z",
        "radius": 40,
        "questionCount": 3,
        "passThreshold": 2,
    }
    quest = admin.post("/admin/checkpoints", body).json()["quest"]
    assert admin.delete(f"/admin/checkpoints/{quest['id']}").status_code == 200
    for path in ["/admin/stats", "/admin/overview", "/admin/checkpoints", "/admin/users"]:
        assert admin.get(path).status_code == 200, path
    for path in ["/checkpoints", "/leaderboards/solo", "/me"]:
        assert student.get(path).status_code == 200, path


def test_bug_the_seed_undid_admin_quest_changes_and_stopped_the_api_br49(admin, db):
    """`npm run dev` seeds on every start. An admin-set time limit made the old seed fail (CHECK)."""
    cas = query(db, "SELECT * FROM checkpoints WHERE checkpoint_name = 'CAS Cafe'")[0]
    try:
        changed = admin.patch(
            f"/admin/checkpoints/{cas['checkpoint_id']}",
            {"questionCount": 1, "passThreshold": 1, "timeLimitSeconds": 20},
        )
        assert changed.status_code == 200, changed.text
        env = {**os.environ, "NODE_ENV": "development", "DATABASE_URL": DB_URL}
        seed = subprocess.run(
            [shutil.which("node") or "node", str(ROOT / "backend" / "src" / "db" / "seed.js")],
            env=env,
            capture_output=True,
            text=True,
            timeout=120,
            check=False,
        )
        assert seed.returncode == 0, seed.stderr
        after = query(db, "SELECT * FROM checkpoints WHERE checkpoint_name = 'CAS Cafe'")[0]
        assert (after["question_count"], after["time_limit_seconds"]) == (1, 20)
    finally:
        admin.patch(
            f"/admin/checkpoints/{cas['checkpoint_id']}",
            {
                "questionCount": cas["question_count"],
                "passThreshold": cas["pass_threshold"],
                "timeLimitSeconds": cas["time_limit_seconds"],
            },
        )


def test_bug_the_admin_user_list_scrolled_sideways_on_phones_after_a_deletion_br47():
    """`a.card { display: flex }` outranked `.admin-user { display: grid }`: the name and the stats line sat side
    by side, and a long name pushed the page wider than a phone (seen after deleting an account)."""
    css = (ROOT / "frontend" / "src" / "styles" / "screens.css").read_text(encoding="utf-8")
    rule = css.split(".admin-list .admin-user {", 1)[1].split("}", 1)[0]
    assert "display: grid" in rule
    assert "grid-template-columns: minmax(0, 1fr)" in rule


def test_bug_the_test_runner_started_the_whole_docker_app_and_blocked_npm_run_dev_br55():
    """`docker compose up -d --wait` without a service name started the API and web containers too."""
    runner = (ROOT / "tests" / "run-all.mjs").read_text(encoding="utf-8")
    assert "docker compose up -d --wait mysql" in runner
    assert "'docker compose up -d --wait'" not in runner
