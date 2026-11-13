"""Database tests: schema, constraints, reference data and privacy of the stored data (test database)."""

import pytest
import pymysql

from conftest import ADMIN_EMAILS, MAIN_ADMIN_EMAIL, query

pytestmark = pytest.mark.db

TABLES = {
    "students",
    "teams",
    "team_invitations",
    "sessions",
    "otp_codes",
    "checkpoints",
    "checkpoint_facts",
    "checkpoint_images",
    "question_images",
    "questions",
    "options",
    "attempts",
    "attempt_questions",
    "attempt_answers",
    "location_checks",
    "scoring_multiplier",
    "bonus",
    "difficulty",
    "audit_events",
    "banned_terms",
    "schema_migrations",
}


def test_every_expected_table_exists(db):
    found = {next(iter(row.values())) for row in query(db, "SHOW TABLES")}
    assert TABLES <= found, f"missing: {sorted(TABLES - found)}"


def test_all_migrations_ran_in_order(db):
    names = [row["name"] for row in query(db, "SELECT name FROM schema_migrations ORDER BY name")]
    numbers = [int(name[:3]) for name in names]
    assert numbers == list(range(1, len(numbers) + 1)) and len(numbers) >= 10


def test_one_e_mail_can_belong_to_one_account_only(db):
    indexes = query(
        db,
        "SELECT non_unique FROM information_schema.statistics "
        "WHERE table_schema = DATABASE() AND table_name = 'students' AND column_name = 'email'",
    )
    assert indexes and all(index["non_unique"] == 0 for index in indexes)
    with pytest.raises(pymysql.err.IntegrityError):
        for _ in range(2):
            query(
                db,
                "INSERT INTO students (email, first_name, last_name, points_updated_at, created_at) "
                "VALUES ('duplicate-check@heilbronn.dhbw.de', 'A', 'B', NOW(3), NOW(3))",
            )
    query(db, "DELETE FROM students WHERE email = 'duplicate-check@heilbronn.dhbw.de'")


def test_the_administrators_exist_from_the_start_the_main_one_as_id_one(db):
    """BR37: every pre-seeded admin exists; the study office is id 1."""
    rows = query(db, "SELECT email, role, status FROM students WHERE role = 'admin'")
    assert {row["email"] for row in rows} == ADMIN_EMAILS
    assert all(row["status"] == "active" for row in rows)
    mail = query(db, "SELECT email FROM students WHERE student_id = 1")[0]["email"]
    assert mail == MAIN_ADMIN_EMAIL


def test_the_eight_pilot_checkpoints_have_sensible_geofences(db):
    rows = query(db, "SELECT * FROM checkpoints")
    assert len(rows) == 8
    for row in rows:
        assert 49.10 < float(row["latitude"]) < 49.20, row["checkpoint_name"]
        assert 9.15 < float(row["longitude"]) < 9.30, row["checkpoint_name"]
        assert 25 <= row["radius"] <= 150, row["checkpoint_name"]
        assert 1 <= row["question_count"] <= 10, row["checkpoint_name"]
        assert 1 <= row["pass_threshold"] <= row["question_count"], row["checkpoint_name"]
        assert row["type_mode"] in ("MCQ_ONLY", "MULTI_ONLY", "MIXED")


def test_points_and_multipliers_live_in_tables_not_in_code(db):
    difficulty = {
        r["difficulty"]: r["points_awarded"] for r in query(db, "SELECT * FROM difficulty")
    }
    bonus = {r["bonus_type"]: r["points_awarded"] for r in query(db, "SELECT * FROM bonus")}
    multipliers = [
        r["percentage"]
        for r in query(db, "SELECT * FROM scoring_multiplier ORDER BY attempt_number")
    ]
    assert difficulty == {"NORMAL": 1000, "HARD": 2000}
    assert bonus == {"TIME": 1, "FULL_CLEAR": 200}
    assert multipliers == [100, 85, 70, 55, 40, 0]


def test_every_question_has_four_options_and_the_right_number_of_right_answers(db):
    """BR50: single choice has exactly one right option, multi-select has two or three."""
    broken = query(
        db,
        "SELECT q.question_id FROM questions q JOIN options o ON o.question_id = q.question_id "
        "GROUP BY q.question_id HAVING COUNT(*) <> 4 "
        "OR (MAX(q.question_type) = 'MCQ' AND SUM(o.is_correct) <> 1) "
        "OR (MAX(q.question_type) = 'MULTI' AND SUM(o.is_correct) NOT BETWEEN 2 AND 3)",
    )
    assert broken == []


def test_a_quest_cannot_have_a_pass_mark_above_its_question_count(db):
    with pytest.raises(pymysql.err.OperationalError):
        query(
            db, "UPDATE checkpoints SET pass_threshold = question_count + 1 WHERE checkpoint_id = 1"
        )
    with pytest.raises(pymysql.err.OperationalError):
        query(db, "UPDATE checkpoints SET question_count = 11 WHERE checkpoint_id = 1")


