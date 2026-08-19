"""
One-off backfill for Pro users whose current_period_end was never set
(accounts that upgraded before PageBilling.jsx / the billing fields existed).

Two cases, handled differently:
  - User HAS a successful payment record: current_period_end = that
    payment's created_at + 30 days (a real paying subscriber).
  - User has NO payment record at all: this is a comped beta account
    (manually granted a free month of Pro), not a paying subscriber.
    These all get downgraded together on COMP_GRANT_EXPIRY below, rather
    than each getting a rolling 30 days from whenever this script happens
    to run — a comped grant has a real end date, and re-running this
    script a week from now shouldn't quietly extend anyone's free access.

Dry-run by default — prints what it would change without writing anything.
Pass --apply to actually write.

    python backfill_period_end.py            # dry run
    python backfill_period_end.py --apply     # actually writes

Safe to run more than once — it only touches users with plan == "pro" and
no current_period_end, so already-backfilled or already-correct users are
skipped automatically.
"""
import sys
import os
from pathlib import Path
from datetime import timedelta, datetime, timezone

sys.path.append(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
)

# Reuses the same Firebase Admin init as the rest of the backend — this
# import alone initializes the SDK (see utils/auth.py's module-level init).
from utils.auth import get_current_user  # noqa: F401  (import triggers Firebase init)
from firebase_admin import firestore

db = firestore.client()

# Fixed expiry for comped beta accounts (no payment record on file). All of
# them expire together on this date, regardless of when the backfill runs.
COMP_GRANT_EXPIRY = datetime(2026, 8, 29, 23, 59, 59, tzinfo=timezone.utc)


def most_recent_successful_payment(user_id: str):
    docs = (
        db.collection("payments")
        .where("user_id", "==", user_id)
        .where("status", "==", "successful")
        .order_by("created_at", direction=firestore.Query.DESCENDING)
        .limit(1)
        .stream()
    )
    for doc in docs:
        return doc.to_dict()
    return None


def main():
    apply = "--apply" in sys.argv

    users = db.collection("users").where("plan", "==", "pro").stream()

    to_fix = []
    for user_doc in users:
        data = user_doc.to_dict()
        if data.get("current_period_end") is not None:
            continue
        to_fix.append((user_doc.id, data))

    if not to_fix:
        print("No Pro users missing current_period_end. Nothing to do.")
        return

    print(f"Found {len(to_fix)} Pro user(s) missing current_period_end:\n")

    for uid, data in to_fix:
        payment = most_recent_successful_payment(uid)

        if payment and payment.get("created_at"):
            base = payment["created_at"]
            period_end = base + timedelta(days=30)
            source = f"last payment ({payment.get('tx_ref', '?')}) + 30 days"
        else:
            period_end = COMP_GRANT_EXPIRY
            source = f"no payment record — comped beta grant, expires {COMP_GRANT_EXPIRY.date()}"

        email = data.get("email", "?")
        print(f"  {uid} ({email}): current_period_end -> {period_end.isoformat()}  [{source}]")

        if apply:
            db.collection("users").document(uid).set(
                {"current_period_end": period_end}, merge=True
            )

    print()
    if apply:
        print(f"Done — updated {len(to_fix)} user(s).")
    else:
        print("Dry run only — no writes made. Re-run with --apply to write these changes.")


if __name__ == "__main__":
    main()