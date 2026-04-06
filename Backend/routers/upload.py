from fastapi import APIRouter, UploadFile, Form
import chardet
import pandas as pd
import io
from typing import Dict, Any, List
import uuid
from datetime import datetime, timedelta
import math
import warnings
import numpy as np

router = APIRouter()

DATA_CACHE = {}
EXPIRY_MINUTES = 180

PLAN_EXPIRY: Dict[str, int] = {
    "free": 180,
    "pro":  1440,
}

# Global user-visible stats (in-memory)
USER_STATS = {
    "total_rows_processed": 0
}

# ── Helpers ──────────────────────────────────────────────────────────────────

def detect_encoding(content: bytes) -> str:
    result = chardet.detect(content)
    return result.get("encoding") or "utf-8"

def read_csv_safely(buffer: io.BytesIO) -> pd.DataFrame:
    buffer.seek(0)
    content = buffer.read()
    encoding = detect_encoding(content)
    buffer.seek(0)
    return pd.read_csv(buffer, encoding=encoding)

READERS = {
    "text/csv": read_csv_safely,
    "text/plain": read_csv_safely,
    "application/vnd.ms-excel": pd.read_excel,
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": pd.read_excel,
    "application/json": pd.read_json,
}

def create_session(df: pd.DataFrame, plan: str = "free") -> str:
    session_id = str(uuid.uuid4())
    expiry_minutes = PLAN_EXPIRY.get(plan.lower(), PLAN_EXPIRY["free"])
    now = datetime.utcnow()
    DATA_CACHE[session_id] = {
        "df": df,
        "created_at": now,
        "uploaded_at": now.isoformat(),
        "expiry_minutes": expiry_minutes,
        "plan": plan.lower(),
    }
    return session_id

def get_session(session_id: str):
    session = DATA_CACHE.get(session_id)
    if not session:
        return None
    expiry_minutes = session.get("expiry_minutes", EXPIRY_MINUTES)
    if datetime.utcnow() - session["created_at"] > timedelta(minutes=expiry_minutes):
        del DATA_CACHE[session_id]
        return None
    return session["df"]

def generate_summary(df: pd.DataFrame) -> Dict[str, Any]:
    """
    Generate a df.describe()-style summary dict with safe datetime handling.
    Uses format='mixed' (pandas ≥ 2.0) instead of the deprecated
    infer_datetime_format=True.
    """
    try:
        summary = df.describe(include="all", datetime_is_numeric=True).to_dict()
    except TypeError:
        summary = df.describe(include="all").to_dict()
        for col in df.columns:
            try:
                with warnings.catch_warnings():
                    warnings.simplefilter("ignore", UserWarning)
                    # format='mixed' replaces the deprecated infer_datetime_format
                    converted = pd.to_datetime(df[col], errors="coerce", format="mixed")
                if converted.notna().sum() > 0:
                    s_min = converted.min()
                    s_max = converted.max()
                    summary.setdefault(col, {})
                    summary[col].update({
                        "min":    s_min.isoformat() if pd.notna(s_min) else None,
                        "max":    s_max.isoformat() if pd.notna(s_max) else None,
                        "count":  int(converted.notna().sum()),
                        "unique": int(converted.nunique(dropna=True)),
                    })
            except Exception:
                continue
    return summary