def test_attempts_keep_the_question_count_and_pass_mark_they_started_with(db):
    columns = {
        row["column_name"]: row["is_nullable"]
        for row in query(
            db,
            "SELECT column_name, is_nullable FROM information_schema.columns "
            "WHERE table_schema = DATABASE() AND table_name = 'attempts' "
            "AND column_name IN ('question_count', 'pass_threshold')",
        )
    }
    assert columns == {"question_count": "NO", "pass_threshold": "NO"}


def test_every_ticked_option_is_stored_and_tied_to_its_question(db):
    columns = {
        row["column_name"]
        for row in query(
            db,
            "SELECT column_name FROM information_schema.columns "
            "WHERE table_schema = DATABASE() AND table_name = 'attempt_answers'",
        )
    }
    assert columns == {"attempt_id", "question_number", "question_id", "option_id"}
    keys = query(
        db,
        "SELECT constraint_name FROM information_schema.referential_constraints "
        "WHERE constraint_schema = DATABASE() AND table_name = 'attempt_answers'",
    )
    assert len(keys) >= 2


def test_teams_have_a_leader_and_invitations_can_be_cancelled(db):
    leader = query(
        db,
        "SELECT column_name FROM information_schema.columns WHERE table_schema = DATABASE() "
        "AND table_name = 'teams' AND column_name = 'leader_id'",
    )
    assert leader
    status = query(
        db,
        "SELECT column_type FROM information_schema.columns WHERE table_schema = DATABASE() "
        "AND table_name = 'team_invitations' AND column_name = 'status'",
    )[0]["column_type"]
    assert "'cancelled'" in status


def test_a_student_has_one_map_style_and_a_deleted_account_leaves_no_trace(db):
    columns = {
        row["column_name"]: row["column_type"]
        for row in query(
            db,
            "SELECT column_name, column_type FROM information_schema.columns "
            "WHERE table_schema = DATABASE() AND table_name = 'students' "
            "AND column_name IN ('map_style', 'status', 'deleted_at', 'purged_at')",
        )
    }
    # BR47: an account is deleted for good, so there is no "deleted" status and no erase marker any more.
    assert columns == {"map_style": "json", "status": "enum('active','blocked','archived')"}


def test_no_checkpoint_circle_is_smaller_than_60_m_br12(db):
    smallest = query(db, "SELECT MIN(radius) AS smallest FROM checkpoints")[0]["smallest"]
    assert smallest >= 60


def test_each_checkpoint_has_enough_questions_for_a_fresh_draw(db):
    rows = query(
        db,
        "SELECT c.checkpoint_name, c.question_count, "
        "(SELECT COUNT(*) FROM questions q WHERE q.checkpoint_id = c.checkpoint_id "
        " AND q.difficulty = 'NORMAL' AND q.is_active = 1) AS pool FROM checkpoints c",
    )
    for row in rows:
        assert row["pool"] >= 2 * row["question_count"], row["checkpoint_name"]


def test_location_checks_store_only_yes_or_no_and_a_time(db):
    columns = {
        row["column_name"]
        for row in query(
            db,
            "SELECT column_name FROM information_schema.columns "
            "WHERE table_schema = DATABASE() AND table_name = 'location_checks'",
        )
    }
    assert columns == {
        "check_id",
        "student_id",
        "checkpoint_id",
        "checked_at",
        "inside_radius",
        "used_by_attempt_id",
    }


def test_codes_and_tokens_are_stored_only_as_hashes(db):
    for table, column in [("otp_codes", "code_hash"), ("sessions", "token_hash")]:
        info = query(
            db,
            "SELECT data_type, character_maximum_length AS n FROM information_schema.columns "
            "WHERE table_schema = DATABASE() AND table_name = %s AND column_name = %s",
            (table, column),
        )[0]
        assert info["data_type"] == "char" and info["n"] == 64, f"{table}.{column}"


def test_foreign_keys_protect_attempts_from_orphans(db):
    keys = query(
        db,
        "SELECT table_name FROM information_schema.referential_constraints "
        "WHERE constraint_schema = DATABASE() AND table_name IN ('attempts', 'attempt_questions')",
    )
    assert len(keys) >= 4


def test_only_one_active_session_per_student_is_possible(db):
    indexes = query(
        db,
        "SELECT index_name, non_unique FROM information_schema.statistics "
        "WHERE table_schema = DATABASE() AND table_name = 'sessions' AND column_name = 'active_student_id'",
    )
    assert any(index["non_unique"] == 0 for index in indexes)


def test_question_photos_belong_to_one_question_and_say_when_they_are_shown(db):
    """BR11: question photos live in the database; `shown` is 'question' or 'answer' (migration 013)."""
    columns = {
        row["name"]: row["type"]
        for row in query(
            db,
            "SELECT COLUMN_NAME AS name, COLUMN_TYPE AS type FROM information_schema.columns "
            "WHERE table_schema = DATABASE() AND table_name = 'question_images'",
        )
    }
    assert columns["shown"] == "enum('question','answer')"
    rules = query(
        db,
        "SELECT DELETE_RULE AS rule FROM information_schema.referential_constraints "
        "WHERE constraint_schema = DATABASE() AND table_name = 'question_images'",
    )
    assert [rule["rule"] for rule in rules] == ["CASCADE"]
