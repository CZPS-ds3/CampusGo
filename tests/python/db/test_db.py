"""Database tests: schema, constraints, reference data and privacy of the stored data (test database)."""

import pytest
import pymysql

from conftest import ADMIN_EMAIL, query

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
    "questions",
    "options",
    "attempts",
    "attempt_questions",
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
    assert numbers == list(range(1, len(numbers) + 1)) and len(numbers) >= 7


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


def test_the_administrator_exists_from_the_start_as_id_one(db):
    rows = query(db, "SELECT student_id, role, status FROM students WHERE role = 'admin'")
    assert rows == [{"student_id": 1, "role": "admin", "status": "active"}]
    mail = query(db, "SELECT email FROM students WHERE student_id = 1")[0]["email"]
    assert mail == ADMIN_EMAIL


def test_the_eight_pilot_checkpoints_have_sensible_geofences(db):
    rows = query(db, "SELECT * FROM checkpoints")
    assert len(rows) == 8
    for row in rows:
        assert 49.10 < float(row["latitude"]) < 49.20, row["checkpoint_name"]
        assert 9.15 < float(row["longitude"]) < 9.30, row["checkpoint_name"]
        assert 25 <= row["radius"] <= 150, row["checkpoint_name"]
        assert (
            row["question_count"] in (3, 5) and 1 <= row["pass_threshold"] <= row["question_count"]
        )


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


def test_every_question_has_four_options_and_exactly_one_right_answer(db):
    broken = query(
        db,
        "SELECT q.question_id FROM questions q JOIN options o ON o.question_id = q.question_id "
        "GROUP BY q.question_id HAVING COUNT(*) <> 4 OR SUM(o.is_correct) <> 1",
    )
    assert broken == []


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
