"""Shared fixtures for the Python tests: a signed-in player, database access, a planted login code, a quiz helper.

The tests talk to a real API (port 3100) on the test database `campusquest_test`. The runner
`node tests/run-all.mjs` starts both and sets CQ_API_URL and CQ_TEST_DB_URL; without them the tests that
need the stack are skipped with a hint instead of failing.
"""

import hashlib
import hmac
import itertools
import os
import random
import uuid
from pathlib import Path
from urllib.parse import urlparse

import pymysql
import pymysql.cursors
import pytest
import requests

ROOT = Path(__file__).resolve().parents[1]
API_URL = os.environ.get("CQ_API_URL", "")
DB_URL = os.environ.get("CQ_TEST_DB_URL", "")
REPORTS = Path(os.environ.get("CQ_REPORTS_DIR", ROOT / "tests" / "reports"))
OTP_SECRET = os.environ.get("CQ_OTP_SECRET", "")
KNOWN_CODE = "123456"
DOMAIN = "heilbronn.dhbw.de"
ADMIN_EMAIL = f"sekretariat.dski@{DOMAIN}"
TIMEOUT = 15

_ip_counter = itertools.count(random.randint(1, 60000))


def pytest_collection_modifyitems(config, items):  # pylint: disable=unused-argument
    """Skip stack tests with a clear hint when the runner did not provide the API or database."""
    for item in items:
        if item.get_closest_marker("api") and not API_URL:
            item.add_marker(
                pytest.mark.skip(reason="needs the API: node tests/run-all.mjs --only <id>")
            )
        if item.get_closest_marker("db") and not DB_URL:
            item.add_marker(
                pytest.mark.skip(reason="needs the test DB: node tests/run-all.mjs --only <id>")
            )


def unique_ip():
    """A fresh client address for the X-Forwarded-For header (the test API trusts one proxy hop)."""
    n = next(_ip_counter)
    return f"10.{(n >> 16) & 255}.{(n >> 8) & 255}.{n & 255}"


def unique_email(prefix="player"):
    """A new, never used school address: tests never reuse an e-mail, so per-e-mail limits never bite."""
    return f"{prefix}-{uuid.uuid4().hex[:10]}@{DOMAIN}"


def connect_db():
    """Opens the test database. Refuses every database whose name is not exactly campusquest_test."""
    parsed = urlparse(DB_URL)
    name = parsed.path.lstrip("/")
    if name != "campusquest_test":
        raise RuntimeError(f"refusing to use database {name!r}: only campusquest_test is allowed")
    return pymysql.connect(
        host=parsed.hostname,
        port=parsed.port or 3306,
        user=parsed.username,
        password=parsed.password,
        database=name,
        autocommit=True,
        cursorclass=pymysql.cursors.DictCursor,
    )


@pytest.fixture
def db():
    """A connection to the test database."""
    connection = connect_db()
    yield connection
    connection.close()


def query(connection, sql, args=None):
    """Runs a SELECT and returns all rows as dictionaries (column names in lower case)."""
    with connection.cursor() as cursor:
        cursor.execute(sql, args)
        return [{key.lower(): value for key, value in row.items()} for row in cursor.fetchall()]


def plant_code(connection, email, code=KNOWN_CODE):
    """Makes `code` the valid login code of `email` in the test database.

    Real codes are only e-mailed (and stored as hashes), so a test cannot read them. It writes the hash of a
    known code instead, exactly as the API would, and then logs in through the normal /auth/verify. If a code
    was already requested the newest unused one is replaced, otherwise a new one is added.
    """
    email = email.strip().lower()
    digest = hmac.new(OTP_SECRET.encode(), f"{email}:{code}".encode(), hashlib.sha256).hexdigest()
    with connection.cursor() as cursor:
        changed = cursor.execute(
            "UPDATE otp_codes SET code_hash = %s WHERE email = %s AND is_used = 0 "
            "ORDER BY created_at DESC LIMIT 1",
            (digest, email),
        )
        if not changed:
            cursor.execute(
                "INSERT INTO otp_codes (email, code_hash, created_at, expires_at, is_used, failed_attempts)"
                " VALUES (%s, %s, UTC_TIMESTAMP(3), DATE_ADD(UTC_TIMESTAMP(3), INTERVAL 10 MINUTE), 0, 0)",
                (email, digest),
            )
    return code


