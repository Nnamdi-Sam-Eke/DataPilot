from fastapi import APIRouter, UploadFile
import chardet  # pip install chardet
import pandas as pd
import io
from typing import Dict, Any, List
import uuid
from datetime import datetime, timedelta
import math
import warnings
import numpy as np

# --- Router ---
router = APIRouter()

# --- In-memory cache ---
DATA_CACHE = {}
EXPIRY_MINUTES = 180  # 3 hours

# --- Utility functions ---

def detect_encoding(content: bytes) -> str:
    result = chardet.detect(content)
    encoding = result.get("encoding") or "utf-8"
    return encoding

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
    "application/json": pd.read_json
}

def create_session(df: pd.DataFrame) -> str:
    session_id = str(uuid.uuid4())
    DATA_CACHE[session_id] = {
        "df": df,
        "created_at": datetime.utcnow()
    }
    return session_id

def get_session(session_id: str):
    session = DATA_CACHE.get(session_id)
    if not session:
        return None
    if datetime.utcnow() - session["created_at"] > timedelta(minutes=EXPIRY_MINUTES):
        del DATA_CACHE[session_id]
        return None
    return session["df"]

def generate_summary(df: pd.DataFrame) -> Dict[str, Any]:
    """
    Generate a summary dictionary similar to df.describe(include='all'),
    with additional safe handling for datetime columns across pandas versions.
    """
    try:
        # Preferred: use datetime_is_numeric if supported by pandas
        summary = df.describe(include="all", datetime_is_numeric=True).to_dict()
    except TypeError:
        # Fallback: describe without datetime numeric; then augment datetime cols
        summary = df.describe(include="all").to_dict()
        for col in df.columns:
            try:
                # suppress the 'Could not infer format' warning from pandas/dateutil
                with warnings.catch_warnings():
                    warnings.simplefilter("ignore", UserWarning)
                    converted = pd.to_datetime(df[col], errors="coerce", infer_datetime_format=True)
                if converted.notna().sum() > 0:
                    s_min = converted.min()
                    s_max = converted.max()
                    summary.setdefault(col, {})
                    # Provide ISO strings for min/max to avoid dtype issues
                    summary[col].update({
                        "min": s_min.isoformat() if pd.notna(s_min) else None,
                        "max": s_max.isoformat() if pd.notna(s_max) else None,
                        "count": int(converted.notna().sum()),
                        "unique": int(converted.nunique(dropna=True))
                    })
            except Exception:
                # If conversion fails, skip augmenting this column
                continue
    return summary

def sanitize_for_json(obj):
    """Recursively convert NaN/inf and numpy/pandas scalars to native JSON-safe types."""
    # dict
    if isinstance(obj, dict):
        return {k: sanitize_for_json(v) for k, v in obj.items()}
    # list/tuple
    if isinstance(obj, (list, tuple)):
        return [sanitize_for_json(v) for v in obj]
    # pandas Timestamp
    if isinstance(obj, pd.Timestamp):
        return obj.isoformat()
    # datetime
    if isinstance(obj, datetime):
        return obj.isoformat()
    # numpy scalar
    if isinstance(obj, np.generic):
        try:
            py = obj.item()
        except Exception:
            py = str(obj)
        return sanitize_for_json(py)
    # floats (python)
    if isinstance(obj, float):
        if math.isnan(obj) or math.isinf(obj):
            return None
        return obj
    # ints, bools, None
    if isinstance(obj, (int, bool)) or obj is None:
        return obj
    # strings
    if isinstance(obj, str):
        return obj
    # fallback: try to convert pandas / numpy objects safely
    try:
        # e.g., numpy arrays, pandas NA, etc.
        if pd.isna(obj):
            return None
    except Exception:
        pass
    # last resort: convert to string
    return str(obj)

async def process_file(file: UploadFile) -> Dict[str, Any]:
    """Process a single file safely, handle NaNs, parse dates, cache data."""
    if file.content_type not in READERS:
        return sanitize_for_json({"file_name": file.filename, "error": f"Unsupported file type: {file.content_type}"})

    try:
        content = await file.read()
        buffer = io.BytesIO(content)
        df = READERS[file.content_type](buffer)

        if df.empty:
            return sanitize_for_json({"file_name": file.filename, "error": "File is empty"})

        # Optional: coerce any object columns that look like dates
        for col in df.select_dtypes(include=["object"]).columns:
            try:
                with warnings.catch_warnings():
                    warnings.simplefilter("ignore", UserWarning)
                    converted = pd.to_datetime(df[col], errors="coerce", infer_datetime_format=True)  # fallback for inconsistent formats
                if converted.notna().any():  # only replace if at least some valid dates
                    df[col] = converted
            except Exception:
                pass

    except Exception as e:
        return sanitize_for_json({"file_name": file.filename, "error": f"Failed to parse dataset: {str(e)}"})

    # Use the robust summary generator to avoid datetime.describe issues
    summary = generate_summary(df)
    columns = df.columns.tolist()
    sample_rows = df.head(5).to_dict(orient="records")
    session_id = create_session(df)

    result = {
        "file_name": file.filename,
        "session_id": session_id,
        "columns": columns,
        "summary": summary,
        "sample": sample_rows,
        "row_count": len(df)
    }

    return sanitize_for_json(result)

# --- API Routes ---
@router.post("/upload")
async def upload_endpoint(file: UploadFile):
    return await process_file(file)

@router.post("/batch_uploads")
async def batch_uploads_endpoint(files: List[UploadFile]):
    """
    Accepts multiple files in a single request (multipart/form-data).
    Returns a list of individual processing results.
    """
    results = []
    for f in files:
        results.append(await process_file(f))
    # results are already sanitized in process_file
    return results