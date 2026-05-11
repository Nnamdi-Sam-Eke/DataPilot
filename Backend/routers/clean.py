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
from typing import Optional, Dict, List
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

# ── NEW models ────────────────────────────────────────────────────────────────

class CapOutliersBody(BaseModel):
    column:    str
    method:    str   = "iqr"   # iqr | zscore
    action:    str   = "cap"   # cap | remove
    threshold: float = 1.5     # IQR multiplier or z-score cutoff

class StringOpBody(BaseModel):
    column:    str
    operation: str             # trim | lower | upper | title | strip_special

class FilterRowsBody(BaseModel):
    column:   str
    operator: str              # eq | ne | gt | lt | gte | lte | contains | startswith | endswith | isnull | notnull
    value:    Optional[str] = None
    keep:     bool = True      # True = keep matching rows, False = drop them

class FindReplaceBody(BaseModel):
    column:        Optional[str] = None  # None → all columns
    find_value:    str
    replace_value: str
    regex:         bool = False

class NormalizeBody(BaseModel):
    column: str
    method: str   # minmax | zscore

class ExtractDatePartsBody(BaseModel):
    column: str
    parts:  List[str]   # any of: year month day weekday hour quarter minute

class BinColumnBody(BaseModel):
    column:       str
    n_bins:       int  = 5
    method:       str  = "equal_width"  # equal_width | equal_freq
    new_col_name: Optional[str] = None

class DerivedColumnBody(BaseModel):
    new_col_name: str
    col_a:        str
    col_b:        Optional[str] = None
    operation:    str  # add | subtract | multiply | divide | concat | abs | log | sqrt | round

class DropDuplicatesSubsetBody(BaseModel):
    subset: List[str]
    keep:   str = "first"  # first | last

class ParseNumberBody(BaseModel):
    column: str
    format: str = "auto"   # auto | currency | percentage | comma_separated

class SplitColumnBody(BaseModel):
    column: str
    delimiter: str = " "
    new_col_names: Optional[List[str]] = None  # e.g. ["first_name", "last_name"]
    drop_original: bool = False

class ExtractRegexBody(BaseModel):
    column: str
    pattern: str
    new_col_name: Optional[str] = None
    drop_original: bool = False

class CreateFlagBody(BaseModel):
    new_col_name: str
    column: str
    operator: str          # contains, startswith, endswith, regex, eq, gt, lt, etc.
    value: Optional[str] = None

class GroupByBody(BaseModel):
    group_by: List[str]
    agg_column: str
    agg_func: str = "mean"   # mean, sum, count, min, max, median, std, nunique
    new_col_name: Optional[str] = None

class CustomFormulaBody(BaseModel):
    new_col_name: str
    formula: str   # e.g. "col1 + col2 * 2", "log(col1)", "col1 > 100"


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
            mode_val = col.mode(dropna=True)
            fill_value = mode_val.iloc[0] if not mode_val.empty else ""
            df[col_name] = col.fillna(fill_value)
            strategy = f"{requested_strategy} (fallback to mode)"

    elif requested_strategy == "mode":
        col = df[col_name]
        mode_val = col.mode(dropna=True)
        fill_value = mode_val.iloc[0] if not mode_val.empty else ""
        df[col_name] = col.fillna(fill_value)

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

        col = df[col_name]
        n_missing = int(col.isna().sum())
        if n_missing == 0:
            continue

        strategy = requested_strategy

        if requested_strategy in ("mean", "median"):
            if pd.api.types.is_numeric_dtype(col) and col.notna().any():
                fill_value = col.mean() if requested_strategy == "mean" else col.median()
                df[col_name] = col.fillna(fill_value)
            else:
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


# ── NEW endpoints ─────────────────────────────────────────────────────────────

