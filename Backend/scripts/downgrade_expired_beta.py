import firebase_admin
from firebase_admin import credentials, firestore
from datetime import datetime, timezone

cred = credentials.Certificate("firebase-service-account.json")
firebase_admin.initialize_app(cred)
db = firestore.client()


def downgrade_expired_beta_users():
    now = datetime.now(timezone.utc)
    users_ref = db.collection("users")

    query = (
        users_ref
        .where("beta_granted", "==", True)
        .where("beta_access_expires", "<=", now)
        .where("plan", "==", "pro")
    )

    downgraded = 0
    for user in query.stream():
        users_ref.document(user.id).update({
            "plan": "free",
            "subscription_status": "expired",
            "beta_expired": True,
        })
        print(f"downgraded {user.id}")
        downgraded += 1

    print(f"total downgraded: {downgraded}")


if __name__ == "__main__":
    downgrade_expired_beta_users()