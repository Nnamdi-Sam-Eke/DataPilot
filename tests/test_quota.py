"""
Tests Backend/utils/quota.py — the Firestore-backed daily AI-insight quota
for Free users. Imports and calls your real check_and_consume_insight_quota()
and get_insight_quota_status(); nothing here is a re-implementation.
"""
from utils.quota import check_and_consume_insight_quota, get_insight_quota_status, FREE_DAILY_INSIGHT_LIMIT


def test_pro_is_never_limited():
    for _ in range(FREE_DAILY_INSIGHT_LIMIT + 5):
        assert check_and_consume_insight_quota("pro-uid", "pro") is None


def test_free_allows_up_to_limit_then_blocks():
    uid = "free-uid-1"
    for i in range(FREE_DAILY_INSIGHT_LIMIT):
        err = check_and_consume_insight_quota(uid, "free")
        assert err is None, f"query {i + 1} should be allowed, got error: {err}"

    err = check_and_consume_insight_quota(uid, "free")
    assert err is not None
    assert "15" in err or str(FREE_DAILY_INSIGHT_LIMIT) in err
    assert "Upgrade" in err


def test_free_users_do_not_share_a_quota():
    """One free user hitting their limit shouldn't affect another."""
    uid_a, uid_b = "free-uid-a", "free-uid-b"
    for _ in range(FREE_DAILY_INSIGHT_LIMIT):
        assert check_and_consume_insight_quota(uid_a, "free") is None

    assert check_and_consume_insight_quota(uid_a, "free") is not None  # A is exhausted
    assert check_and_consume_insight_quota(uid_b, "free") is None       # B is untouched


def test_quota_status_reflects_usage():
    uid = "free-uid-status"
    status = get_insight_quota_status(uid, "free")
    assert status["used"] == 0
    assert status["remaining"] == FREE_DAILY_INSIGHT_LIMIT

    check_and_consume_insight_quota(uid, "free")
    check_and_consume_insight_quota(uid, "free")

    status = get_insight_quota_status(uid, "free")
    assert status["used"] == 2
    assert status["remaining"] == FREE_DAILY_INSIGHT_LIMIT - 2


def test_quota_status_for_pro_shows_unlimited():
    status = get_insight_quota_status("pro-uid-2", "pro")
    assert status["plan"] == "pro"
    assert status["limit"] is None
    assert status["remaining"] is None
