"""
routers/clean.py
Handles all data-cleaning operations against an in-memory session DataFrame.
Each operation mutates a per-session copy stored in CLEAN_STORE, keeping the
original DATA_CACHE intact so the user can always undo back to square one.
"""

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import Optional, Dict
import pandas as pd
import numpy as np
import io
import copy

router = APIRouter(prefix="/clean", tags=["clean"])

# ── shared state ─────────────────────────────────────────────────────────────
# Imported lazily to avoid circular imports
def _get_data_cache():
    from routers.upload import DATA_CACHE
    return DATA_CACHE

# Per-session cleaning state:  session_id → { "history": [df0, df1, …], "current": df }
CLEAN_STORE: dict = {}


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
            "history": [],          # list of DataFrames (undo stack)
            "current": original_df.copy(),
        }
    return CLEAN_STORE[session_id]["current"]


def _save_snapshot(session_id: str, df: pd.DataFrame):
    """Push current state onto undo stack, then set new current."""
    entry = CLEAN_STORE[session_id]
    entry["history"].append(entry["current"].copy())
    if len(entry["history"]) > 20:          # cap undo stack at 20
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

    col = df[body.column]
    strategy = body.strategy

    if strategy == "mean":
        val = col.mean()
        df[body.column] = col.fillna(val)
    elif strategy == "median":
        val = col.median()
        df[body.column] = col.fillna(val)
    elif strategy == "mode":
        val = col.mode()
        df[body.column] = col.fillna(val[0] if len(val) else 0)
    elif strategy == "zero":
        df[body.column] = col.fillna(0 if pd.api.types.is_numeric_dtype(col) else "")
    elif strategy == "ffill":
        df[body.column] = col.ffill()
    elif strategy == "bfill":
        df[body.column] = col.bfill()
    elif strategy == "drop":
        df = df.dropna(subset=[body.column])
    else:
        raise HTTPException(status_code=400, detail=f"Unknown strategy: {strategy}")

    _save_snapshot(session_id, df)
    filled = int(col.isna().sum())
    return {"message": f"Filled {filled} missing values in '{body.column}' using {strategy}."}


@router.post("/{session_id}/fill_all_missing")
def fill_all_missing(session_id: str, body: FillAllMissingBody):
    df = _get_or_init(session_id).copy()
    total_filled = 0

    for col_name, strategy in body.strategies.items():
        if col_name not in df.columns:
            continue
        col = df[col_name]
        n_missing = int(col.isna().sum())
        if n_missing == 0:
            continue
        if strategy == "mean":
            df[col_name] = col.fillna(col.mean())
        elif strategy == "median":
            df[col_name] = col.fillna(col.median())
        elif strategy == "mode":
            m = col.mode()
            df[col_name] = col.fillna(m[0] if len(m) else 0)
        elif strategy == "zero":
            df[col_name] = col.fillna(0 if pd.api.types.is_numeric_dtype(col) else "")
        elif strategy == "ffill":
            df[col_name] = col.ffill()
        elif strategy == "bfill":
            df[col_name] = col.bfill()
        elif strategy == "drop":
            df = df.dropna(subset=[col_name])
        total_filled += n_missing

    _save_snapshot(session_id, df)
    return {"message": f"Filled {total_filled} missing values across {len(body.strategies)} columns."}


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
    entry["current"] = entry["history"].pop()
    return {"message": "Last operation undone."}



@router.post("/{session_id}/promote")
def promote_to_active(session_id: str):
    """
    Register the cleaned DataFrame as a brand-new session in DATA_CACHE
    so all other pages (Overview, Train, Insights, Viz, Report) can use it.
    Returns the new session_id to the frontend, which then switches context.
    """
    from routers.upload import DATA_CACHE, create_session
    df = _get_or_init(session_id)
    new_session_id = create_session(df.copy())
    return {
        "new_session_id": new_session_id,
        "columns":        list(df.columns),
        "row_count":      len(df),
        "summary":        _summary_for(df),
        "message":        f"Cleaned data promoted — new session {new_session_id[:8]}…",
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