"""
routers/clean.py
Handles all data-cleaning operations against an in-memory session DataFrame.
Each operation mutates a per-session copy stored in CLEAN_STORE, keeping the
original DATA_CACHE intact so the user can always undo back to square one.

Memory design: undo history is stored as Parquet bytes (not live DataFrames),
which is 5-10x smaller. Cap is 5 snapshots to bound worst-case RAM usage.
"""

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import Optional, Dict
import pandas as pd
import numpy as np
import io
import copy
import logging

router = APIRouter(prefix="/clean", tags=["clean"])

logger = logging.getLogger(__name__)

# ── shared state ─────────────────────────────────────────────────────────────
# Imported lazily to avoid circular imports
def _get_data_cache():
    from routers.upload import DATA_CACHE
    return DATA_CACHE

# Per-session cleaning state:
#   session_id → { "history": [parquet_bytes, …], "current": df }
# History entries are Parquet-serialised bytes to minimise RAM footprint.
CLEAN_STORE: dict = {}

# Max undo steps kept per session — kept low to bound memory usage
_MAX_UNDO = 5


def _df_to_bytes(df: pd.DataFrame) -> bytes:
    """Serialise a DataFrame to Parquet bytes (compact, fast)."""
    buf = io.BytesIO()
    df.to_parquet(buf, index=True, engine="pyarrow")
    return buf.getvalue()


def _bytes_to_df(data: bytes) -> pd.DataFrame:
    """Deserialise Parquet bytes back to a DataFrame."""
    return pd.read_parquet(io.BytesIO(data))


def _get_or_init(session_id: str) -> pd.DataFrame:
    """
    Return the working DataFrame for a session, initialising from DATA_CACHE
    on first call so we never mutate the original.
    """
    if session_id not in CLEAN_STORE:
        cache = _get_data_cache()
        if session_id not in cache:
            raise HTTPException(status_code=404, detail="Session not found. Please re-upload the file.")
        original_df: pd.DataFrame = cache[session_id]["df"]
        CLEAN_STORE[session_id] = {
            "history": [],          # list of Parquet bytes (undo stack)
            "current": original_df.copy(),
        }
    return CLEAN_STORE[session_id]["current"]


def _save_snapshot(session_id: str, df: pd.DataFrame):
    """
    Push current state onto undo stack as Parquet bytes, then set new current.
    Capped at _MAX_UNDO entries — oldest snapshot dropped when exceeded.
    """
    entry = CLEAN_STORE[session_id]
    try:
        snapshot_bytes = _df_to_bytes(entry["current"])
    except Exception:
        # Parquet serialisation failed (e.g. mixed types) — skip this snapshot
        snapshot_bytes = None

    if snapshot_bytes is not None:
        entry["history"].append(snapshot_bytes)
        if len(entry["history"]) > _MAX_UNDO:
            entry["history"].pop(0)
    entry["current"] = df


def _summary_for(df: pd.DataFrame) -> dict:
    """
    Return a summary dict that matches the shape produced by upload.py's
    generate_summary() (which wraps df.describe(include='all')).
    Key contract:  summary[col]["count"] = non-null count  (same as describe)
    PageOverview and PageCleaning both compute missing as  rowCount - count.
    """
    full: dict = {
        "__meta__": {"duplicates": int(df.duplicated().sum())}
    }
    for col in df.columns:
        s = df[col]
        non_null = int(s.count())          # matches describe() "count" semantics
        cs: dict = {
            "dtype":  str(s.dtype),
            "count":  non_null,            # NON-NULL count — mirrors describe()
            "unique": int(s.nunique()),
        }
        if pd.api.types.is_numeric_dtype(s) and non_null > 0:
            cs["mean"] = round(float(s.mean()), 4)
            cs["std"]  = round(float(s.std()),  4)
            cs["min"]  = round(float(s.min()),  4)
            cs["max"]  = round(float(s.max()),  4)
        else:
            try:
                vc = s.value_counts()
                if len(vc):
                    cs["freq"] = int(vc.iloc[0])
                    cs["top"]  = str(vc.index[0])
            except Exception:
                pass
        full[col] = cs
    return full