@router.post("/{session_id}/cap_outliers")
def cap_outliers(session_id: str, body: CapOutliersBody):
    """Detect and cap or remove outliers using IQR or z-score method."""
    df = _get_or_init(session_id).copy()
    col = body.column
    if col not in df.columns:
        raise HTTPException(400, f"Column '{col}' not found.")
    if not pd.api.types.is_numeric_dtype(df[col]):
        raise HTTPException(400, f"Column '{col}' is not numeric.")

    s = df[col].dropna()
    if len(s) < 4:
        raise HTTPException(400, f"Not enough non-null values in '{col}' to detect outliers.")

    if body.method == "iqr":
        q1, q3 = s.quantile(0.25), s.quantile(0.75)
        iqr = q3 - q1
        lower = q1 - body.threshold * iqr
        upper = q3 + body.threshold * iqr
    elif body.method == "zscore":
        mean, std = s.mean(), s.std()
        if std == 0:
            raise HTTPException(400, f"Column '{col}' has zero variance; cannot compute z-scores.")
        lower = mean - body.threshold * std
        upper = mean + body.threshold * std
    else:
        raise HTTPException(400, f"Unknown method: {body.method}")

    mask = (df[col] < lower) | (df[col] > upper)
    n_outliers = int(mask.sum())

    if n_outliers == 0:
        return {
            "message": f"No outliers detected in '{col}' ({body.method.upper()}, threshold={body.threshold}).",
            "affected_rows": 0
        }

    if body.action == "cap":
        df[col] = df[col].clip(lower=lower, upper=upper)
        msg = f"Capped {n_outliers} outlier(s) in '{col}' to [{lower:.4g}, {upper:.4g}]."
    elif body.action == "remove":
        df = df[~mask]
        msg = f"Removed {n_outliers} outlier row(s) from '{col}'. {len(df)} rows remain."
    else:
        raise HTTPException(400, f"Unknown action: {body.action}")

    _save_snapshot(session_id, df)
    return {"message": msg, "affected_rows": n_outliers}


@router.post("/{session_id}/string_op")
def string_op(session_id: str, body: StringOpBody):
    """Apply a string transformation to a column (trim, case, strip special chars)."""
    df = _get_or_init(session_id).copy()
    col = body.column
    if col not in df.columns:
        raise HTTPException(400, f"Column '{col}' not found.")

    s = df[col].astype(str)
    op = body.operation

    if   op == "trim":          df[col] = s.str.strip()
    elif op == "lower":         df[col] = s.str.lower()
    elif op == "upper":         df[col] = s.str.upper()
    elif op == "title":         df[col] = s.str.title()
    elif op == "strip_special": df[col] = s.str.replace(r"[^A-Za-z0-9 _\-]", "", regex=True)
    else:
        raise HTTPException(400, f"Unknown operation: {op}")

    _save_snapshot(session_id, df)
    return {"message": f"Applied '{op}' to column '{col}'."}


@router.post("/{session_id}/filter_rows")
def filter_rows(session_id: str, body: FilterRowsBody):
    """Keep or drop rows matching a column condition."""
    df = _get_or_init(session_id).copy()
    col = body.column
    if col not in df.columns:
        raise HTTPException(400, f"Column '{col}' not found.")

    n_before = len(df)
    val = body.value
    op  = body.operator

    try:
        if   op == "isnull":     mask = df[col].isna()
        elif op == "notnull":    mask = df[col].notna()
        elif op == "contains":   mask = df[col].astype(str).str.contains(val or "", na=False)
        elif op == "startswith": mask = df[col].astype(str).str.startswith(val or "", na=False)
        elif op == "endswith":   mask = df[col].astype(str).str.endswith(val or "", na=False)
        else:
            cmp_val: any = val
            if pd.api.types.is_numeric_dtype(df[col]):
                try:
                    cmp_val = float(val)
                except (TypeError, ValueError):
                    raise HTTPException(400, f"Value '{val}' is not numeric for column '{col}'.")
            if   op == "eq":  mask = df[col] == cmp_val
            elif op == "ne":  mask = df[col] != cmp_val
            elif op == "gt":  mask = df[col] >  cmp_val
            elif op == "lt":  mask = df[col] <  cmp_val
            elif op == "gte": mask = df[col] >= cmp_val
            elif op == "lte": mask = df[col] <= cmp_val
            else: raise HTTPException(400, f"Unknown operator: {op}")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(422, f"Filter error: {e}")

    df = df[mask] if body.keep else df[~mask]
    n_affected = abs(n_before - len(df))
    action = "Kept" if body.keep else "Dropped"
    _save_snapshot(session_id, df)
    return {"message": f"{action} {n_affected} row(s). {len(df)} row(s) remain."}


