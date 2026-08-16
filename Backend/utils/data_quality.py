"""
Shared data-quality detection helpers used by both clean.py and insights.py.

Pure functions only — no session mutation, no auth, no HTTP. clean.py's
cap_outliers / parse_number routes call these for the math, then apply the
result themselves. insights.py calls the same functions to enrich LLM context
so the two stay in lockstep when thresholds or patterns change.
"""

from __future__ import annotations

import re
from typing import Any, Dict, List, Optional

import numpy as np
import pandas as pd

# ── Outlier bounds (shared with clean.py cap_outliers) ───────────────────────

def compute_outlier_bounds(
    series: pd.Series,
    method: str = "iqr",
    threshold: float = 1.5,
) -> Optional[Dict[str, float]]:
    """
    Compute lower/upper outlier bounds for a numeric series.

    Same math as the original cap_outliers route:
      iqr   → [Q1 - threshold*IQR, Q3 + threshold*IQR]
      zscore → [mean - threshold*std, mean + threshold*std]

    Returns None when the series is too short, non-numeric, or has zero
    variance / zero IQR (bounds undefined).
    """
    s = series.dropna()
    if len(s) < 4 or not pd.api.types.is_numeric_dtype(s):
        return None

    try:
        if method == "iqr":
            q1, q3 = float(s.quantile(0.25)), float(s.quantile(0.75))
            iqr = q3 - q1
            if iqr == 0:
                return None
            lower = q1 - threshold * iqr
            upper = q3 + threshold * iqr
        elif method == "zscore":
            mean, std = float(s.mean()), float(s.std())
            if std == 0 or std != std:  # zero or NaN variance
                return None
            lower = mean - threshold * std
            upper = mean + threshold * std
        else:
            return None
    except Exception:
        return None

    return {"lower": lower, "upper": upper}


def outlier_mask(
    series: pd.Series,
    method: str = "iqr",
    threshold: float = 1.5,
) -> Optional[pd.Series]:
    """Boolean mask of outlier positions (NaNs are never flagged)."""
    bounds = compute_outlier_bounds(series, method=method, threshold=threshold)
    if bounds is None:
        return None
    return ((series < bounds["lower"]) | (series > bounds["upper"])) & series.notna()


# Max categorical columns to profile among outlier rows, and top-N values each.
_MAX_DRIVER_COLS = 4
_MAX_DRIVER_VALUES = 5
# Prefer these-looking names when choosing which categoricals explain outliers.
_DRIVER_NAME_HINTS = (
    "variable", "category", "type", "group", "sector", "industry",
    "region", "country", "descriptor", "label", "name", "source",
    "unit", "units", "magnitude", "class", "segment",
)


def _pick_driver_columns(df: pd.DataFrame, exclude: str, max_cols: int = _MAX_DRIVER_COLS) -> List[str]:
    """Prefer low/medium-cardinality object columns that look like dimensions."""
    candidates = []
    for c in df.columns:
        if c == exclude:
            continue
        if not (pd.api.types.is_object_dtype(df[c]) or pd.api.types.is_string_dtype(df[c])):
            # Also allow low-cardinality integer codes (e.g. year is usually not useful)
            if not (pd.api.types.is_integer_dtype(df[c]) and df[c].nunique(dropna=True) <= 50):
                continue
        try:
            nunique = int(df[c].nunique(dropna=True))
        except Exception:
            continue
        if nunique < 2 or nunique > 200:
            continue
        name_l = str(c).lower()
        hint_score = 0 if any(h in name_l for h in _DRIVER_NAME_HINTS) else 1
        candidates.append((hint_score, nunique, c))

    candidates.sort(key=lambda t: (t[0], t[1]))
    return [c for _, _, c in candidates[:max_cols]]


def _outlier_drivers(df: pd.DataFrame, mask: pd.Series, exclude_col: str) -> Dict[str, list]:
    """
    Among outlier rows, report the top values of a few categorical columns.
    This answers 'what's driving these outliers' with substance (industry,
    gas type, region, …) rather than only row indices.
    """
    outlier_df = df.loc[mask]
    if outlier_df.empty:
        return {}

    drivers: Dict[str, list] = {}
    for c in _pick_driver_columns(df, exclude=exclude_col):
        try:
            vc = outlier_df[c].dropna().astype(str).value_counts().head(_MAX_DRIVER_VALUES)
            total = int(mask.sum()) or 1
            drivers[c] = [
                {"value": k, "count": int(v), "pct_of_outliers": round(v / total * 100, 1)}
                for k, v in vc.items()
            ]
        except Exception:
            continue
    return drivers


