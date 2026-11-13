"""Regression tests: one test for every bug that was found and fixed in this project.

Each name starts with the bug and names the business rule it protects. If one of these fails, an old
bug is back.
"""

import json
import os
import re
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
        # The test database keeps the placeholder questions the other suites rely on: mark the team's question bank
        # as already seeded, so this run checks only that the seed leaves the admin's quest values alone.
        query(
            db,
            "INSERT INTO app_settings (setting_key, setting_value, updated_at) "
            "VALUES ('question_bank_v1', 'true', UTC_TIMESTAMP(3)) "
            "ON DUPLICATE KEY UPDATE setting_value = 'true'",
        )
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


def test_bug_a_client_could_fake_its_ip_and_skip_the_login_rate_limits_br01():
    """The production port listened everywhere and the API trusted two X-Forwarded-For hops, so anyone who reached
    the port directly could send a new made-up IP with every request and guess login codes without a limit.
    """
    nginx = (ROOT / "frontend" / "nginx.conf").read_text(encoding="utf-8")
    assert "$proxy_add_x_forwarded_for" not in nginx
    assert nginx.count("proxy_set_header X-Forwarded-For $remote_addr;") == 2
    assert "include /etc/nginx/trusted-proxies.conf;" in nginx and "real_ip_recursive off;" in nginx
    compose = (ROOT / "docker-compose.prod.yml").read_text(encoding="utf-8")
    assert "TRUST_PROXY: '1'" in compose and "TRUST_PROXY: ${TRUST_PROXY:-2}" not in compose
    assert "TRUSTED_PROXIES: ${TRUSTED_PROXIES:?" in compose
    assert "'${HTTP_BIND:-0.0.0.0}:${HTTP_PORT:-8080}:80'" in compose


def test_bug_the_api_container_got_the_mysql_root_password_br22():
    """`env_file: .env.production` handed every production setting to the API, the database root password too."""
    compose = (ROOT / "docker-compose.prod.yml").read_text(encoding="utf-8")
    backend = compose.split("\n  backend:\n", 1)[1].split("\n  web:\n", 1)[0]
    assert "env_file" not in backend
    assert "MYSQL_ROOT_PASSWORD" not in backend


def test_bug_production_had_no_database_backup_br11():
    """Risk R13 (project handbook) asked for a database backup before the pilot; there was none."""
    script = (ROOT / "scripts" / "backup-prod.sh").read_text(encoding="utf-8")
    assert "mysqldump" in script and "tar -C /app/backend/uploads" in script
    assert "\r" not in script, "the Ubuntu server needs LF line endings"
    readme = (ROOT / "README.md").read_text(encoding="utf-8")
    assert "bash scripts/backup-prod.sh" in readme


def test_bug_placeholder_questions_could_go_live_without_any_warning_br11(admin):
    """The seed fills every pilot quest with PLACEHOLDER questions; nobody was told they were still live."""
    placeholders = admin.get("/admin/stats").json()["placeholders"]
    assert set(placeholders) == {"questions", "facts", "quests"}
    assert isinstance(placeholders["questions"], int) and isinstance(placeholders["facts"], int)
    if placeholders["quests"]:
        assert placeholders["questions"] + placeholders["facts"] > 0
    index = (ROOT / "backend" / "index.js").read_text(encoding="utf-8")
    assert "placeholderWarning" in index


def test_bug_the_merge_left_two_stacked_doc_comments_in_the_seed_br37():
    """After the merge of the two admin designs the old doc comment stayed above the new one in seed.js."""
    seed = (ROOT / "backend" / "src" / "db" / "seed.js").read_text(encoding="utf-8")
    assert "*/\n/**" not in seed


def test_bug_the_first_location_check_timed_out_on_the_small_phone_br12():
    """The first "Locked on!" of a browser test took longer than the usual 10 s on a cold phone-360 browser."""
    helpers = (ROOT / "frontend" / "e2e" / "helpers.js").read_text(encoding="utf-8")
    assert "export const LOCK_ON_TIMEOUT = 25_000;" in helpers
    for name in ("helpers.js", "flow.spec.js"):
        text = (ROOT / "frontend" / "e2e" / name).read_text(encoding="utf-8")
        assert "getByText('Locked on!')).toBeVisible();" not in text, name