@router.post("/{session_id}/find_replace")
def find_replace(session_id: str, body: FindReplaceBody):
    """Replace specific cell values across one or all columns.
    Useful for converting non-standard nulls like 'N/A', '?', '-' to NaN.
    """
    df = _get_or_init(session_id).copy()

    cols = ([body.column] if body.column and body.column in df.columns
            else list(df.columns))

    find_val = body.find_value
    repl_val = body.replace_value
    total = 0
    NULL_SENTINELS = {"nan", "null", "none", ""}

    for c in cols:
        if body.regex:
            try:
                hits = df[c].astype(str).str.contains(find_val, regex=True, na=False)
                total += int(hits.sum())
                df[c] = df[c].astype(str).str.replace(find_val, repl_val, regex=True)
            except Exception as e:
                raise HTTPException(422, f"Regex error on '{c}': {e}")
        else:
            exact = df[c].astype(str) == str(find_val)
            total += int(exact.sum())
            if repl_val.lower() in NULL_SENTINELS:
                df.loc[exact, c] = np.nan
            else:
                df.loc[exact, c] = repl_val

    scope = f"'{body.column}'" if body.column and body.column in df.columns else "all columns"
    _save_snapshot(session_id, df)
    return {"message": f"Replaced {total} occurrence(s) of '{find_val}' → '{repl_val}' in {scope}."}


@router.post("/{session_id}/normalize")
def normalize_column(session_id: str, body: NormalizeBody):
    """Normalize a numeric column using min-max scaling or z-score standardisation."""
    df = _get_or_init(session_id).copy()
    col = body.column
    if col not in df.columns:
        raise HTTPException(400, f"Column '{col}' not found.")
    if not pd.api.types.is_numeric_dtype(df[col]):
        raise HTTPException(400, f"Column '{col}' is not numeric.")

    s = df[col]
    if body.method == "minmax":
        mn, mx = float(s.min()), float(s.max())
        if mx == mn:
            raise HTTPException(400, "All values are identical — min-max normalization is undefined.")
        df[col] = (s - mn) / (mx - mn)
        msg = f"Min-max normalized '{col}' to [0, 1]."
    elif body.method == "zscore":
        mean, std = float(s.mean()), float(s.std())
        if std == 0:
            raise HTTPException(400, "Zero variance — z-score standardization is undefined.")
        df[col] = (s - mean) / std
        msg = f"Z-score standardized '{col}' (μ=0, σ=1)."
    else:
        raise HTTPException(400, f"Unknown method: {body.method}")

    _save_snapshot(session_id, df)
    return {"message": msg}