def detect_outliers_summary(
    df: pd.DataFrame,
    method: str = "iqr",
    threshold: float = 1.5,
    max_cols: int = 10,
    max_samples: int = 5,
) -> Dict[str, dict]:
    """
    Per-column outlier summary for LLM context / reporting.
    Uses compute_outlier_bounds so the numbers match clean.py exactly.
    Also profiles categorical columns among outlier rows so 'what's driving
    this' can point at industries / categories / gases, not only indices.
    """
    result: Dict[str, dict] = {}
    numeric_cols = df.select_dtypes(include=["number"]).columns.tolist()
    # Columns useful to attach onto each sample outlier row (context, not drivers)
    context_cols = [
        c for c in df.columns
        if c not in numeric_cols
        and (pd.api.types.is_object_dtype(df[c]) or pd.api.types.is_string_dtype(df[c]))
    ][:6]

    for col in numeric_cols[:max_cols]:
        bounds = compute_outlier_bounds(df[col], method=method, threshold=threshold)
        if bounds is None:
            continue
        mask = ((df[col] < bounds["lower"]) | (df[col] > bounds["upper"])) & df[col].notna()
        n = int(mask.sum())
        if n == 0:
            continue

        outlier_pct = round(n / max(len(df[col]), 1) * 100, 2)

        samples = []
        for idx in df[col][mask].head(max_samples).index.tolist():
            try:
                entry: Dict[str, Any] = {
                    "index": int(idx) if isinstance(idx, (int, np.integer)) else str(idx),
                    "value": float(df[col].loc[idx]),
                }
            except Exception:
                entry = {
                    "index": str(idx),
                    "value": str(df[col].loc[idx]),
                }
            # Attach a few dimension values from the same row for context
            row_ctx = {}
            for cc in context_cols:
                try:
                    v = df[cc].loc[idx]
                    if pd.notna(v):
                        row_ctx[cc] = str(v)[:80]
                except Exception:
                    continue
            if row_ctx:
                entry["row"] = row_ctx
            samples.append(entry)

        drivers = _outlier_drivers(df, mask, exclude_col=col)

        entry_out: Dict[str, Any] = {
            "method": method,
            "threshold": threshold,
            "lower_bound": round(bounds["lower"], 6),
            "upper_bound": round(bounds["upper"], 6),
            "outlier_count": n,
            "outlier_pct": outlier_pct,
            "sample_outliers": samples,
        }
        if drivers:
            entry_out["driven_by"] = drivers
        # Flag heavy tails so the model doesn't treat every high-pct case as "bad data"
        if outlier_pct >= 10:
            entry_out["note"] = (
                f"{outlier_pct}% of values fall outside IQR fences — common for "
                "skewed or heavy-tailed distributions. Many of these may be valid "
                "extremes rather than errors; use driven_by and sample row context "
                "to interpret, not just the count."
            )

        result[col] = entry_out

    return result


# ── Mixed-format / bracket-suffix detection ──────────────────────────────────
# Covers what parse_number already handles (currency, %, commas, (negatives))
# PLUS the confidence-interval / range suffix that parse_number never handled
# and that caused Emmanuel's "62.62 [58.4-66.8]" report.

_BRACKET_NEG_RE = re.compile(r"^\s*\(\s*[-+]?\d[\d,]*\.?\d*\s*\)\s*$")
_CURRENCY_RE = re.compile(r"^\s*[$€£¥₦]\s*[-+]?\d[\d,]*\.?\d*\s*$")
_PERCENT_RE = re.compile(r"^\s*[-+]?\d+\.?\d*\s*%\s*$")
_PLAIN_NUM_RE = re.compile(r"^\s*[-+]?\d[\d,]*\.?\d*\s*$")
_COMMA_NUM_RE = re.compile(r"^\s*[-+]?\d{1,3}(,\d{3})+(\.\d+)?\s*$")

