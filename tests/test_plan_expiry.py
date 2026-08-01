"""
Tests Backend/utils/auth.py's apply_lazy_plan_expiry() / get_user_plan() —
the fix for "cancelled subscriptions never got downgraded to free once
current_period_end passed." Imports and calls your real functions.
"""
from datetime import timedelta

from conftest import seed_user, get_user_doc, utcnow
from utils.auth import get_user_plan, apply_lazy_plan_expiry


def test_active_pro_user_stays_pro():
    seed_user("u1", plan="pro", subscription_status="active",
              current_period_end=utcnow() + timedelta(days=10))
    assert get_user_plan("u1") == "pro"
    assert get_user_doc("u1")["plan"] == "pro"


def test_cancelled_user_keeps_pro_until_period_end():
    seed_user("u2", plan="pro", subscription_status="cancelling",
              current_period_end=utcnow() + timedelta(days=1))
    assert get_user_plan("u2") == "pro"


def test_cancelled_user_downgrades_after_period_end_REGRESSION():
    """
    This is the exact bug that shipped: the original condition was
    `expires_at < now and subscription_status != "cancelling"`, which meant
    a user who cancelled NEVER got downgraded once their period ended — they
    kept Pro access forever. If this test ever fails again, that bug is back.
    """
    seed_user("u3", plan="pro", subscription_status="cancelling",
              current_period_end=utcnow() - timedelta(days=1))

    plan = get_user_plan("u3")

    assert plan == "free", "REGRESSION: cancelled users are not being downgraded after period end"
    doc = get_user_doc("u3")
    assert doc["plan"] == "free"
    assert doc["subscription_status"] == "cancelled"


def test_silently_failed_renewal_also_downgrades():
    """Status stuck on 'active' (e.g. card declined, no cancel webhook fired)
    but the period elapsed anyway — should still downgrade, with a distinct
    status so billing history can tell the two cases apart."""
    seed_user("u4", plan="pro", subscription_status="active",
              current_period_end=utcnow() - timedelta(hours=1))

    assert get_user_plan("u4") == "free"
    doc = get_user_doc("u4")
    assert doc["subscription_status"] == "expired"


def test_free_user_untouched():
    seed_user("u5", plan="free")
    assert get_user_plan("u5") == "free"


def test_missing_user_doc_defaults_free():
    assert get_user_plan("does-not-exist") == "free"


def test_self_heals_via_any_gated_route_not_just_billing_page():
    """
    The whole point of putting this check inside get_user_plan() (rather
    than only in GET /payments/subscription) is that ANY gated route —
    upload, train, insights, report, predict, plots, file_store — all call
    get_user_plan() and will trigger the same downgrade. Simulate that by
    calling get_user_plan() directly, exactly as those routers do, with no
    knowledge of /payments/subscription at all.
    """
    seed_user("u6", plan="pro", subscription_status="cancelling",
              current_period_end=utcnow() - timedelta(days=5))

    plan = get_user_plan("u6")  # <- this is literally what upload.py/train.py/etc call

    assert plan == "free"
    assert get_user_doc("u6")["subscription_status"] == "cancelled"
