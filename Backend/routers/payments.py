import os
import sys
import uuid
import logging

from fastapi import APIRouter, Request, HTTPException, Header
from dotenv import load_dotenv

sys.path.append(
    os.path.dirname(
        os.path.dirname(
            os.path.dirname(os.path.abspath(__file__))
        )
    )
)
from src.services.flutterwave import (
    create_payment,
    verify_transaction,
    cancel_subscription,
    get_subscription_id_by_email,
)

from firebase_admin import firestore
from firebase_admin import auth as firebase_auth
# Importing this also performs the (idempotent) Firebase Admin init — see
# utils/auth.py. Kept as a single shared init so no two modules race to
# initialize the SDK differently.
from utils.auth import get_current_user, apply_lazy_plan_expiry

router = APIRouter()
logger = logging.getLogger(__name__)

# main.py only loads .env inside its lifespan startup, which runs after this
# module is imported — so we load it here too (harmless if called twice).
load_dotenv()

db = firestore.client()

FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:5173")


@router.post("/payments/create-checkout")
async def create_checkout(authorization: str = Header(None)):
    user = get_current_user(authorization)

    tx_ref = f"datapilot-pro-{user['id']}-{uuid.uuid4().hex[:8]}"

    payment_doc = {
        "user_id": user["id"],
        "email": user["email"],
        "tx_ref": tx_ref,
        "amount": 12,
        "currency": "USD",
        "status": "pending",
        "payment_type": "subscription",
        "created_at": firestore.SERVER_TIMESTAMP,
        "updated_at": firestore.SERVER_TIMESTAMP,
    }
    db.collection("payments").document(tx_ref).set(payment_doc)

    result = create_payment(
        email=user["email"],
        name=user["email"].split("@")[0] if user["email"] else "DataPilot User",
        user_id=user["id"],
        tx_ref=tx_ref,
        redirect_url=f"{FRONTEND_URL}/payment/success",
    )

    if result.get("status") != "success":
        logger.error(f"Flutterwave checkout init failed for {tx_ref}: {result}")
        db.collection("payments").document(tx_ref).update({
            "status": "init_failed",
            "updated_at": firestore.SERVER_TIMESTAMP,
        })
        raise HTTPException(status_code=502, detail="Could not start checkout")

    return result


@router.get("/payments/status/{tx_ref}")
async def payment_status(tx_ref: str, authorization: str = Header(None)):
    """
    Polled by PageSuccess.jsx while it waits for the webhook to land.
    Returns one of: verified | verification_failed | pending
    """
    user = get_current_user(authorization)

    doc_ref = db.collection("payments").document(tx_ref)
    doc = doc_ref.get()
    if not doc.exists:
        raise HTTPException(status_code=404, detail="Transaction not found")

    data = doc.to_dict()
    if data.get("user_id") != user["id"]:
        raise HTTPException(status_code=403, detail="Not your transaction")

    status = data.get("status")
    if status == "successful":
        return {"status": "verified"}
    if status in ("failed", "init_failed", "verification_failed"):
        return {"status": "verification_failed"}
    return {"status": "pending"}


def _next_period_end():
    from datetime import datetime, timedelta, timezone
    return datetime.now(timezone.utc) + timedelta(days=30)


def _find_user_id_by_email(email: str):
    """
    Renewal-charge webhooks don't carry our internal user_id, only the
    customer's email (subscriptions are tied to email on Flutterwave's side).
    Firebase Auth is the reliable place to resolve email -> uid, since every
    user in this app already has a Firebase account.
    """
    if not email:
        return None
    try:
        return firebase_auth.get_user_by_email(email).uid
    except Exception:
        logger.warning(f"No Firebase user found for renewal email: {email}")
        return None


def _resolve_subscription_id(email: str, v_data: dict):
    """
    Flutterwave's subscription object exposes two different ids:
    - `plan`: the shared payment-plan id (same for all customers on the plan)
    - `id`: the actual subscription id (what /subscriptions/{id}/cancel needs)

    The safe path is to prefer the subscription id when present, then fall
    back to a fresh lookup by email if the webhook payload is missing it.
    """
    sub_id = v_data.get("subscription_id") or v_data.get("subscription")
    if isinstance(sub_id, dict):
        sub_id = sub_id.get("id") or sub_id.get("subscription_id")
    if sub_id:
        return str(sub_id)

    if email:
        return get_subscription_id_by_email(email)
    return None