@router.post("/{session_id}/extract_date_parts")
def extract_date_parts(session_id: str, body: ExtractDatePartsBody):
    """Extract date components (year, month, day, etc.) from a datetime column into new columns."""
    df = _get_or_init(session_id).copy()
    col = body.column
    if col not in df.columns:
        raise HTTPException(400, f"Column '{col}' not found.")

    try:
        dt = pd.to_datetime(df[col], errors="coerce")
    except Exception as e:
        raise HTTPException(422, f"Cannot parse '{col}' as datetime: {e}")

    EXTRACTORS = {
        "year":    lambda d: d.dt.year,
        "month":   lambda d: d.dt.month,
        "day":     lambda d: d.dt.day,
        "weekday": lambda d: d.dt.dayofweek,   # 0 = Monday
        "hour":    lambda d: d.dt.hour,
        "quarter": lambda d: d.dt.quarter,
        "minute":  lambda d: d.dt.minute,
    }

    created = []
    for part in body.parts:
        extractor = EXTRACTORS.get(part)
        if extractor is None:
            continue
        new_col = f"{col}_{part}"
        df[new_col] = extractor(dt)
        created.append(new_col)

    if not created:
        raise HTTPException(400, "No valid date parts specified. Use: year month day weekday hour quarter minute")

    _save_snapshot(session_id, df)
    return {"message": f"Extracted {len(created)} part(s) from '{col}': {', '.join(created)}."}


@router.post("/{session_id}/bin_column")
def bin_column(session_id: str, body: BinColumnBody):
    """Bin a numeric column into discrete buckets (pd.cut or pd.qcut)."""
    df = _get_or_init(session_id).copy()
    col = body.column
    if col not in df.columns:
        raise HTTPException(400, f"Column '{col}' not found.")
    if not pd.api.types.is_numeric_dtype(df[col]):
        raise HTTPException(400, f"Column '{col}' is not numeric.")

    n     = max(2, min(body.n_bins, 50))
    new_c = (body.new_col_name or f"{col}_bin").strip() or f"{col}_bin"

    try:
        if body.method == "equal_width":
            df[new_c] = pd.cut(df[col], bins=n, labels=False)
        elif body.method == "equal_freq":
            df[new_c] = pd.qcut(df[col], q=n, labels=False, duplicates="drop")
        else:
            raise HTTPException(400, f"Unknown method: {body.method}")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(422, f"Binning failed: {e}")

    _save_snapshot(session_id, df)
    return {"message": f"Binned '{col}' into up to {n} bucket(s) → new column '{new_c}'."}


@router.post("/{session_id}/derived_column")
def derived_column(session_id: str, body: DerivedColumnBody):
    """Create a new column from arithmetic or string operations on existing columns."""
    df = _get_or_init(session_id).copy()

    if body.col_a not in df.columns:
        raise HTTPException(400, f"Column '{body.col_a}' not found.")
    if body.col_b and body.col_b not in df.columns:
        raise HTTPException(400, f"Column '{body.col_b}' not found.")

    new_name = body.new_col_name.strip()
    if not new_name:
        raise HTTPException(400, "New column name cannot be empty.")

    a = df[body.col_a]
    b = df[body.col_b] if body.col_b else None

    TWO_COL_OPS = {"add", "subtract", "multiply", "divide", "concat"}
    if body.operation in TWO_COL_OPS and b is None:
        raise HTTPException(400, f"Operation '{body.operation}' requires a second column (col_b).")

    try:
        if   body.operation == "add":      df[new_name] = a + b
        elif body.operation == "subtract": df[new_name] = a - b
        elif body.operation == "multiply": df[new_name] = a * b
        elif body.operation == "divide":   df[new_name] = a / b.replace(0, np.nan)
        elif body.operation == "concat":   df[new_name] = a.astype(str) + b.astype(str)
        elif body.operation == "abs":      df[new_name] = a.abs()
        elif body.operation == "log":      df[new_name] = np.log(a.replace(0, np.nan))
        elif body.operation == "sqrt":     df[new_name] = np.sqrt(a.clip(lower=0))
        elif body.operation == "round":    df[new_name] = a.round(2)
        else:
            raise HTTPException(400, f"Unknown operation: {body.operation}")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(422, f"Derived column error: {e}")

    _save_snapshot(session_id, df)
    col_b_str = f", {body.col_b}" if body.col_b else ""
    return {"message": f"Created '{new_name}' = {body.operation}({body.col_a}{col_b_str})."}