def test_bug_the_real_seed_still_filled_the_quests_with_placeholder_questions_br11():
    """The CLI seed put PLACEHOLDER questions into every pilot quest; now it loads the team's question bank."""
    seed = (ROOT / "backend" / "src" / "db" / "seed.js").read_text(encoding="utf-8")
    main = seed.split("if (process.argv[1] === fileURLToPath(import.meta.url))", 1)[1]
    assert "seedQuestionBank(pool)" in main
    assert "seedPlaceholderQuestions" not in main
    bank = (ROOT / "backend" / "src" / "db" / "question-bank.js").read_text(encoding="utf-8")
    assert "PLACEHOLDER" not in bank
    assert bank.count("q(") >= 69


def test_bug_a_question_photo_must_not_give_the_answer_away_before_answering_br14(player, db):
    """Photos that show the answer (a room sign, a price tag) may only appear after the question is answered."""
    student = player("photos")
    checkpoint = student.checkpoint("Campus Garden")
    questions = query(
        db,
        "SELECT question_id FROM questions WHERE checkpoint_id = %s AND is_active = 1",
        (checkpoint["id"],),
    )
    try:
        for row in questions:
            query(
                db,
                "INSERT INTO question_images (question_id, position, url, alt_text, credit, shown) "
                "VALUES (%s, 1, '/quests/t/needed.jpg', 'needed', 'team', 'question'), "
                "(%s, 2, '/quests/t/answer.jpg', 'answer', 'team', 'answer')",
                (row["question_id"], row["question_id"]),
            )
        reply = student.start_quiz("Campus Garden")
        assert reply.status_code == 200, reply.text
        attempt = reply.json()["attempt"]
        assert "answer.jpg" not in str(attempt)
        assert attempt["questions"][0]["images"][0]["url"] == "/quests/t/needed.jpg"
        body = student.answer_all(attempt, correct=False)
        assert all(
            q["answerImages"][0]["url"] == "/quests/t/answer.jpg"
            for q in body["attempt"]["questions"]
        )
    finally:
        for row in questions:
            query(db, "DELETE FROM question_images WHERE question_id = %s", (row["question_id"],))


def run_node(script):
    """Runs an ES module snippet with Node from the repository root and returns its printed JSON."""
    node = shutil.which("node")
    assert node, "Node.js is needed for this test"
    done = subprocess.run(
        [node, "--input-type=module", "-e", script],
        cwd=ROOT,
        capture_output=True,
        text=True,
        timeout=60,
        check=False,
    )
    assert done.returncode == 0, done.stderr
    return json.loads(done.stdout)


def test_bug_distances_were_measured_on_a_sphere_instead_of_the_gps_ellipsoid_br12():
    """A sphere is 0.3 % short east-west at Heilbronn: a reading 120.2 m east of a 120 m edge was let in."""
    values = run_node(
        "import { distanceMeters } from './backend/src/services/geo.js';"
        "import { distanceM } from './frontend/src/geo.js';"
        "console.log(JSON.stringify([distanceMeters(0, 0, 0, 1), distanceMeters(0, 0, 1, 0),"
        " distanceM([0, 0], [0, 1]), distanceM([0, 0], [1, 0])]));"
    )
    assert abs(values[0] - 111319.491) < 0.001 and abs(values[2] - 111319.491) < 0.001
    assert abs(values[1] - 110574.389) < 0.001 and abs(values[3] - 110574.389) < 0.001
    mock = (ROOT / "frontend" / "src" / "api" / "mock.js").read_text(encoding="utf-8")
    assert "6371008.8" not in mock, "the mock API must measure like the server"


def test_bug_the_location_check_sent_one_jittery_reading_instead_of_an_average_br12():
    """Only the single most precise reading was sent; now precise readings are averaged and outliers dropped."""
    sample = run_node(
        "import { combineReadings } from './frontend/src/hooks/useGeolocation.js';"
        "const m = 1 / 111250;"
        "const r = (north, accuracy) => ({ latitude: 49.1 + north * m, longitude: 9.2, accuracy, takenAt: 0 });"
        "const s = combineReadings([r(6, 10), r(-6, 10), r(5, 10), r(-5, 10), r(80, 12)], 0, 0);"
        "console.log(JSON.stringify({ north: (s.latitude - 49.1) / m, accuracy: s.accuracy }));"
    )
    assert abs(sample["north"]) < 1, sample
    assert (
        sample["accuracy"] == 10
    ), "the accuracy sent is never better than the best single reading"


