import firebase_admin
from firebase_admin import credentials, firestore
from datetime import datetime, timedelta, timezone

cred = credentials.Certificate("firebase-service-account.json")
firebase_admin.initialize_app(cred)
db = firestore.client()

PUSH_CUTOFF = datetime(2026, 7, 30, tzinfo=timezone.utc)  # when you pushed the new code today


def grant_beta_pro(dry_run=True):
    users_ref = db.collection("users")
    granted, skipped_new, skipped_has_plan, skipped_no_date = 0, 0, 0, 0

    for user in users_ref.stream():
        data = user.to_dict()

        # already has a plan set — real paying user or previously migrated, don't touch
        if "plan" in data:
            skipped_has_plan += 1
            continue

        created_at = data.get("createdAt")
        if not created_at:
            skipped_no_date += 1
            continue

        if created_at >= PUSH_CUTOFF:
            skipped_new += 1
            continue

        expires_at = PUSH_CUTOFF + timedelta(days=30)
        update = {
            "plan": "pro",
            "subscription_status": "active",
            "subscription_source": "beta",
            "beta_granted": True,
            "beta_access_expires": expires_at,
        }

        if dry_run:
            print(f"[DRY RUN] would grant {user.id} ({data.get('email')}) until {expires_at.date()}")
        else:
            users_ref.document(user.id).update(update)
            print(f"granted {user.id} until {expires_at.date()}")
        granted += 1

    print("----")
    print(f"granted: {granted}, skipped (new signups): {skipped_new}, "
          f"skipped (already has plan): {skipped_has_plan}, skipped (no createdAt): {skipped_no_date}")


if __name__ == "__main__":
    grant_beta_pro(dry_run=False)