@router.get("/payments/subscription")
async def get_subscription(authorization: str = Header(None)):
    """
    Powers the billing page: current plan, renewal date, and recent payment
    history. Also does a lazy downgrade — if current_period_end has passed
    and Flutterwave never sent a renewal webhook (e.g. the card was declined
    and the subscription got auto-cancelled), the user's plan reverts to
    free the next time they check their billing status instead of staying
    "pro" forever on a stale record.
    """
    user = get_current_user(authorization)

    user_ref = db.collection("users").document(user["id"])
    user_doc = user_ref.get()
    user_data = user_doc.to_dict() if user_doc.exists else {}

    # Same lazy-expiry check every gated route already runs via
    # get_user_plan() — reused here (not duplicated) so Billing and every
    # other route agree on when a lapsed Pro user gets downgraded.
    user_data = apply_lazy_plan_expiry(user["id"], user_data)

    plan = (user_data.get("plan") or "free").lower()
    period_end = user_data.get("current_period_end")
    subscription_status = user_data.get("subscription_status")

    history_docs = (
        db.collection("payments")
        .where("user_id", "==", user["id"])
        .order_by("created_at", direction=firestore.Query.DESCENDING)
        .limit(12)
        .stream()
    )
    history = []
    for doc in history_docs:
        d = doc.to_dict()
        history.append({
            "tx_ref": d.get("tx_ref"),
            "amount": d.get("amount"),
            "currency": d.get("currency"),
            "status": d.get("status"),
            "payment_type": d.get("payment_type"),
            "created_at": d.get("created_at").isoformat() if d.get("created_at") else None,
        })

    return {
        "plan": plan,
        "subscription_status": subscription_status,
        "subscription_id": user_data.get("subscription_id"),
        "current_period_end": period_end.isoformat() if period_end else None,
        "payment_history": history,
    }


@router.post("/payments/cancel")
async def cancel_subscription_route(authorization: str = Header(None)):
    """
    Stops future auto-renewal. The user keeps Pro access until
    current_period_end (the period they already paid for) — we don't revoke
    immediately, and we don't refund. The lazy-downgrade check in
    get_subscription() flips them to free once that date passes.
    """
    user = get_current_user(authorization)

    user_ref = db.collection("users").document(user["id"])
    user_doc = user_ref.get()
    if not user_doc.exists:
        raise HTTPException(status_code=404, detail="User not found")

    user_data = user_doc.to_dict()
    subscription_id = user_data.get("subscription_id")
    if not subscription_id:
        subscription_id = get_subscription_id_by_email(user.get("email"))

    if not subscription_id or (user_data.get("plan") or "free").lower() != "pro":
        raise HTTPException(status_code=400, detail="No active subscription to cancel")

    result = cancel_subscription(subscription_id)
    if result.get("status") != "success":
        logger.error(f"Flutterwave cancel failed for user {user['id']}: {result}")
        raise HTTPException(status_code=502, detail="Could not cancel subscription with Flutterwave")

    user_ref.set({"subscription_status": "cancelling"}, merge=True)
    logger.info(f"User {user['id']} cancelled auto-renewal (subscription {subscription_id})")
    return {"status": "cancelling", "active_until": user_data.get("current_period_end")}