def test_bug_a_gps_fix_delivered_twice_made_the_live_position_look_more_precise_br12():
    """The live map counted a repeated or older fix again, so its accuracy ring shrank without new evidence."""
    same = run_node(
        "import { fuseFix } from './frontend/src/hooks/useLiveLocation.js';"
        "const fix = (north, time) => ({ lat: 49.1 + north / 111250, lng: 9.2, accuracy: 5, time,"
        " speed: null, heading: null });"
        "const shown = fuseFix(fuseFix(null, fix(0, 0)), fix(2, 1000));"
        "console.log(JSON.stringify([fuseFix(shown, fix(2, 1000)) === shown,"
        " fuseFix(shown, fix(30, 500)) === shown]));"
    )
    assert same == [True, True]


def test_bug_the_weak_signal_answer_came_after_the_browser_test_stopped_waiting_br12():
    """A coarse reading waits out the 8 s measuring window; the browser test gave up at 10 s on a busy machine."""
    hook = (ROOT / "frontend" / "src" / "hooks" / "useGeolocation.js").read_text(encoding="utf-8")
    assert "const GPS_WINDOW_MS = 8000;" in hook
    flow = (ROOT / "frontend" / "e2e" / "flow.spec.js").read_text(encoding="utf-8")
    assert "getByText('Weak signal')).toBeVisible({ timeout: LOCK_ON_TIMEOUT });" in flow


def test_bug_a_browser_test_page_was_overwritten_by_the_login_redirect_br01():
    """open() pushed its page before the app landed on the map or the login page, so it was replaced."""
    helpers = (ROOT / "frontend" / "e2e" / "helpers.js").read_text(encoding="utf-8")
    body = helpers.split("export async function open(page, path) {", 1)[1].split("\n}\n", 1)[0]
    goto = body.index("page.goto('/map')")
    assert body.index('[aria-busy="true"]\')).toHaveCount(0)', goto) < body.index("pushState")


def test_bug_the_carousel_browser_test_used_a_gallery_that_now_has_one_photo_br07():
    """The Mensa gallery became one team photo, so a browser test that stepped through two of them failed; the
    page clock also ran on by itself, so the 5 s timer could fire once too often on a busy machine.
    """
    places = json.loads(
        (ROOT / "frontend" / "src" / "api" / "places.json").read_text(encoding="utf-8")
    )
    spec = (ROOT / "frontend" / "e2e" / "round3.spec.js").read_text(encoding="utf-8")
    test = spec.split("test.describe('place photos'", 1)[1].split("test.describe(", 1)[0]
    assert "/Photos of Library/" in test and "of 9`" in test
    assert test.index("document.activeElement?.blur()") < test.index("page.clock.fastForward(")
    assert len(places["library"]) == 9


def test_bug_the_live_ball_stayed_still_while_the_phone_sent_no_new_reading_br12():
    """The browser's watch can stay quiet for a long time; the ball must get a reading at least every 3 seconds."""
    values = run_node(
        "import { ASK_AHEAD_MS, REFRESH_MS } from './frontend/src/hooks/useLiveLocation.js';"
        "console.log(JSON.stringify([REFRESH_MS, ASK_AHEAD_MS]));"
    )
    assert values[0] == 3000 and 0 < values[1] < values[0]
    hook = (ROOT / "frontend" / "src" / "hooks" / "useLiveLocation.js").read_text(encoding="utf-8")
    assert "document.hidden" in hook
    # A one-off reading cannot be cancelled and, with a simulated position, blocked the next location check.
    assert "getCurrentPosition(" not in hook


def test_bug_the_ball_colour_could_not_be_changed_br48(player):
    """The live-position ball was always white and red, whatever map style the student chose."""
    student = player("ball-colour")
    reply = student.request("PUT", "/me/map-style", json={"ball": {"body": "#222222"}})
    assert reply.status_code == 200, reply.text
    css = (ROOT / "frontend" / "src" / "styles" / "screens.css").read_text(encoding="utf-8")
    assert "fill: var(--puck-body, #fff);" in css
    assert "stroke: var(--puck-lines, var(--signal));" in css