def known_code(email, code=KNOWN_CODE):
    """Opens the test database, plants `code` for `email` and returns it."""
    connection = connect_db()
    try:
        return plant_code(connection, email, code)
    finally:
        connection.close()


class Player:
    """One signed-in session against the API, with its own client address."""

    def __init__(self, email):
        self.email = email
        self.ip = unique_ip()
        self.http = requests.Session()
        self.student = None

    def request(self, method, path, **kwargs):
        """Sends a request to the API as this player."""
        headers = {"X-Forwarded-For": self.ip, **kwargs.pop("headers", {})}
        return self.http.request(
            method, f"{API_URL}/api{path}", headers=headers, timeout=TIMEOUT, **kwargs
        )

    def get(self, path, **kwargs):
        """GET helper."""
        return self.request("GET", path, **kwargs)

    def post(self, path, body=None, **kwargs):
        """POST helper with a JSON body."""
        return self.request("POST", path, json=body or {}, **kwargs)

    def delete(self, path, **kwargs):
        """DELETE helper."""
        return self.request("DELETE", path, **kwargs)

    def put(self, path, body=None, **kwargs):
        """PUT helper with a JSON body."""
        return self.request("PUT", path, json=body or {}, **kwargs)

    def patch(self, path, body=None, **kwargs):
        """PATCH helper with a JSON body."""
        return self.request("PATCH", path, json=body or {}, **kwargs)

    def sign_in(self, first="Test", last="Player", nickname=None):
        """Code login with a planted code (see plant_code). A new address creates the account."""
        code = known_code(self.email)
        body = {"email": self.email, "otp": code, "firstName": first, "lastName": last}
        if nickname:
            body["nickname"] = nickname
        reply = self.post("/auth/verify", body)
        assert reply.status_code in (200, 201), reply.text
        self.student = reply.json()["student"]
        return self

    @property
    def id(self):
        """The student id."""
        return self.student["id"]

    def checkpoint(self, name):
        """One checkpoint as the API lists it for this player."""
        found = [c for c in self.get("/checkpoints").json()["checkpoints"] if c["name"] == name]
        assert found, f"checkpoint {name} is not listed"
        return found[0]

    def start_quiz(self, name, dx_m=0.0, dy_m=0.0, accuracy=10):
        """Location check at (or a few metres away from) a checkpoint centre. Returns the response."""
        self.post("/me/location-consent")
        cp = self.checkpoint(name)
        lat = cp["latitude"] + dy_m / 111_195
        lng = cp["longitude"] + dx_m / 71_900
        return self.post(
            f"/checkpoints/{cp['id']}/verify",
            {"lat": lat, "lng": lng, "accuracy": accuracy, "ageMs": 0},
        )

    def answer_all(self, attempt, correct=True):
        """Answers every question (all right or all wrong). Returns the last response body."""
        connection = connect_db()
        try:
            body = {"attempt": attempt}
            while "result" not in body:
                current = body["attempt"]["currentQuestion"]
                question = next(q for q in body["attempt"]["questions"] if q["number"] == current)
                rows = query(
                    connection,
                    "SELECT option_id FROM options WHERE question_id = %s AND is_correct = %s LIMIT 1",
                    (question["id"], 1 if correct else 0),
                )
                reply = self.post(
                    f"/attempts/{body['attempt']['id']}/answers", {"optionId": rows[0]["option_id"]}
                )
                assert reply.status_code == 200, reply.text
                body = reply.json()
            return body
        finally:
            connection.close()


@pytest.fixture
def player():
    """Factory: player() gives a new signed-in student with an unused address."""

    def make(prefix="player", **names):
        return Player(unique_email(prefix)).sign_in(**names)

    return make


@pytest.fixture
def admin():
    """The pre-seeded administrator, signed in (the account exists from the first seed on)."""
    return Player(ADMIN_EMAIL).sign_in()