@router.post("/payments/flutterwave-webhook")
async def flutterwave_webhook(request: Request):
    signature = request.headers.get("verif-hash")
    secret_hash = os.getenv("FLW_SECRET_HASH")

    if not signature or signature != secret_hash:
        raise HTTPException(status_code=401, detail="Invalid webhook signature")

    payload = await request.json()
    logger.info(f"Flutterwave webhook: {payload}")

    event = payload.get("event", "")
    data = payload.get("data", payload)

    # Flutterwave may emit a cancel webhook for either:
    # 1) a customer-initiated cancellation (stop auto-renewal, keep access until
    #    current_period_end), or
    # 2) an auto-cancel after failed renewal attempts.
    #
    # In both cases, the user should remain Pro until the already-paid period
    # ends. The lazy downgrade in /payments/subscription handles the actual
    # deadline crossing later. This webhook should only record that the
    # subscription is cancelling, not immediately revoke access.
    if event in ("subscription.cancelled", "subscription.cancelled ") or "cancel" in event.lower():
        email = (data.get("customer") or {}).get("email")
        user_id = _find_user_id_by_email(email)
        if user_id:
            db.collection("users").document(user_id).set(
                {
                    "subscription_status": "cancelling",
                    "plan": "pro",
                },
                merge=True,
            )
            logger.info(f"Marked user {user_id} as cancelling — subscription cancelled ({email})")
        return {"status": "processed"}

    tx_ref = data.get("tx_ref") or data.get("txRef", "")
    transaction_id = data.get("id")

    if not tx_ref or not transaction_id:
        return {"status": "ignored"}

    payment_ref = db.collection("payments").document(tx_ref)
    payment_doc = payment_ref.get()

    # A tx_ref we don't recognize is a RENEWAL charge, not the initial
    # checkout — Flutterwave auto-charges the card on the plan's schedule and
    # generates its own tx_ref for that charge, which was never created by
    # create-checkout. Handle it as its own record rather than "ignored", or
    # renewals silently stop being tracked after month one.
    is_renewal = not payment_doc.exists

    # Never trust the webhook payload's own status/amount — re-verify against
    # Flutterwave's API before granting anything. This also protects against
    # someone hitting the webhook URL directly with a forged payload.
    verification = verify_transaction(transaction_id)
    v_data = verification.get("data", {})

    verified_tx_ref = (
        v_data.get("tx_ref")
        or v_data.get("txRef")
    )

    verified_ok = (
        verification.get("status") == "success"
        and v_data.get("status") == "successful"
        and verified_tx_ref == tx_ref
        and float(v_data.get("amount", 0)) >= 12
        and v_data.get("currency") == "USD"
    )

    if is_renewal:
        if not verified_ok:
            logger.warning(f"Renewal verification failed for {tx_ref}: {verification}")
            return {"status": "verification_failed"}

        email = (v_data.get("customer") or {}).get("email") or (data.get("customer") or {}).get("email")
        user_id = _find_user_id_by_email(email)
        if not user_id:
            logger.warning(f"Renewal charge {tx_ref} matched no user (email={email})")
            return {"status": "ignored"}

        subscription_id = _resolve_subscription_id(email, v_data)
        payment_ref.set({
            "user_id": user_id,
            "email": email,
            "tx_ref": tx_ref,
            "amount": v_data.get("amount", 12),
            "currency": v_data.get("currency", "USD"),
            "status": "successful",
            "payment_type": "renewal",
            "flutterwave_transaction_id": transaction_id,
            "subscription_id": subscription_id,
            "created_at": firestore.SERVER_TIMESTAMP,
            "updated_at": firestore.SERVER_TIMESTAMP,
        })

        db.collection("users").document(user_id).set(
            {
                "plan": "pro",
                "subscription_id": subscription_id,
                "subscription_status": "active",
                "current_period_end": _next_period_end(),
            },
            merge=True,
        )
        logger.info(f"Renewed pro subscription for user {user_id} via {tx_ref}")
        return {"status": "success"}

    payment_data = payment_doc.to_dict()

    if payment_data.get("status") == "successful":
        logger.info(f"Duplicate webhook ignored: {tx_ref}")
        return {"status": "already_processed"}

    if not verified_ok:
        payment_ref.update({
            "status": "verification_failed",
            "updated_at": firestore.SERVER_TIMESTAMP,
        })
        logger.warning(f"Verification failed for {tx_ref}: {verification}")
        return {"status": "verification_failed"}

    user_id = payment_data["user_id"]
    subscription_id = _resolve_subscription_id(payment_data.get("email"), v_data)

    payment_ref.update({
        "status": "successful",
        "flutterwave_transaction_id": transaction_id,
        "subscription_id": subscription_id,
        "updated_at": firestore.SERVER_TIMESTAMP,
    })

    db.collection("users").document(user_id).set(
        {
            "plan": "pro",
            "subscription_id": subscription_id,
            "subscription_status": "active",
            "current_period_end": _next_period_end(),
        },
        merge=True,
    )

    logger.info(f"Upgraded user {user_id} to pro via {tx_ref} (subscription {subscription_id})")
    return {"status": "success"}