def test_bug_the_read_first_page_showed_placeholder_facts_instead_of_answers_br09():
    """Students read "PLACEHOLDER fact 1"; now every pilot quest has facts that answer its normal questions."""
    info = run_node(
        "import { QUEST_INFO } from './backend/src/db/question-bank.js';"
        "console.log(JSON.stringify(QUEST_INFO));"
    )
    assert len(info) == 8
    for name, quest in info.items():
        assert 1 <= len(quest["facts"]) <= 5, name
        assert all(len(fact) <= 300 for fact in quest["facts"]), name
        assert "PLACEHOLDER" not in quest["description"] + " ".join(quest["facts"]), name
    seed = (ROOT / "backend" / "src" / "db" / "seed.js").read_text(encoding="utf-8")
    main = seed.split("if (process.argv[1] === fileURLToPath(import.meta.url))", 1)[1]
    assert "seedQuestContent(pool)" in main
    assert "seedPlaceholderFacts" not in main
    mock = (ROOT / "frontend" / "src" / "api" / "mock.js").read_text(encoding="utf-8")
    assert "PLACEHOLDER fact" not in mock and "placeholder answer" not in mock


def test_bug_the_two_multi_select_questions_of_the_bank_were_never_drawn_br50():
    """Library and Building B were single choice only, so their multi-select questions never came up."""
    seed = (ROOT / "backend" / "src" / "db" / "seed.js").read_text(encoding="utf-8")
    assert "SET type_mode = 'MIXED'" in seed
    assert "q.question_type = 'MULTI'" in seed
    mock = (ROOT / "frontend" / "src" / "api" / "mock.js").read_text(encoding="utf-8")
    assert "q.type === 'MULTI' && q.difficulty === 'NORMAL'" in mock


def test_r66_the_countdown_does_not_eat_quiz_time_br13():
    """R-66 (new, no bug): the countdown runs before the quiz; the deadline moves back by it, no second lost."""
    quiz = (ROOT / "backend" / "src" / "services" / "quiz.js").read_text(encoding="utf-8")
    assert "const expires = start + seconds * 1000;" in quiz
    assert "QUIZ_NOT_STARTED" in quiz
    config = run_node(
        "import { loadConfig } from './backend/src/config.js';"
        "console.log(JSON.stringify(loadConfig({}).quizCountdownSeconds));"
    )
    assert config == 3


def test_bug_the_ball_stopped_between_readings_and_missed_small_moves_br12():
    """The ball hopped for 350 ms after each reading, then stood still; now it follows every frame and walks on."""
    pins = (ROOT / "frontend" / "src" / "map-pins.js").read_text(encoding="utf-8")
    assert "export function createFollower" in pins
    assert "export function glide" not in pins
    for name in ("MapView.jsx", "MapView3D.jsx"):
        view = (ROOT / "frontend" / "src" / "components" / name).read_text(encoding="utf-8")
        assert "follower.moveTo(point, latest.current.me?.velocity)" in view, name
    values = run_node(
        "import { fuseFix } from './frontend/src/hooks/useLiveLocation.js';"
        "const fix = (n, s) => ({ lat: 49.148 + n / 111320, lng: 9.216, accuracy: 5,"
        " time: s * 1000, speed: null, heading: null });"
        "let shown = null; for (let s = 0; s <= 10; s += 1) shown = fuseFix(shown, fix(0, s));"
        "shown = fuseFix(shown, fix(1, 11));"
        "console.log(JSON.stringify((shown.lat - 49.148) * 111320));"
    )
    assert values > 0.6, "a 1 m step must show at least 60 % after one reading"


def test_bug_the_pipeline_docker_check_missed_required_production_settings_br52():
    """The docker-config job failed: docker-compose.prod.yml needs more settings than the CI dummy file gave."""
    compose = (ROOT / "docker-compose.prod.yml").read_text(encoding="utf-8")
    required = set(re.findall(r"\$\{([A-Z_]+):\?", compose))
    assert {"PUBLIC_URL", "SESSION_SECRET", "OTP_SECRET", "TRUSTED_PROXIES"} <= required
    pipeline = (ROOT / ".gitlab-ci.yml").read_text(encoding="utf-8")
    dummy = next(line for line in pipeline.splitlines() if "> .env.production" in line)
    given = set(re.findall(r"(?:'|\\n)([A-Z_]+)=", dummy))
    assert required <= given, f"missing in the CI dummy .env.production: {sorted(required - given)}"
