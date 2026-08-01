from __future__ import annotations

import logging
from datetime import datetime

from firebase_admin import firestore

from utils.auth import _get_db

logger = logging.getLogger(__name__)

FREE_DAILY_INSIGHT_LIMIT = 15


def _today_utc() -> str:
    return datetime.utcnow().strftime("%Y-%m-%d")


def _insight_ref(uid: str):
    return _get_db().collection("users").document(uid).collection("counters").document("insights")


def check_and_consume_insight_quota(uid: str, plan: str) -> str | None:
    """
    Pro: unlimited (no write).
    Free: atomically increment today's count in Firestore.
    Returns an error string if the quota is exhausted, else None.
    """
    if (plan or "free").lower() == "pro":
        return None

    if not uid:
        return "Authentication required."

    today = _today_utc()
    ref = _insight_ref(uid)
    db = _get_db()

    @firestore.transactional
    def _txn(transaction):
        snap = ref.get(transaction=transaction)
        data = snap.to_dict() if snap.exists else {}
        stored_date = data.get("date")
        count = int(data.get("count") or 0) if stored_date == today else 0

        if count >= FREE_DAILY_INSIGHT_LIMIT:
            return False, count

        transaction.set(
            ref,
            {
                "date": today,
                "count": count + 1,
                "updated_at": firestore.SERVER_TIMESTAMP,
            },
            merge=True,
        )
        return True, count + 1

    try:
        ok, count = _txn(db.transaction())
    except Exception as e:
        logger.error(f"Insight quota transaction failed for {uid}: {e}")
        return (
            "Could not verify your daily AI insight quota. Please try again in a moment."
        )

    if not ok:
        return (
            f"You've reached today's limit of {FREE_DAILY_INSIGHT_LIMIT} AI insight "
            "queries on the Free plan. Upgrade to Pro for unlimited queries."
        )

    logger.debug(f"Insight quota uid={uid} count={count}/{FREE_DAILY_INSIGHT_LIMIT}")
    return None


def get_insight_quota_status(uid: str, plan: str) -> dict:
    """Optional helper for UI (remaining queries)."""
    if (plan or "free").lower() == "pro":
        return {"plan": "pro", "limit": None, "used": 0, "remaining": None}

    today = _today_utc()
    try:
        snap = _insight_ref(uid).get()
        data = snap.to_dict() if snap.exists else {}
        used = int(data.get("count") or 0) if data.get("date") == today else 0
    except Exception as e:
        logger.warning(f"Insight quota status read failed: {e}")
        used = 0

    return {
        "plan": "free",
        "limit": FREE_DAILY_INSIGHT_LIMIT,
        "used": used,
        "remaining": max(0, FREE_DAILY_INSIGHT_LIMIT - used),
    }