@router.post("/{session_id}/drop_duplicates_subset")
def drop_duplicates_subset(session_id: str, body: DropDuplicatesSubsetBody):
    """Remove duplicates based on a specific subset of columns."""
    df = _get_or_init(session_id).copy()

    missing = [c for c in body.subset if c not in df.columns]
    if missing:
        raise HTTPException(400, f"Column(s) not found: {missing}")
    if not body.subset:
        raise HTTPException(400, "Subset cannot be empty.")

    n_before = len(df)
    keep = body.keep if body.keep in ("first", "last") else "first"
    df = df.drop_duplicates(subset=body.subset, keep=keep)
    n_removed = n_before - len(df)

    _save_snapshot(session_id, df)
    subset_str = ", ".join(f"'{c}'" for c in body.subset)
    return {"message": f"Removed {n_removed} duplicate row(s) by [{subset_str}]. {len(df)} rows remain."}


@router.post("/{session_id}/parse_number")
def parse_number(session_id: str, body: ParseNumberBody):
    """Parse formatted numeric strings like '$1,234', '45%', or '(500)' into real numbers."""
    df = _get_or_init(session_id).copy()
    col = body.column
    if col not in df.columns:
        raise HTTPException(400, f"Column '{col}' not found.")

    s = df[col].astype(str).str.strip()

    if body.format == "percentage":
        s = s.str.replace("%", "", regex=False).str.strip()
        df[col] = pd.to_numeric(s, errors="coerce") / 100
    else:
        # Strip currency symbols, thousand-separators, whitespace
        s = s.str.replace(r"[$€£¥₦,\s]", "", regex=True)
        # Handle accounting-style negatives: (1234) → -1234
        neg = s.str.startswith("(") & s.str.endswith(")")
        s = s.str.replace(r"[()]", "", regex=True)
        result = pd.to_numeric(s, errors="coerce")
        result[neg] = -result[neg]
        df[col] = result

    nulls = int(df[col].isna().sum())
    _save_snapshot(session_id, df)
    msg = f"Parsed '{col}' as numeric ({body.format})."
    if nulls > 0:
        msg += f" {nulls} value(s) could not be converted and became null."
    return {"message": msg}


@router.post("/{session_id}/split_column")
def split_column(session_id: str, body: SplitColumnBody):
    """Split a column by delimiter into multiple columns."""
    df = _get_or_init(session_id).copy()
    
    if body.column not in df.columns:
        raise HTTPException(400, f"Column '{body.column}' not found.")

    col = df[body.column].astype(str)

    if not body.delimiter:
        raise HTTPException(400, "Delimiter cannot be empty.")

    # Perform split
    split_df = col.str.split(body.delimiter, expand=True)

    # Auto-generate column names if not provided
    if not body.new_col_names or len(body.new_col_names) == 0:
        max_cols = split_df.shape[1]
        new_names = [f"{body.column}_{i+1}" for i in range(max_cols)]
    else:
        new_names = body.new_col_names
        # Pad if user gave fewer names
        while len(new_names) < split_df.shape[1]:
            new_names.append(f"{body.column}_{len(new_names)+1}")

    # Assign new columns
    for i, name in enumerate(new_names[:split_df.shape[1]]):
        df[name] = split_df.iloc[:, i]

    # Drop original if requested
    if body.drop_original:
        df = df.drop(columns=[body.column])

    _save_snapshot(session_id, df)

    created = new_names[:split_df.shape[1]]
    return {
        "message": f"Split '{body.column}' into {len(created)} columns: {', '.join(created)}",
        "created_columns": created,
        "dropped_original": body.drop_original
    }