# ── Pydantic models ───────────────────────────────────────────────────────────
class FillMissingBody(BaseModel):
    column:   str
    strategy: str   # mean | median | mode | zero | ffill | bfill | drop

class FillAllMissingBody(BaseModel):
    strategies: Dict[str, str]   # { col: strategy }

class DropColumnBody(BaseModel):
    column: str

class RenameColumnBody(BaseModel):
    old_name: str
    new_name: str

class CastColumnBody(BaseModel):
    column: str
    dtype:  str   # int | float | str | datetime | bool

class EncodeColumnBody(BaseModel):
    column: str
    strategy: str   # label | onehot | ignore

# ── endpoints ─────────────────────────────────────────────────────────────────

@router.get("/{session_id}/summary")
def get_summary(session_id: str):
    df = _get_or_init(session_id)
    return {
        "columns":   list(df.columns),
        "row_count": len(df),
        "summary":   _summary_for(df),
    }


@router.post("/{session_id}/fill_missing")
def fill_missing(session_id: str, body: FillMissingBody):
    df = _get_or_init(session_id).copy()

    if body.column not in df.columns:
        raise HTTPException(status_code=400, detail=f"Column '{body.column}' not found.")

    col_name = body.column
    requested_strategy = body.strategy
    original_missing = int(df[col_name].isna().sum())

    if original_missing == 0:
        return {
            "message": f"Column '{col_name}' has no missing values.",
            "filled_count": 0,
            "used_strategy": requested_strategy
        }

    strategy = requested_strategy

    if requested_strategy in ("mean", "median"):
        col = df[col_name]
        if pd.api.types.is_numeric_dtype(col) and col.notna().any():
            fill_value = col.mean() if requested_strategy == "mean" else col.median()
            df[col_name] = col.fillna(fill_value)
        else:
            # Fallback for CouponCode-style alphanumeric columns
            mode_val = col.mode(dropna=True)
            fill_value = mode_val.iloc[0] if not mode_val.empty else ""
            df[col_name] = col.fillna(fill_value)
            strategy = f"{requested_strategy} (fallback to mode)"

    elif requested_strategy == "mode":
        col = df[col_name]
        mode_val = col.mode(dropna=True)
        fill_value = mode_val.iloc[0] if not mode_val.empty else ""
        df[col_name] = col.fillna(fill_value)
        strategy = "mode"

    elif requested_strategy == "zero":
        col = df[col_name]
        fill_value = 0 if pd.api.types.is_numeric_dtype(col) else ""
        df[col_name] = col.fillna(fill_value)

    elif requested_strategy == "ffill":
        df[col_name] = df[col_name].ffill()
    elif requested_strategy == "bfill":
        df[col_name] = df[col_name].bfill()
    elif requested_strategy == "drop":
        df = df.dropna(subset=[col_name])
    else:
        raise HTTPException(status_code=400, detail=f"Unknown strategy: {requested_strategy}")

    _save_snapshot(session_id, df)

    return {
        "message": f"Filled {original_missing} missing values in '{col_name}' using {strategy}.",
        "filled_count": original_missing,
        "used_strategy": strategy
    }


