"""
Tests the /payments/flutterwave-webhook route in Backend/routers/payments.py.

This suite does NOT need real Flutterwave keys or network access — it only
verifies:
  1. Requests with a wrong/missing signature are rejected (401), before any
     payload is even trusted.
  2. A cancel-event webhook correctly marks the user "cancelling" without
     immediately revoking Pro access (the intended cancel semantics).

It does NOT verify a real renewal-charge flow end-to-end, because that path
calls Flutterwave's live verify_transaction() API — which is stubbed here,
not really called. See the note in test_flutterwave_live_note() below for
what still needs a real sandbox run.
"""
import os
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from conftest import seed_user, get_user_doc
import routers.payments as payments

app = FastAPI()
app.include_router(payments.router)
client = TestClient(app)

TEST_SECRET_HASH = "test-secret-hash-123"


@pytest.fixture(autouse=True)
def set_webhook_secret(monkeypatch):
    monkeypatch.setenv("FLW_SECRET_HASH", TEST_SECRET_HASH)


def test_wrong_signature_is_rejected():
    res = client.post(
        "/payments/flutterwave-webhook",
        json={"event": "charge.completed", "data": {}},
        headers={"verif-hash": "totally-wrong"},
    )
    assert res.status_code == 401


def test_missing_signature_is_rejected():
    res = client.post(
        "/payments/flutterwave-webhook",
        json={"event": "charge.completed", "data": {}},
    )
    assert res.status_code == 401


def test_cancel_event_marks_user_cancelling_without_revoking_pro(monkeypatch):
    seed_user("uid-cancel-test", plan="pro", subscription_status="active", email="cancel@example.com")

    # payments.py looks the user up by email via _find_user_id_by_email;
    # point that at our seeded user regardless of implementation detail.
    monkeypatch.setattr(payments, "_find_user_id_by_email", lambda email: "uid-cancel-test")

    res = client.post(
        "/payments/flutterwave-webhook",
        json={
            "event": "subscription.cancelled",
            "data": {"customer": {"email": "cancel@example.com"}},
        },
        headers={"verif-hash": TEST_SECRET_HASH},
    )
    assert res.status_code == 200
    doc = get_user_doc("uid-cancel-test")
    assert doc["subscription_status"] == "cancelling"
    assert doc["plan"] == "pro", "cancel webhook must NOT immediately revoke access"


def test_flutterwave_live_note():
    """
    Not a real test — a marker. verify_transaction() (called for renewal
    charges) and cancel_subscription() (called from /payments/cancel) are
    stubbed in conftest.py, not really invoked against Flutterwave. Once
    you have TEST-mode Flutterwave keys, the renewal-charge path and a real
    cancel-subscription call need to be exercised against the actual API —
    this suite can't prove that part on its own.
    """
    assert True