# Number (or percent) followed by a square-bracket suffix — confidence
# intervals, ranges, footnotes, etc.
#   "62.62 [58.4-66.8]"  → True
#   "100 [95% CI]"       → True
#   "0.45 [0.40, 0.50]"  → True
#   "12.3[11-13]"        → True  (no space required)
_CI_SUFFIX_RE = re.compile(
    r"""
    ^\s*
    [-+]?                          # optional sign
    \d[\d,]*\.?\d*                 # main number (commas allowed)
    \s*%?                          # optional percent on the main number
    \s*
    \[                             # opening square bracket
    [^\]]{1,80}                    # anything inside (bounded)
    \]                             # closing square bracket
    \s*$
    """,
    re.VERBOSE,
)


def classify_string_value(val: str) -> str:
    """
    Return a format tag for a single string cell.
    Order matters: CI-suffix is checked before plain numeric so
    "62.62 [58.4-66.8]" is tagged ci_suffix, not numeric_string.
    """
    if val is None:
        return "empty"
    v = str(val).strip()
    if not v:
        return "empty"
    if _CI_SUFFIX_RE.match(v):
        return "ci_suffix"
    if _BRACKET_NEG_RE.match(v):
        return "bracket_negative"
    if _CURRENCY_RE.match(v):
        return "currency"
    if _PERCENT_RE.match(v):
        return "percentage"
    if _COMMA_NUM_RE.match(v) or _PLAIN_NUM_RE.match(v):
        return "numeric_string"
    return "other"


def detect_mixed_formats(
    df: pd.DataFrame,
    max_cols: int = 10,
    max_samples: int = 5,
    sample_cap: int = 5000,
) -> Dict[str, dict]:
    """
    Scan object/string columns for mixed numeric-looking formats.
    Surfaces ci_suffix (Emmanuel's case), bracket negatives, currency,
    percentages, and plain numeric strings that still need parsing.
    """
    result: Dict[str, dict] = {}
    candidates = [
        c for c in df.columns
        if pd.api.types.is_object_dtype(df[c]) or pd.api.types.is_string_dtype(df[c])
    ][:max_cols]

    for col in candidates:
        try:
            non_null = df[col].dropna()
            if non_null.empty:
                continue
            sample = non_null if len(non_null) <= sample_cap else non_null.sample(
                sample_cap, random_state=0
            )

            tags: Dict[str, int] = {}
            examples: Dict[str, List[str]] = {}
            for raw in sample.astype(str):
                tag = classify_string_value(raw)
                tags[tag] = tags.get(tag, 0) + 1
                if tag not in ("other", "empty"):
                    examples.setdefault(tag, [])
                    if len(examples[tag]) < max_samples:
                        examples[tag].append(raw[:80])

            format_tags = {k: v for k, v in tags.items() if k not in ("other", "empty")}
            if not format_tags:
                continue

            # Report when there's real signal: CI/bracket/currency/percent,
            # or more than one distinct numeric-looking format.
            interesting = set(format_tags) - {"numeric_string"}
            if len(format_tags) < 2 and not interesting:
                continue

            total = sum(tags.values()) or 1
            result[col] = {
                "format_counts": {k: int(v) for k, v in format_tags.items()},
                "format_pct": {k: round(v / total * 100, 1) for k, v in format_tags.items()},
                "examples": examples,
                "note": (
                    "Column contains mixed numeric-looking string formats "
                    "(confidence-interval suffixes, bracket negatives, currency, "
                    "percentages, etc.). These often need cleaning before numeric analysis."
                ),
            }
        except Exception:
            continue

    return result


def build_data_quality(
    df: pd.DataFrame,
    outlier_method: str = "iqr",
    outlier_threshold: float = 1.5,
    max_outlier_cols: int = 10,
    max_outlier_samples: int = 5,
    max_mixed_cols: int = 10,
    max_mixed_samples: int = 5,
) -> dict:
    """Single entry point used by insights.py for the data_quality context block."""
    return {
        "outliers": detect_outliers_summary(
            df,
            method=outlier_method,
            threshold=outlier_threshold,
            max_cols=max_outlier_cols,
            max_samples=max_outlier_samples,
        ),
        "mixed_formats": detect_mixed_formats(
            df,
            max_cols=max_mixed_cols,
            max_samples=max_mixed_samples,
        ),
        "outlier_method": outlier_method,
        "outlier_threshold": outlier_threshold,
    }