def sanitize_for_json(obj):
    """Recursively convert NaN/inf and numpy/pandas scalars to JSON-safe types."""
    if isinstance(obj, dict):
        return {k: sanitize_for_json(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [sanitize_for_json(v) for v in obj]
    if isinstance(obj, pd.Timestamp):
        return obj.isoformat()
    if isinstance(obj, datetime):
        return obj.isoformat()
    if isinstance(obj, np.generic):
        try:
            py = obj.item()
        except Exception:
            py = str(obj)
        return sanitize_for_json(py)
    if isinstance(obj, float):
        if math.isnan(obj) or math.isinf(obj):
            return None
        return obj
    if isinstance(obj, (int, bool)) or obj is None:
        return obj
    if isinstance(obj, str):
        return obj
    try:
        if pd.isna(obj):
            return None
    except Exception:
        pass
    return str(obj)

# ── File processor ────────────────────────────────────────────────────────────

async def process_file(file: UploadFile, plan: str = "free", user_id: str = None) -> Dict[str, Any]:
    if file.content_type not in READERS:
        return sanitize_for_json({
            "file_name": file.filename,
            "error": f"Unsupported file type: {file.content_type}",
        })

    try:
        content = await file.read()
        buffer = io.BytesIO(content)
        df = READERS[file.content_type](buffer)

        if df.empty:
            return sanitize_for_json({"file_name": file.filename, "error": "File is empty"})

        # Coerce object columns that look like dates.
        # format='mixed' handles inconsistent date formats without the deprecation warning.
        for col in df.select_dtypes(include=["object"]).columns:
            try:
                with warnings.catch_warnings():
                    warnings.simplefilter("ignore", UserWarning)
                    converted = pd.to_datetime(df[col], errors="coerce", format="mixed")
                if converted.notna().any():
                    df[col] = converted
            except Exception:
                pass

    except Exception as e:
        return sanitize_for_json({
            "file_name": file.filename,
            "error": f"Failed to parse dataset: {str(e)}",
        })

    summary = generate_summary(df)
    columns = df.columns.tolist()
    sample_rows = df.head(5).to_dict(orient="records")
    session_id = create_session(df, plan=plan)
    expiry_minutes = PLAN_EXPIRY.get(plan.lower(), PLAN_EXPIRY["free"])

    # Track row count and update global stats (do not decrement on expiry/delete)
    row_count = len(df)
    try:
        USER_STATS["total_rows_processed"] += int(row_count)
    except Exception:
        # be robust to unexpected values
        USER_STATS["total_rows_processed"] = int(row_count)

    # If a user_id is provided, attempt to persist the counter in Firestore
    persisted_total = None
    if user_id:
        try:
            from google.cloud import firestore as gcf

            db = gcf.Client()
            user_doc = db.collection("users").document(user_id)
            try:
                # Atomically increment if doc exists
                user_doc.update({"totalRowsProcessed": gcf.Increment(row_count), "updatedAt": gcf.SERVER_TIMESTAMP})
            except Exception:
                # If update fails (e.g., doc missing), set initial value (merge)
                user_doc.set({"totalRowsProcessed": row_count, "createdAt": gcf.SERVER_TIMESTAMP, "updatedAt": gcf.SERVER_TIMESTAMP}, merge=True)

            snap = user_doc.get()
            if snap.exists:
                data = snap.to_dict()
                persisted_total = data.get("totalRowsProcessed") or data.get("total_rows_processed")
        except Exception:
            # If Firestore client isn't available or fails, ignore and fall back to in-memory stat
            persisted_total = None

    result = {
        "file_name":      file.filename,
        "session_id":     session_id,
        "columns":        columns,
        "summary":        summary,
        "sample":         sample_rows,
        "row_count":      row_count,
        "total_rows_processed": persisted_total if persisted_total is not None else USER_STATS.get("total_rows_processed", 0),
        "uploaded_at":    DATA_CACHE[session_id]["uploaded_at"],
        "expiry_minutes": expiry_minutes,
    }

    return sanitize_for_json(result)

# ── Routes ────────────────────────────────────────────────────────────────────

@router.post("/upload")
async def upload_endpoint(file: UploadFile, plan: str = "free", user_id: str = Form(None)):
    return await process_file(file, plan=plan, user_id=user_id)

@router.post("/batch_uploads")
async def batch_uploads_endpoint(files: List[UploadFile], plan: str = "free", user_id: str = Form(None)):
    results = []
    for f in files:
        results.append(await process_file(f, plan=plan, user_id=user_id))
    return results