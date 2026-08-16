# utils/auth.py
#
# Shared Firebase Admin auth for backend routers.
#
# This used to live only inside routers/payments.py. Pulling it out here so
# any router (file_store.py, and eventually the data-processing routers) can
# require a verified Firebase ID token without duplicating the Firebase Admin
# initialization — which must only happen once per process.

import os
import logging
from pathlib import Path

from dotenv import load_dotenv
import firebase_admin
from firebase_admin import auth as firebase_auth, credentials, firestore
from fastapi import Header, HTTPException

logger = logging.getLogger(__name__)

BACKEND_DIR = Path(__file__).resolve().parent.parent
load_dotenv(dotenv_path=BACKEND_DIR / ".env")

# ── Firebase Admin init (idempotent — safe even if another module already
#    did this; firebase_admin._apps is the SDK's own "already initialized"
#    guard) ──────────────────────────────────────────────────────────────────
if not firebase_admin._apps:
    cred_path = os.getenv("FIREBASE_SERVICE_ACCOUNT_PATH")
    if not cred_path:
        default_path = BACKEND_DIR / "firebase-service-account.json"
        if default_path.exists():
            cred_path = str(default_path)
        else:
            raise RuntimeError(
                "FIREBASE_SERVICE_ACCOUNT_PATH is not set in .env — point it at "
                "your Firebase service account JSON file, e.g.:\n"
                "FIREBASE_SERVICE_ACCOUNT_PATH=firebase-service-account.json"
            )
    if not os.path.isabs(cred_path):
        # resolve relative to Backend/ (this file's parent's parent)
        cred_path = os.path.join(BACKEND_DIR, cred_path)
    cred = credentials.Certificate(cred_path)
    firebase_admin.initialize_app(cred)


def get_current_user(authorization: str = Header(None)) -> dict:
    """
    FastAPI dependency. Verifies a Firebase ID token passed as
    `Authorization: Bearer <token>` and returns {"id": uid, "email": email}.
    Raises 401 if the header is missing, malformed, or the token is invalid
    or expired.
    """
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing auth token")

    id_token = authorization.split("Bearer ", 1)[1]
    try:
        decoded = firebase_auth.verify_id_token(id_token)
    except Exception as e:
        logger.warning(f"Token verification failed: {e}")
        raise HTTPException(status_code=401, detail="Invalid or expired auth token")

    return {"id": decoded["uid"], "email": decoded.get("email", "")}


def require_owns_key(storage_key: str, user_id: str) -> None:
    """
    Raise 403 unless storage_key is namespaced under this user's own uid
    (i.e. starts with 'users/{user_id}/'). Use this before any B2 read,
    write, or delete that takes a client-supplied storage key, so a caller
    can never reach another user's files just by knowing/guessing their key.
    """
    if not storage_key.startswith(f"users/{user_id}/"):
        raise HTTPException(
            status_code=403,
            detail="You do not have access to this resource.",
        )


# ── Plan lookup ───────────────────────────────────────────────────────────────
# Lazily-initialised Firestore client, shared across every call to
# get_user_plan(). We don't create it at import time because firebase_admin
# must already be initialized (see above) before firestore.client() is safe
# to call, and this module may be imported before that happens in some entry
# points.
_db = None


def _get_db():
    global _db
    if _db is None:
        _db = firestore.client()
    return _db


def apply_lazy_plan_expiry(uid: str, data: dict) -> dict:
    """
    If a Pro user's paid period (current_period_end) has passed, downgrade
    them to free right here, inline with whatever request triggered this
    read.

    There's no scheduled job (cron / Cloud Scheduler) checking for expired
    subscriptions — that costs money to run and isn't needed. Instead this
    runs as part of get_user_plan(), which is already called on every single
    gated request in the app (upload, train, insights, report, predict,
    plots, file_store, billing). So the very next authenticated request an
    expired user makes — whichever route it happens to be — self-heals their
    plan back to free, for free, with no extra Firestore reads beyond the
    one get_user_plan() already does.

    Distinguishes "cancelled" (user turned off auto-renewal, then their paid
    period elapsed) from "expired" (still marked active/renewing but the
    period passed anyway, e.g. a failed renewal charge) purely for billing-
    history clarity — both cases downgrade plan to free.

    `data` is the user's Firestore doc dict (or {} if it doesn't exist yet).
    Returns the dict, with plan/subscription_status corrected if a downgrade
    was applied.
    """
    plan = (data.get("plan") or "free").lower()
    period_end = data.get("current_period_end")
    subscription_status = data.get("subscription_status")

    if plan == "pro" and period_end is not None:
        from datetime import datetime, timezone
        now = datetime.now(timezone.utc)
        expires_at = period_end if period_end.tzinfo else period_end.replace(tzinfo=timezone.utc)
        if expires_at < now:
            new_status = "cancelled" if subscription_status == "cancelling" else "expired"
            _get_db().collection("users").document(uid).set(
                {"plan": "free", "subscription_status": new_status}, merge=True
            )
            data = dict(data)
            data["plan"] = "free"
            data["subscription_status"] = new_status

    return data


def get_user_plan(uid: str) -> str:
    """
    The ONLY correct way to find out what plan a user is on.

    Every feature-gated route in this app used to accept `plan` as a query
    param or JSON body field straight from the client — meaning anyone could
    set `plan=pro` in a request and unlock every Pro feature for free, with
    no server-side check against what they'd actually paid for. This closes
    that hole: plan is always looked up from the user's own Firestore
    document, keyed by the uid from their verified auth token, never trusted
    from anything the client sends.

    Also applies the lazy plan-expiry check (see apply_lazy_plan_expiry)
    before returning, so a Pro user whose paid period has lapsed is
    downgraded to free the moment they make any authenticated request —
    not just when they happen to open the Billing page.

    Returns "free" if the user has no plan field (shouldn't happen post
    beta-migration, but fails safe rather than raising).
    """
    doc = _get_db().collection("users").document(uid).get()
    if not doc.exists:
        return "free"
    data = apply_lazy_plan_expiry(uid, doc.to_dict() or {})
    return (data.get("plan") or "free").lower()