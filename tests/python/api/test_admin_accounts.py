"""Integration tests over real HTTP: the two pre-seeded administrators (BR37).

The team's shared mailbox dhbw.campusgo@gmail.com is a second admin next to the study office. It may log in
although it is not a school address (BR01 exception for admin addresses only) and is protected like the
main admin.
"""

import pytest
import requests

from conftest import API_URL, Player

pytestmark = pytest.mark.api

SHARED_ADMIN = "dhbw.campusgo@gmail.com"


def ask_code(email):
    """Asks for a login code without a session."""
    return requests.post(f"{API_URL}/api/auth/request-otp", json={"email": email}, timeout=15)


def test_br37_the_shared_gmail_admin_exists_from_the_seed_and_logs_in_as_admin():
    shared = Player(SHARED_ADMIN).sign_in()
    assert shared.student["role"] == "admin"
    assert shared.get("/admin/users").status_code == 200


def test_br01_other_gmail_addresses_are_still_refused():
    reply = ask_code("not.an.admin@gmail.com")
    assert reply.status_code == 400
    assert reply.json()["error"]["code"] == "INVALID_EMAIL"


def test_br37_both_seeded_admins_are_protected_and_never_ranked(admin, player):
    users = admin.get("/admin/users").json()["users"]
    seeded = {user["email"]: user for user in users if user["mainAdmin"]}
    assert set(seeded) == {admin.email, SHARED_ADMIN}
    shared_id = seeded[SHARED_ADMIN]["id"]
    assert admin.post(f"/admin/users/{shared_id}/role", {"role": "student"}).status_code == 403
    assert admin.delete(f"/admin/users/{shared_id}").status_code == 403
    # Administrators never appear in a ranking (BR42), the shared one included.
    student = player("ranked")
    ranked = {entry["id"] for entry in student.get("/leaderboards/solo").json()["entries"]}
    assert shared_id not in ranked and seeded[admin.email]["id"] not in ranked
