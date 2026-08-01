"""
Tests the /report/export route in Backend/routers/report.py — the server-
side download gate (the UI-only gate was the original bug: Free users could
call the API directly and download anyway). Mounts your real router in a
throwaway FastAPI app; no other part of the app is involved.
"""
from fastapi import FastAPI
from fastapi.testclient import TestClient

from conftest import seed_user
import routers.report as report

app = FastAPI()
app.include_router(report.router, prefix="/report")
client = TestClient(app)

SAMPLE_REPORT = {
    "file_name": "sales.csv",
    "executive_summary": {"total_rows": 100, "total_columns": 5},
}


def test_free_user_cannot_download():
    seed_user("free-uid", plan="free")
    res = client.post(
        "/report/export",
        json={"format": "csv", "report": SAMPLE_REPORT},
        headers={"Authorization": "Bearer fake-token"},
    )
    assert res.status_code == 403
    assert res.json()["plan_gate"] == "pro"


def test_pro_user_can_download_csv():
    seed_user("test-uid-1", plan="pro")  # matches the fake verify_id_token's uid
    res = client.post(
        "/report/export",
        json={"format": "csv", "report": SAMPLE_REPORT},
        headers={"Authorization": "Bearer fake-token"},
    )
    assert res.status_code == 200
    assert "attachment" in res.headers["content-disposition"]
    assert res.headers["content-type"].startswith("text/csv")


def test_pro_user_can_download_html():
    seed_user("test-uid-1", plan="pro")
    res = client.post(
        "/report/export",
        json={"format": "html", "report": SAMPLE_REPORT, "file_name": "sales.csv"},
        headers={"Authorization": "Bearer fake-token"},
    )
    assert res.status_code == 200
    assert res.headers["content-type"].startswith("text/html")


def test_missing_auth_is_rejected():
    res = client.post("/report/export", json={"format": "csv", "report": SAMPLE_REPORT})
    assert res.status_code == 401


def test_invalid_format_rejected_for_pro_user():
    seed_user("test-uid-1", plan="pro")
    res = client.post(
        "/report/export",
        json={"format": "xml", "report": SAMPLE_REPORT},
        headers={"Authorization": "Bearer fake-token"},
    )
    assert res.status_code == 400