@router.post("/{session_id}/extract_regex")
def extract_regex(session_id: str, body: ExtractRegexBody):
    """Extract patterns using regex (supports capture groups)."""
    df = _get_or_init(session_id).copy()
    
    if body.column not in df.columns:
        raise HTTPException(400, f"Column '{body.column}' not found.")
    if not body.pattern.strip():
        raise HTTPException(400, "Regex pattern cannot be empty.")

    try:
        extracted = df[body.column].astype(str).str.extract(body.pattern, expand=True)
    except Exception as e:
        raise HTTPException(422, f"Invalid regex pattern: {str(e)}")

    # Auto name or use provided
    base_name = body.new_col_name.strip() or f"{body.column}_extracted"
    
    if extracted.shape[1] == 1:
        df[base_name] = extracted.iloc[:, 0]
        created = [base_name]
    else:
        # Multiple capture groups
        created = []
        for i in range(extracted.shape[1]):
            col_name = f"{base_name}_{i+1}"
            df[col_name] = extracted.iloc[:, i]
            created.append(col_name)

    if body.drop_original:
        df = df.drop(columns=[body.column])

    _save_snapshot(session_id, df)

    return {
        "message": f"Extracted regex from '{body.column}' → {len(created)} column(s)",
        "created_columns": created,
        "dropped_original": body.drop_original
    }


@router.post("/{session_id}/create_flag")
def create_flag(session_id: str, body: CreateFlagBody):
    """Create a binary flag column (0/1) based on a condition."""
    df = _get_or_init(session_id).copy()
    
    if body.column not in df.columns:
        raise HTTPException(400, f"Column '{body.column}' not found.")
    if not body.new_col_name or not body.new_col_name.strip():
        raise HTTPException(400, "New column name is required.")

    new_name = body.new_col_name.strip()
    s = df[body.column].astype(str) if body.operator in ("contains", "startswith", "endswith", "regex") else df[body.column]

    try:
        if body.operator == "contains":
            df[new_name] = s.str.contains(body.value or "", na=False, regex=False).astype(int)
        elif body.operator == "startswith":
            df[new_name] = s.str.startswith(body.value or "", na=False).astype(int)
        elif body.operator == "endswith":
            df[new_name] = s.str.endswith(body.value or "", na=False).astype(int)
        elif body.operator == "regex":
            df[new_name] = s.str.contains(body.value or "", na=False, regex=True).astype(int)
        else:
            # Numeric/comparison operators
            cmp_val = float(body.value) if pd.api.types.is_numeric_dtype(df[body.column]) else body.value
            if   body.operator == "eq":  mask = df[body.column] == cmp_val
            elif body.operator == "ne":  mask = df[body.column] != cmp_val
            elif body.operator == "gt":  mask = df[body.column] >  cmp_val
            elif body.operator == "lt":  mask = df[body.column] <  cmp_val
            elif body.operator == "gte": mask = df[body.column] >= cmp_val
            elif body.operator == "lte": mask = df[body.column] <= cmp_val
            else:
                raise HTTPException(400, f"Unknown operator: {body.operator}")
            df[new_name] = mask.astype(int)
    except Exception as e:
        raise HTTPException(422, f"Flag creation failed: {str(e)}")

    _save_snapshot(session_id, df)
    return {"message": f"Created flag column '{new_name}' based on {body.column} {body.operator}"}


@router.post("/{session_id}/groupby")
def groupby_aggregate(session_id: str, body: GroupByBody):
    """Group by one or more columns and aggregate another."""
    df = _get_or_init(session_id).copy()

    missing = [c for c in body.group_by if c not in df.columns]
    if missing:
        raise HTTPException(400, f"Columns not found: {missing}")
    if body.agg_column not in df.columns:
        raise HTTPException(400, f"Aggregation column '{body.agg_column}' not found.")

    agg_map = {
        "mean": "mean", "sum": "sum", "count": "size", "min": "min",
        "max": "max", "median": "median", "std": "std", "nunique": "nunique"
    }
    func = agg_map.get(body.agg_func, "mean")

    grouped = df.groupby(body.group_by)[body.agg_column].agg(func).reset_index()

    new_name = body.new_col_name or f"{body.agg_column}_{body.agg_func}"
    grouped = grouped.rename(columns={body.agg_column: new_name})

    # Merge back to original (left join)
    df = df.merge(grouped, on=body.group_by, how="left")

    _save_snapshot(session_id, df)
    return {
        "message": f"Added {body.agg_func} of '{body.agg_column}' grouped by {body.group_by}",
        "new_column": new_name
    }