@router.post("/{session_id}/fill_all_missing")
def fill_all_missing(session_id: str, body: FillAllMissingBody):
    df = _get_or_init(session_id).copy()
    total_filled = 0
    applied = {}

    for col_name, requested_strategy in body.strategies.items():
        if col_name not in df.columns:
            continue

        col = df[col_name]                    # ← Fresh reference every time
        n_missing = int(col.isna().sum())
        if n_missing == 0:
            continue

        strategy = requested_strategy

        if requested_strategy in ("mean", "median"):
            if pd.api.types.is_numeric_dtype(col) and col.notna().any():
                fill_value = col.mean() if requested_strategy == "mean" else col.median()
                df[col_name] = col.fillna(fill_value)
            else:
                # Smart fallback for alphanumeric columns like CouponCode
                mode_val = col.mode(dropna=True)
                fill_value = mode_val.iloc[0] if not mode_val.empty else ""
                df[col_name] = col.fillna(fill_value)
                strategy = "mode (auto-fallback)"

        elif requested_strategy == "mode":
            mode_val = col.mode(dropna=True)
            fill_value = mode_val.iloc[0] if not mode_val.empty else ""
            df[col_name] = col.fillna(fill_value)

        elif requested_strategy == "zero":
            fill_value = 0 if pd.api.types.is_numeric_dtype(col) else ""
            df[col_name] = col.fillna(fill_value)

        elif requested_strategy == "ffill":
            df[col_name] = df[col_name].ffill()
        elif requested_strategy == "bfill":
            df[col_name] = df[col_name].bfill()
        elif requested_strategy == "drop":
            df = df.dropna(subset=[col_name])
        else:
            continue

        total_filled += n_missing
        applied[col_name] = strategy

    _save_snapshot(session_id, df)

    return {
        "message": f"Successfully filled {total_filled} missing values across {len(applied)} columns.",
        "total_filled": total_filled,
        "applied_strategies": applied
    }


@router.post("/{session_id}/drop_column")
def drop_column(session_id: str, body: DropColumnBody):
    df = _get_or_init(session_id).copy()
    if body.column not in df.columns:
        raise HTTPException(status_code=400, detail=f"Column '{body.column}' not found.")
    df = df.drop(columns=[body.column])
    _save_snapshot(session_id, df)
    return {"message": f"Dropped column '{body.column}'."}


@router.post("/{session_id}/rename_column")
def rename_column(session_id: str, body: RenameColumnBody):
    df = _get_or_init(session_id).copy()
    if body.old_name not in df.columns:
        raise HTTPException(status_code=400, detail=f"Column '{body.old_name}' not found.")
    if body.new_name in df.columns:
        raise HTTPException(status_code=400, detail=f"Column '{body.new_name}' already exists.")
    df = df.rename(columns={body.old_name: body.new_name})
    _save_snapshot(session_id, df)
    return {"message": f"Renamed '{body.old_name}' to '{body.new_name}'."}


@router.post("/{session_id}/drop_duplicates")
def drop_duplicates(session_id: str):
    df = _get_or_init(session_id).copy()
    n_before = len(df)
    df = df.drop_duplicates()
    n_removed = n_before - len(df)
    _save_snapshot(session_id, df)
    return {"message": f"Removed {n_removed} duplicate rows. {len(df)} rows remain."}


@router.post("/{session_id}/cast_column")
def cast_column(session_id: str, body: CastColumnBody):
    df = _get_or_init(session_id).copy()
    if body.column not in df.columns:
        raise HTTPException(status_code=400, detail=f"Column '{body.column}' not found.")

    col = df[body.column]
    try:
        if body.dtype == "int":
            df[body.column] = pd.to_numeric(col, errors="coerce").astype("Int64")
        elif body.dtype == "float":
            df[body.column] = pd.to_numeric(col, errors="coerce").astype(float)
        elif body.dtype == "str":
            df[body.column] = col.astype(str)
        elif body.dtype == "datetime":
            df[body.column] = pd.to_datetime(col, errors="coerce")
        elif body.dtype == "bool":
            df[body.column] = col.map(lambda x: str(x).strip().lower() in ("true","1","yes","y"))
        else:
            raise HTTPException(status_code=400, detail=f"Unknown dtype: {body.dtype}")
    except Exception as e:
        raise HTTPException(status_code=422, detail=f"Cast failed: {str(e)}")

    nulls_introduced = int(df[body.column].isna().sum()) - int(col.isna().sum())
    _save_snapshot(session_id, df)
    msg = f"Cast '{body.column}' to {body.dtype}."
    if nulls_introduced > 0:
        msg += f" {nulls_introduced} values became null (unconvertible)."
    return {"message": msg}

