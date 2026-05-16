from fastapi import APIRouter, UploadFile
import chardet
import pandas as pd
import io
from typing import Dict, Any, List
import uuid
from datetime import datetime, timedelta
import math
import warnings
import numpy as np
import os
import logging

router = APIRouter()
logger = logging.getLogger(__name__)

DATA_CACHE = {}
EXPIRY_MINUTES = 90

PLAN_EXPIRY: Dict[str, int] = {
    "free": 90,    # 1.5 hours — free tier extended
    "pro":  720,   # 12 hours
}

# Max rows stored in-memory for free plan users
MAX_ROWS_FREE = 20_000

# Hard cap on uploaded file size (bytes) — reject before reading into memory
MAX_UPLOAD_BYTES = 30 * 1024 * 1024  # 30 MB

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
    "text/csv":   read_csv_safely,
    "text/plain": read_csv_safely,
    "application/vnd.ms-excel": pd.read_excel,
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": pd.read_excel,
    "application/json": pd.read_json,
}

# Extension-based fallback for browsers that send application/octet-stream
_EXT_READERS = {
    "csv":  read_csv_safely,
    "xlsx": pd.read_excel,
    "xls":  pd.read_excel,
    "json": pd.read_json,
}

def create_session(df: pd.DataFrame, plan: str = "free", file_name: str = None) -> str:
    """Create a new session."""
    session_id = str(uuid.uuid4())
    expiry_minutes = PLAN_EXPIRY.get(plan.lower(), PLAN_EXPIRY["free"])
    now = datetime.utcnow()

    DATA_CACHE[session_id] = {
        "df": df,
        "created_at":    now,
        "last_accessed": now,   # Updated on every get_session call — inactivity timer
        "uploaded_at":   now.isoformat(),
        "expiry_minutes": expiry_minutes,
        "plan": plan.lower(),
    }

    if file_name:
        DATA_CACHE[session_id]["file_name"] = file_name

    return session_id

def get_session(session_id: str):
    session = DATA_CACHE.get(session_id)
    if not session:
        return None
    expiry_minutes = session.get("expiry_minutes", EXPIRY_MINUTES)
    # Use last_accessed for inactivity-based expiry — active sessions never
    # expire mid-work. Falls back to created_at for sessions created before
    # this change was deployed.
    last_touch = session.get("last_accessed") or session["created_at"]
    if datetime.utcnow() - last_touch > timedelta(minutes=expiry_minutes):
        del DATA_CACHE[session_id]
        return None
    # Refresh the inactivity clock on every legitimate access
    session["last_accessed"] = datetime.utcnow()
    return session["df"]

def generate_summary(df: pd.DataFrame) -> Dict[str, Any]:
    """
    Generate a df.describe()-style summary dict with safe datetime handling.
    """
    try:
        summary = df.describe(include="all", datetime_is_numeric=True).to_dict()
    except TypeError:
        summary = df.describe(include="all").to_dict()
        for col in df.columns:
            try:
                with warnings.catch_warnings():
                    warnings.simplefilter("ignore", UserWarning)
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

# ── Backblaze B2 storage ─────────────────────────────────────────────────────
# FIX: Import from shared utils/b2_client.py instead of maintaining a
# duplicate singleton here.  file_store.py also imports from there.
from utils.b2_client import get_b2, b2_available, mime_from_ext, BUCKET


def _mime_from_filename(file_name: str) -> str:
    ext = file_name.rsplit(".", 1)[-1].lower() if "." in file_name else ""
    return mime_from_ext(ext)


def _store_to_b2(file_name: str, content: bytes) -> str | None:
    """
    Upload raw file bytes to Backblaze B2.
    Returns the storage key, or None if B2 is not configured or the upload fails.
    Key pattern: files/{uuid}/{file_name}
    """
    if not b2_available():
        return None
    try:
        storage_key = f"files/{uuid.uuid4()}/{file_name}"
        get_b2().put_object(
            Bucket=BUCKET,
            Key=storage_key,
            Body=content,
            ContentType=_mime_from_filename(file_name),
            Metadata={
                "original_name": file_name,
                "uploaded_at":   datetime.utcnow().isoformat(),
            },
        )
        logger.info(f"✅ Stored to B2: {storage_key}")
        return storage_key
    except Exception as e:
        logger.warning(f"B2 store failed (non-fatal): {e}")
        return None

# ── File processor ────────────────────────────────────────────────────────────