@router.post("/{session_id}/custom_formula")
def custom_formula(session_id: str, body: CustomFormulaBody):
    """Create column using pandas eval (safe subset of Python expressions)."""
    df = _get_or_init(session_id).copy()
    
    if not body.new_col_name or not body.new_col_name.strip():
        raise HTTPException(400, "New column name required.")
    if not body.formula or not body.formula.strip():
        raise HTTPException(400, "Formula cannot be empty.")

    new_name = body.new_col_name.strip()

    try:
        # Safe eval with local variables
        df[new_name] = df.eval(body.formula, engine='python')
    except Exception as e:
        raise HTTPException(422, f"Formula error: {str(e)}\n\nSupported: +, -, *, /, **, >, <, ==, etc. and functions like log(), abs(), sqrt()")

    _save_snapshot(session_id, df)
    return {"message": f"Created '{new_name}' using formula: {body.formula}"}

# ── Correlation Matrix ─────────────────────────────────────────────────────

class CorrelationMatrixBody(BaseModel):
    columns: Optional[List[str]] = None  # Optional: limit to specific columns


@router.post("/{session_id}/correlation")
def get_correlation_matrix(session_id: str, body: CorrelationMatrixBody = None):
    """
    Return full Pearson correlation matrix for all columns.
    Non-numeric columns are label-encoded so every column pair gets a real value.
    """
    if body is None:
        body = CorrelationMatrixBody()

    df = _get_or_init(session_id).copy()

    # Limit to requested columns or all columns (cap at 12 for display)
    cols = body.columns if body.columns else list(df.columns)
    cols = cols[:12]

    if len(cols) < 2:
        return {"error": "Need at least 2 columns.", "matrix": {}, "columns": []}

    # Build an all-numeric frame: numeric cols pass through, everything else label-encoded
    encoded = pd.DataFrame(index=df.index)
    for col in cols:
        if col not in df.columns:
            continue
        s = df[col]
        if pd.api.types.is_numeric_dtype(s):
            encoded[col] = pd.to_numeric(s, errors="coerce")
        else:
            # Label-encode: convert to string, sort categories, assign integers
            encoded[col] = pd.Categorical(
                s.astype(str).fillna("__null__")
            ).codes.astype(float)
            encoded[col] = encoded[col].replace(-1, np.nan)  # -1 = unseen in some pandas versions

    # Drop columns that are entirely NaN after encoding
    encoded = encoded.dropna(axis=1, how="all")

    if len(encoded.columns) < 2:
        return {"error": "Not enough encodable columns.", "matrix": {}, "columns": []}

    corr = encoded.corr(method="pearson")

    # Round and serialise — NaN becomes None (JSON null)
    matrix: dict = {}
    for row in corr.index:
        matrix[row] = {}
        for col in corr.columns:
            val = corr.loc[row, col]
            matrix[row][col] = round(float(val), 4) if pd.notna(val) else None

    return {
        "columns": list(corr.columns),
        "matrix": matrix,
        "shape": list(corr.shape),
    }
# ── undo / promote / export ───────────────────────────────────────────────────

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

    df = _get_or_init(session_id)

    orig_meta = DATA_CACHE.get(session_id, {})
    orig_file = orig_meta.get("file_name") or orig_meta.get("fileName")
    cleaned_file_name = None
    if orig_file:
        parts = orig_file.rsplit(".", 1)
        if len(parts) == 2:
            cleaned_file_name = f"{parts[0]}_cleaned.{parts[1]}"
        else:
            cleaned_file_name = f"{orig_file}_cleaned"

    new_session_id = create_session(df.copy(), file_name=cleaned_file_name)

    if session_id in DATA_CACHE:
        del DATA_CACHE[session_id]

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