@router.post("/{session_id}/encode_column")
def encode_column(session_id: str, body: EncodeColumnBody):
    df = _get_or_init(session_id).copy()

    if body.column not in df.columns:
        raise HTTPException(status_code=400, detail=f"Column '{body.column}' not found.")

    strategy = body.strategy
    col = df[body.column]

    if strategy == "ignore":
        return {"message": f"Ignored '{body.column}'."}

    if strategy == "label":
        values = col.astype(str).fillna("Missing")
        categories = pd.Series(values.unique()).sort_values().tolist()
        mapping = {cat: idx for idx, cat in enumerate(categories)}
        df[body.column] = values.map(mapping).astype("Int64")
        _save_snapshot(session_id, df)
        return {
            "message": f"Label-encoded '{body.column}' into integer categories.",
            "mapping": mapping,
        }

    if strategy == "onehot":
        values = col.astype(str).fillna("Missing")
        dummies = pd.get_dummies(values, prefix=body.column, dtype=int)

        if dummies.shape[1] == 0:
            raise HTTPException(status_code=400, detail=f"No categories found in '{body.column}'.")

        df = df.drop(columns=[body.column])
        df = pd.concat([df, dummies], axis=1)
        _save_snapshot(session_id, df)
        return {
            "message": f"One-hot encoded '{body.column}' into {dummies.shape[1]} column(s).",
            "created_columns": dummies.columns.tolist(),
        }

    raise HTTPException(status_code=400, detail=f"Unknown encoding strategy: {strategy}")

@router.post("/{session_id}/undo")
def undo(session_id: str):
    if session_id not in CLEAN_STORE:
        raise HTTPException(status_code=404, detail="Session not found.")
    entry = CLEAN_STORE[session_id]
    if not entry["history"]:
        raise HTTPException(status_code=400, detail="Nothing to undo.")
    snapshot_bytes = entry["history"].pop()
    try:
        entry["current"] = _bytes_to_df(snapshot_bytes)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Undo failed: could not restore snapshot ({e})")
    return {"message": "Last operation undone."}



@router.post("/{session_id}/promote")
def promote_to_active(session_id: str):
    """
    Promote the cleaned DataFrame as a brand-new session and
    completely remove the original uncleaned session.
    This prevents duplicate files in the upload list.
    """
    from routers.upload import DATA_CACHE, create_session

    # Get the cleaned dataframe
    df = _get_or_init(session_id)

    # Try to preserve a friendly filename from the original session if available
    orig_meta = DATA_CACHE.get(session_id, {})
    orig_file = orig_meta.get("file_name") or orig_meta.get("fileName")
    cleaned_file_name = None
    if orig_file:
        # Append _cleaned before extension if present
        parts = orig_file.rsplit(".", 1)
        if len(parts) == 2:
            cleaned_file_name = f"{parts[0]}_cleaned.{parts[1]}"
        else:
            cleaned_file_name = f"{orig_file}_cleaned"

    # 1. Create the new cleaned session; pass cleaned filename so it's discoverable
    new_session_id = create_session(df.copy(), file_name=cleaned_file_name)

    # 2. Delete the original uncleaned session completely
    if session_id in DATA_CACHE:
        del DATA_CACHE[session_id]

    # Also clean up auxiliary caches
    try:
        CLEAN_STORE.pop(session_id, None)
    except Exception:
        pass

    try:
        from routers.insights import CONTEXT_CACHE
        CONTEXT_CACHE.pop(session_id, None)
    except Exception:
        pass

    try:
        from routers.report import REPORT_CACHE
        REPORT_CACHE.pop(session_id, None)
    except Exception:
        pass

    logger.info(
        f"✅ Promoted cleaned session {new_session_id[:8]}... "
        f"and removed original uncleaned session {session_id[:8]}..."
    )

    return {
        "new_session_id": new_session_id,
        "columns": list(df.columns),
        "row_count": len(df),
        "summary": _summary_for(df),
        "fileName": cleaned_file_name or f"Cleaned_{new_session_id[:8]}",
        "message": f"Cleaned data is now active. Original dataset was removed.",
        "original_removed": True
    }


@router.get("/{session_id}/export")
def export_csv(session_id: str):
    df = _get_or_init(session_id)
    buf = io.StringIO()
    df.to_csv(buf, index=False)
    buf.seek(0)
    return StreamingResponse(
        iter([buf.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="cleaned_{session_id[:8]}.csv"'},
    )