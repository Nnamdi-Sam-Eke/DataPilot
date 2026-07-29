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

import firebase_admin
from firebase_admin import auth as firebase_auth, credentials
from fastapi import Header, HTTPException

logger = logging.getLogger(__name__)

# ── Firebase Admin init (idempotent — safe even if another module already
#    did this; firebase_admin._apps is the SDK's own "already initialized"
#    guard) ──────────────────────────────────────────────────────────────────
if not firebase_admin._apps:
    cred_path = os.getenv("FIREBASE_SERVICE_ACCOUNT_PATH")
    if not cred_path:
        raise RuntimeError(
            "FIREBASE_SERVICE_ACCOUNT_PATH is not set in .env — point it at "
            "your Firebase service account JSON file, e.g.:\n"
            "FIREBASE_SERVICE_ACCOUNT_PATH=firebase-service-account.json"
        )
    if not os.path.isabs(cred_path):
        # resolve relative to Backend/ (this file's parent's parent)
        cred_path = os.path.join(
            os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
            cred_path,
        )
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
    except Exception:
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