async def process_file(file: UploadFile, plan: str = "free") -> Dict[str, Any]:
    # FIX: fall back to extension-based reader for application/octet-stream
    # (common when uploading via mobile, Postman, or drag-and-drop on some
    # browsers) so valid CSV/XLSX files are never silently rejected.
    reader = READERS.get(file.content_type)
    if reader is None:
        ext = (file.filename or "").rsplit(".", 1)[-1].lower()
        reader = _EXT_READERS.get(ext)
    if reader is None:
        return sanitize_for_json({
            "file_name": file.filename,
            "error": f"Unsupported file type: {file.content_type}. Supported: CSV, XLSX, JSON.",
        })

    try:
        content = await file.read()

        if len(content) > MAX_UPLOAD_BYTES:
            size_mb = len(content) / (1024 * 1024)
            return sanitize_for_json({
                "file_name": file.filename,
                "error": (
                    f"File too large ({size_mb:.1f} MB). "
                    f"Maximum allowed size is {MAX_UPLOAD_BYTES // (1024*1024)} MB."
                ),
            })

        buffer = io.BytesIO(content)
        df = reader(buffer)

        if df.empty:
            return sanitize_for_json({"file_name": file.filename, "error": "File is empty"})

        if plan == "free" and len(df) > MAX_ROWS_FREE:
            df = df.sample(MAX_ROWS_FREE, random_state=42).reset_index(drop=True)
            logger.warning(
                f"Free plan: dataset sampled to {MAX_ROWS_FREE} rows ({file.filename})"
            )

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

    session_id = create_session(df, plan=plan, file_name=file.filename)

    DATA_CACHE[session_id].update({
        "columns": columns[:20],
        "sample": sample_rows[:3],
        "summary": dict(list(summary.items())[:10]),
        "row_count": len(df),
    })

    try:
        from routers.insights import CONTEXT_CACHE
        CONTEXT_CACHE[session_id] = (
            f"Dataset ({session_id[:8]}...):\n"
            f"{{'shape': {list(df.shape)}, "
            f"'columns': {columns[:20]}, "
            f"'sample': {sample_rows[:3]}}}"
        )
    except Exception:
        pass

    expiry_minutes = PLAN_EXPIRY.get(plan.lower(), PLAN_EXPIRY["free"])

    row_count = len(df)
    try:
        USER_STATS["total_rows_processed"] += int(row_count)
    except Exception:
        USER_STATS["total_rows_processed"] = int(row_count)

    # Store raw file to B2 for cross-device session restore
    storage_key = _store_to_b2(file.filename, content)

    result = {
        "file_name":            file.filename,
        "session_id":           session_id,
        "columns":              columns,
        "summary":              summary,
        "sample":               sample_rows,
        "row_count":            row_count,
        "total_rows_processed": USER_STATS.get("total_rows_processed", 0),
        "uploaded_at":          DATA_CACHE[session_id]["uploaded_at"],
        "expiry_minutes":       expiry_minutes,
        "storage_key":          storage_key,   # None when B2 is not configured
    }

    return sanitize_for_json(result)

# ── Correlation Matrix ────────────────────────────────────────────────────────

@router.get("/data/{session_id}/correlation")
def get_correlation(session_id: str):
    """
    Return Pearson correlation matrix for numeric columns only.
    Reads from the original uploaded DATA_CACHE — not the cleaning store —
    so the result is always based on raw data regardless of cleaning state.
    Non-numeric columns are excluded entirely (no label encoding).
    """
    df = get_session(session_id)
    if df is None:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Session not found or expired.")

    # Strict numeric filter — Pearson is only valid for continuous numeric data
    numeric_df = df.select_dtypes(include="number")

    # Drop constant columns (std == 0) — they produce NaN correlation everywhere
    numeric_df = numeric_df.loc[:, numeric_df.std() > 0]

    # Cap at 15 columns so the matrix stays readable; prefer columns with
    # the most variance (most informative) when trimming
    if len(numeric_df.columns) > 15:
        top_cols = numeric_df.std().nlargest(15).index
        numeric_df = numeric_df[top_cols]

    if len(numeric_df.columns) < 2:
        return {"columns": [], "matrix": {}, "shape": [0, 0],
                "note": "Fewer than 2 numeric columns — correlation matrix unavailable."}

    corr = numeric_df.corr(method="pearson")

    matrix: dict = {}
    for row in corr.index:
        matrix[row] = {}
        for col in corr.columns:
            val = corr.loc[row, col]
            matrix[row][col] = round(float(val), 4) if pd.notna(val) else None

    return {
        "columns": list(corr.columns),
        "matrix":  matrix,
        "shape":   list(corr.shape),
    }


# ── Routes ────────────────────────────────────────────────────────────────────

@router.post("/upload")
async def upload_endpoint(file: UploadFile, plan: str = "free"):
    return await process_file(file, plan=plan)

@router.post("/batch_uploads")
async def batch_uploads_endpoint(files: List[UploadFile], plan: str = "free"):
    results = []
    for f in files:
        results.append(await process_file(f, plan=plan))
    return results