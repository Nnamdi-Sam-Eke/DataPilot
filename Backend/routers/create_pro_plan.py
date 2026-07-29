"""
Run this ONCE to set up the recurring $12/month plan on Flutterwave.

    python create_pro_plan.py

Copy the "id" from the printed response into your .env as:

    FLW_PRO_PLAN_ID=<id>

Do not run this again after that — you'd create a duplicate plan.
"""
import os
import sys
from dotenv import load_dotenv

sys.path.append(
    os.path.dirname(
        os.path.dirname(
            os.path.dirname(os.path.abspath(__file__))
        )
    )
)
load_dotenv()

from src.services.flutterwave import create_payment_plan

if __name__ == "__main__":
    result = create_payment_plan(
        amount=12,
        currency="USD",
        interval="monthly",
        name="DataPilot Pro Monthly",
    )
    print(result)
    if result.get("status") == "success":
        plan_id = result["data"]["id"]
        print(f"\nAdd this to your .env:\nFLW_PRO_PLAN_ID={plan_id}")
    else:
        print("\nPlan creation failed — check FLW_SECRET_KEY and the error above.")