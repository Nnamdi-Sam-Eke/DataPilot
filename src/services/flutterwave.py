import requests
import os

FLW_BASE_URL = "https://api.flutterwave.com/v3"


def _headers():
    return {
        "Authorization": f"Bearer {os.getenv('FLW_SECRET_KEY')}",
        "Content-Type": "application/json",
    }


def create_payment_plan(amount=12, currency="USD", interval="monthly", name="DataPilot Pro Monthly"):
    """
    Run this ONCE (e.g. from a one-off script or the Flutterwave dashboard) to set
    up the recurring plan. Take the `id` from the response and store it as
    FLW_PRO_PLAN_ID in your .env. You do not call this on every checkout —
    create_payment() below just references the existing plan id.
    """
    payload = {
        "amount": amount,
        "name": name,
        "interval": interval,
        "currency": currency,
    }
    response = requests.post(f"{FLW_BASE_URL}/payment-plans", headers=_headers(), json=payload)
    return response.json()


def create_payment(email, name, user_id, tx_ref, redirect_url):
    """
    Initiates a subscription checkout. Flutterwave charges the card now and
    attaches it to the recurring plan for future auto-renewals.
    """
    plan_id = os.getenv("FLW_PRO_PLAN_ID")
    if not plan_id:
        raise RuntimeError(
            "FLW_PRO_PLAN_ID is not set. Call create_payment_plan() once, then put "
            "the returned plan id in your .env before accepting subscription payments."
        )

    payload = {
        "tx_ref": tx_ref,
        "amount": 12,
        "currency": "USD",
        "redirect_url": redirect_url,
        "payment_plan": plan_id,
        "customer": {
            "email": email,
            "name": name,
        },
        "customizations": {
            "title": "DataPilot Pro",
            "description": "Monthly subscription to DataPilot Pro",
        },
        "meta": {
            "user_id": user_id,
        },
    }

    response = requests.post(f"{FLW_BASE_URL}/payments", headers=_headers(), json=payload)
    return response.json()


def verify_transaction(transaction_id):
    """
    Always call this from the webhook (or a status check) before trusting a
    payment. Never rely on the webhook payload's own status/amount fields —
    Flutterwave's verify endpoint is the source of truth.
    """
    response = requests.get(
        f"{FLW_BASE_URL}/transactions/{transaction_id}/verify",
        headers=_headers(),
    )
    return response.json()


def cancel_subscription(subscription_id):
    response = requests.put(
        f"{FLW_BASE_URL}/subscriptions/{subscription_id}/cancel",
        headers=_headers(),
    )
    return response.json()


def get_subscription_id_by_email(email):
    """
    Look up a customer's actual Flutterwave subscription id by email.

    IMPORTANT: don't confuse this with the "plan" field you'll see on a
    subscription or transaction object — per Flutterwave's own docs,
    a subscription object looks like:
        { "id": 15376, "amount": 2000, "customer": {...}, "plan": 17490, ... }
    "id" is the subscription's own id (what /subscriptions/{id}/cancel needs).
    "plan" is the *payment plan* id — the same value for every customer on
    that plan. They are not interchangeable. This function returns "id".

    Returns the subscription id (as a string) for the most recent active
    subscription matching the email, or None if none is found.
    """
    try:
        response = requests.get(
            f"{FLW_BASE_URL}/subscriptions",
            headers=_headers(),
            params={"email": email},
        )
        payload = response.json()
    except Exception:
        return None

    if payload.get("status") != "success":
        return None

    subscriptions = payload.get("data") or []
    if not subscriptions:
        return None

    # Prefer an active subscription if there's more than one on record for
    # this email (e.g. a prior cancelled + a new resubscribe).
    active = [s for s in subscriptions if s.get("status") == "active"]
    chosen = active[0] if active else subscriptions[0]
    sub_id = chosen.get("id")
    return str(sub_id) if sub_id is not None else None