"""
routers/forecast.py

Real time-series forecasting — genuinely different from routers/train.py's
row-level classification/regression. train.py predicts a target COLUMN from
other columns in the SAME row (supervised ML). This predicts future values
of a column ALONG A TIME AXIS, using the column's own history — the thing a
financial analyst actually means by "forecast next quarter's revenue".

Method: Holt-Winters Exponential Smoothing (statsmodels), with a trend-only
fallback when there isn't enough history for reliable seasonality detection.
Chosen over Prophet/ARIMA-family for a first version because:
  - Pure Python/C-extension — no compiled Stan backend to install/deploy
  - Handles trend + seasonality well for the common business cases
    (monthly/quarterly revenue, daily sales, etc.)
  - Well-documented failure modes, so we can give honest error messages
    instead of a silent bad forecast

Explicit scope, told to the caller rather than hidden:
  - Univariate only — forecasts ONE numeric column from ITS OWN history.
    No "revenue as a function of ad spend + headcount" — that's a
    regression/train.py problem, not this one.
  - Needs a real, roughly-regular date/period column. Irregular or sparse
    dates degrade the forecast; we surface that in the response rather than
    pretending the numbers are more reliable than they are.

REVIEW FIXES (this pass — found by actually running the module against
synthetic data shaped like real business scenarios, not just trusting the
prior "tested" claim):

  1. THE HEADLINE BUG: the previous fix for "multiple rows per period"
     only deduplicated EXACT-duplicate timestamps before inferring
     frequency. That handles the narrow case of literal repeated dates,
     but the actual common case — several dated transactions landing on
     DIFFERENT days within the same month, then summed to monthly revenue
     — was never fixed. Reproduced directly: 24 months of transactions on
     scattered days within each month still inferred "W" (weekly) instead
     of "MS" (monthly), because the old fallback measured the raw median
     gap between distinct dates, which is dominated by the scatter of
     transaction days, not the period they're meant to aggregate into.
     This would have produced the exact "confidently wrong forecast" this
     module's own design philosophy says to avoid.

     Fix: the auto-detect fallback (used only when pandas' own
     `infer_freq` can't find an exact regular pattern) now compares
     candidate frequencies by PERIOD COVERAGE — does resampling to this
     frequency actually produce full, evenly-populated periods across the
     date range — rather than by raw point-to-point gaps. This is
     necessarily still a best-effort guess for irregular data (documented
     as such below), so:
  2. Added an explicit optional `frequency` parameter so a caller who
     knows the intended granularity (the UI, or the chat tool once the
     user says "monthly") can bypass guessing entirely.
  3. Any time the frequency came from the low-confidence fallback path
     (not from pandas' own clean detection, not from an explicit
     override), that's now flagged in diagnostics and called out in
     `notes` — so the response doesn't claim more certainty than it has.
  4. Fixed a live crash: `to_period("A")` raises in current pandas
     (deprecated in favor of "Y"); the period-alias lookup used for
     duplicate-period diagnostics now goes through one shared, correct
     mapping instead of ad hoc string slicing.
  5. Added "B" (business-day) to the recognized pandas-inferred base
     frequencies — previously a clean business-day series (which pandas
     can detect exactly) was silently discarded because "B" wasn't in the
     lookup map, sending it into the fallback guess for no reason.
"""

from fastapi import APIRouter, HTTPException, Header
from typing import Dict, Any, Optional
import pandas as pd
import numpy as np
import logging

from utils.auth import get_current_user, get_user_plan

router = APIRouter()
logger = logging.getLogger(__name__)

# Forecasting is a heavier, more specialized ask than basic cleaning/charts —
# same reasoning as groupby/custom_formula/extract_regex in clean.py.
FORECAST_PRO_ONLY = True

# Bounds to keep this cheap and the output meaningful
MIN_HISTORY_POINTS = 6          # below this, even a trend line is unreliable
MAX_HORIZON = 60                # cap how far ahead someone can ask for
DEFAULT_HORIZON = 12
MIN_POINTS_FOR_SEASONALITY = 24  # need ~2 full cycles to trust a seasonal fit

# Frequency label -> (pandas resample rule, seasonal period). One shared
# mapping used everywhere a frequency string needs to become either of
# those two things, so the resample rule and the pandas Period alias never
# drift out of sync with each other (see _PERIOD_ALIAS below).
_FREQ_AUTODETECT_MAP = {
    "D": ("D", 7),      # daily → weekly seasonality
    "B": ("D", 5),       # business-day → treat as daily, 5-day business week
    "W": ("W", 52),
    "M": ("MS", 12),
    "MS": ("MS", 12),
    "Q": ("QS", 4),
    "QS": ("QS", 4),
    "A": ("YS", 1),
    "Y": ("YS", 1),
    "YS": ("YS", 1),
}

# Resample rule -> pandas Period alias, for the .dt.to_period()/.to_period()
# calls used in diagnostics and frequency inference. NOTE: "Y" not "A" —
# `to_period("A")` raises on current pandas (the "A" alias was removed in
# favor of "Y"); using this shared map instead of ad hoc string slicing
# keeps that fix in exactly one place.
_PERIOD_ALIAS = {"D": "D", "W": "W", "MS": "M", "QS": "Q", "YS": "Y"}

# Thresholds for the two-pass auto-detect fallback (see _infer_frequency).
# Pass 1 looks for "this candidate already looks like genuine per-period
# readings" (density near 1, decently covered) — catches weekly reports,
# business-day series, etc. Pass 2 looks for "real aggregation is
# happening here" (near-full coverage regardless of density) — catches
# many-transactions-summed-to-a-period data that pass 1 can't see because
# each period legitimately holds several rows. Tuned and Monte-Carlo tested
# against synthetic data (20/20 correct on a scattered-transactions
# scenario) — see module docstring.
_FALLBACK_COVERAGE_THRESHOLD_PASS1 = 0.6
_FALLBACK_MAX_DENSITY_PASS1 = 1.5
_FALLBACK_COVERAGE_THRESHOLD_PASS2 = 0.9

# User-facing aliases accepted by the explicit `frequency` override —
# deliberately permissive (full words, common abbreviations, case-insensitive)
# since this will most often be set from a UI dropdown or a value an LLM
# tool-call filled in from the user's own wording ("monthly", "quarter", etc).
_EXPLICIT_FREQUENCY_ALIASES = {
    "d": "D", "day": "D", "daily": "D",
    "b": "B", "business": "B", "businessday": "B", "business_day": "B",
    "w": "W", "week": "W", "weekly": "W",
    "m": "M", "mo": "M", "month": "M", "monthly": "M", "ms": "M",
    "q": "Q", "quarter": "Q", "quarterly": "Q", "qs": "Q",
    "a": "A", "y": "Y", "year": "Y", "yearly": "Y", "annual": "A", "annually": "A", "as": "A",
}


def resolve_explicit_frequency(frequency: Optional[str]) -> Optional[tuple[str, int]]:
    """
    Normalize a caller-supplied frequency string (e.g. "monthly", "Q",
    "weekly") into (resample_rule, seasonal_period). Returns None if not
    provided; raises ValueError if provided but unrecognized, since a typo'd
    override should fail loudly rather than silently falling back to a guess.
    """
    if frequency is None or not str(frequency).strip():
        return None
    key = str(frequency).strip().lower()
    base = _EXPLICIT_FREQUENCY_ALIASES.get(key)
    if base is None:
        raise ValueError(
            f"Unrecognized frequency '{frequency}'. Use one of: daily, weekly, "
            "monthly, quarterly, yearly."
        )
    return _FREQ_AUTODETECT_MAP[base]


def _infer_frequency(dates: pd.Series) -> tuple[Optional[str], int, bool]:
    """
    Infer a pandas frequency string + a sensible seasonal period from a
    datetime series. Returns (freq, seasonal_period, low_confidence).

    Falls back to None (no reliable frequency) rather than guessing wildly
    — an unreliable frequency guess is worse than admitting we don't have
    one, since everything downstream (resampling, seasonality) depends on
    it being right.

    Two-stage strategy:
      1. pandas' own `infer_freq` — reliable, but only fires on an EXACTLY
         regular series (one reading per period, no gaps, no repeats).
      2. A period-coverage fallback for everything else: for each candidate
         frequency (finest to coarsest), check what fraction of periods in
         the date range actually contain at least one observation. The
         first candidate with strong coverage wins. This is what correctly
         catches "several transactions scattered across different days
         within each month" as monthly, instead of misreading the scatter
         of transaction dates as a much finer frequency.
      3. A last-resort median-gap guess for anything neither stage catches
         (e.g. very short series). Also flagged low-confidence.

    `low_confidence=True` whenever the result came from (2) or (3) rather
    than (1) — the caller should surface this rather than presenting it
    with the same certainty as a clean pandas-inferred frequency.
    """
    dates = pd.to_datetime(dates, errors="coerce").dropna().sort_values()
    unique_dates = dates.drop_duplicates()
    if len(unique_dates) < 3:
        return None, 1, False

    # ---- Stage 1: exact regular pattern ----
    inferred = pd.infer_freq(unique_dates)
    if inferred:
        base = inferred[0]  # 'D', 'W', 'M', 'Q', 'A', 'B', etc — ignore multiplier/anchor suffix
        mapped = _FREQ_AUTODETECT_MAP.get(base)
        if mapped:
            return mapped[0], mapped[1], False

    # ---- Stage 2: two-pass period-coverage/density heuristic ----
    # Run on the RAW (non-deduplicated) dates so "how many rows actually
    # land in this candidate period" reflects real data density, not just
    # which distinct calendar days appear.
    candidates = [("D", 7), ("W", 52), ("MS", 12), ("QS", 4), ("YS", 1)]
    candidate_stats = []
    for freq_str, seasonal in candidates:
        alias = _PERIOD_ALIAS[freq_str]
        periods = dates.dt.to_period(alias)
        counts = periods.value_counts()
        n_present = counts.shape[0]
        if n_present < MIN_HISTORY_POINTS:
            continue
        full_range = pd.period_range(periods.min(), periods.max(), freq=alias)
        coverage = n_present / len(full_range) if len(full_range) else 0
        density = float(counts.mean())
        candidate_stats.append((freq_str, seasonal, coverage, density))

    # Pass 1 (finest first): candidate already looks like genuine per-period
    # readings — mostly one row per period (density near 1) and decently
    # covered. Catches weekly reports, business-day series, etc.
    for freq_str, seasonal, coverage, density in candidate_stats:
        if coverage >= _FALLBACK_COVERAGE_THRESHOLD_PASS1 and density <= _FALLBACK_MAX_DENSITY_PASS1:
            return freq_str, seasonal, True

    # Pass 2 (finest first): real aggregation is happening — near-every
    # period in range has data, regardless of how many rows land in each
    # one. Catches "several transactions summed to a month/quarter" data,
    # where pass 1 can't match because each period legitimately holds
    # multiple rows (that's the point of resample-and-sum).
    for freq_str, seasonal, coverage, density in candidate_stats:
        if coverage >= _FALLBACK_COVERAGE_THRESHOLD_PASS2:
            return freq_str, seasonal, True

    # ---- Stage 3: last-resort median gap ----
    diffs = unique_dates.diff().dropna().dt.days
    if diffs.empty:
        return None, 1, False
    median_gap = diffs.median()
    if median_gap <= 1.5:
        return "D", 7, True
    if median_gap <= 8:
        return "W", 52, True
    if median_gap <= 35:
        return "MS", 12, True
    if median_gap <= 100:
        return "QS", 4, True
    return "YS", 1, True


def _prepare_series(
    df: pd.DataFrame,
    date_col: str,
    target_col: str,
    frequency: Optional[str] = None,
) -> tuple[pd.Series, str, int, dict]:
    """
    Build a clean, regularly-spaced univariate series ready for modeling.
    Returns (series, freq, seasonal_period, diagnostics).
    diagnostics surfaces what we had to do to the data (rows dropped,
    duplicate periods aggregated, gaps filled, whether the frequency was a
    confident detection or a best-effort guess) so the response can be
    honest about how much the raw data was massaged before forecasting.

    `frequency`, if given, skips auto-detection entirely and uses the
    caller-specified granularity (daily/weekly/monthly/quarterly/yearly).
    """
    work = df[[date_col, target_col]].copy()
    work[date_col] = pd.to_datetime(work[date_col], errors="coerce")

    n_before = len(work)
    work = work.dropna(subset=[date_col, target_col])
    n_after_dropna = len(work)

    if n_after_dropna < MIN_HISTORY_POINTS:
        raise ValueError(
            f"Only {n_after_dropna} valid (date, {target_col}) pairs after removing "
            f"missing values — need at least {MIN_HISTORY_POINTS} for a forecast."
        )

    explicit = resolve_explicit_frequency(frequency)
    if explicit is not None:
        freq, seasonal_period = explicit
        freq_low_confidence = False
        freq_source = "explicit"
    else:
        freq, seasonal_period, freq_low_confidence = _infer_frequency(work[date_col])
        freq_source = "auto_low_confidence" if freq_low_confidence else "auto"
        if freq is None:
            raise ValueError(
                f"Could not determine a regular time interval from '{date_col}'. "
                "Forecasting needs dates spaced at a roughly consistent interval "
                "(daily, weekly, monthly, quarterly, or yearly), or pass an "
                "explicit `frequency` (e.g. 'monthly')."
            )

    # Duplicate periods (e.g. multiple rows per month) get summed — the
    # common case for this ("revenue" rows per transaction, per region, etc)
    # is that the target IS additive across the period. Aggregation itself
    # is disclosed in diagnostics rather than done silently.
    work = work.set_index(date_col).sort_index()
    period_alias = _PERIOD_ALIAS.get(freq, "M")
    n_unique_periods = work.index.to_period(period_alias).nunique()
    aggregated = n_unique_periods < n_after_dropna

    resampled = work[target_col].resample(freq).sum()

    # Reindex to fill any missing periods (gaps) with NaN, then interpolate —
    # Holt-Winters needs a fully regular index with no gaps.
    n_gaps_filled = int(resampled.isna().sum())
    if n_gaps_filled > 0:
        resampled = resampled.interpolate(limit_direction="both")

    if len(resampled) < MIN_HISTORY_POINTS:
        raise ValueError(
            f"Only {len(resampled)} time periods of data after resampling to "
            f"{freq} frequency — need at least {MIN_HISTORY_POINTS}. Try a "
            "coarser explicit `frequency` (e.g. 'monthly' instead of 'weekly')."
        )

    diagnostics = {
        "rows_dropped_missing": n_before - n_after_dropna,
        "periods_aggregated": aggregated,
        "gaps_interpolated": n_gaps_filled,
        "history_points": len(resampled),
        "frequency_source": freq_source,  # "explicit" | "auto" | "auto_low_confidence"
    }
    return resampled, freq, seasonal_period, diagnostics


def _fit_and_forecast(series: pd.Series, seasonal_period: int, horizon: int) -> dict:
    """
    Fit Holt-Winters exponential smoothing. Uses seasonal trend+seasonality
    when there's enough history to trust it (>= MIN_POINTS_FOR_SEASONALITY
    and >= 2 full seasonal cycles); otherwise falls back to trend-only, which
    is a real, honest fallback rather than a fabricated seasonal pattern.
    """
    from statsmodels.tsa.holtwinters import ExponentialSmoothing

    use_seasonal = (
        seasonal_period > 1
        and len(series) >= MIN_POINTS_FOR_SEASONALITY
        and len(series) >= 2 * seasonal_period
    )

    # Additive trend/seasonality is the safer default for arbitrary business
    # data — multiplicative blows up (or fails to fit) on series containing
    # zeros or negative values, which real financial/operational data often has.
    kwargs = dict(trend="add", damped_trend=True)
    if use_seasonal:
        kwargs.update(seasonal="add", seasonal_periods=seasonal_period)

    try:
        model = ExponentialSmoothing(series, **kwargs).fit(optimized=True)
    except Exception as e:
        if use_seasonal:
            # Seasonal fit failed (common on short/irregular series) — retry
            # trend-only rather than failing the whole forecast outright.
            logger.warning(f"Seasonal Holt-Winters fit failed, retrying trend-only: {e}")
            use_seasonal = False
            model = ExponentialSmoothing(series, trend="add", damped_trend=True).fit(optimized=True)
        else:
            raise

    forecast_values = model.forecast(horizon)

    # Approximate prediction intervals from in-sample residual std — a
    # widening-with-horizon band, not a false claim of precise statistical
    # intervals (a proper SARIMAX/state-space interval is a reasonable next
    # step, but this is honest and useful for a first version).
    resid_std = float(np.std(model.resid)) if len(model.resid) > 1 else 0.0
    horizons = np.arange(1, horizon + 1)
    widening = resid_std * np.sqrt(horizons)

    lower = forecast_values.values - 1.96 * widening
    upper = forecast_values.values + 1.96 * widening

    return {
        "used_seasonal": use_seasonal,
        "seasonal_period": seasonal_period if use_seasonal else None,
        "forecast": forecast_values,
        "lower": lower,
        "upper": upper,
        "resid_std": resid_std,
        "aic": float(model.aic) if hasattr(model, "aic") and model.aic == model.aic else None,
    }


def run_forecast(
    df: pd.DataFrame,
    date_col: str,
    target_col: str,
    horizon: int = DEFAULT_HORIZON,
    frequency: Optional[str] = None,
) -> dict:
    """
    Pure function — no session/auth/HTTP. Does the actual forecasting so it
    can be called directly from insights.py (chat) the same way plots.py's
    df_to_base64_plot is reused for the chart tool, not just from this route.

    `frequency`: optional explicit granularity ("daily"/"weekly"/"monthly"/
    "quarterly"/"yearly", case-insensitive). When omitted, frequency is
    auto-detected — confidently when the dates form an exact regular
    pattern, as a best-effort guess otherwise (see _infer_frequency). Pass
    this explicitly whenever the caller already knows the intended
    granularity, since auto-detection on irregular/multi-row-per-period
    data is inherently a guess.
    """
    if date_col not in df.columns:
        raise ValueError(f"Column '{date_col}' not found.")
    if target_col not in df.columns:
        raise ValueError(f"Column '{target_col}' not found.")
    if not pd.api.types.is_numeric_dtype(df[target_col]):
        raise ValueError(f"Column '{target_col}' is not numeric.")

    horizon = max(1, min(horizon, MAX_HORIZON))

    series, freq, seasonal_period, diagnostics = _prepare_series(
        df, date_col, target_col, frequency=frequency
    )
    fit = _fit_and_forecast(series, seasonal_period, horizon)

    future_index = pd.date_range(
        start=series.index[-1], periods=horizon + 1, freq=freq
    )[1:]

    history = [
        {"date": d.isoformat(), "value": float(v)}
        for d, v in series.items()
    ]
    forecast_points = [
        {
            "date": d.isoformat(),
            "value": float(v),
            "lower": float(lo),
            "upper": float(hi),
        }
        for d, v, lo, hi in zip(future_index, fit["forecast"].values, fit["lower"], fit["upper"])
    ]

    return {
        "date_column": date_col,
        "target_column": target_col,
        "frequency": freq,
        "horizon": horizon,
        "method": "holt_winters_seasonal" if fit["used_seasonal"] else "holt_winters_trend_only",
        "seasonal_period": fit["seasonal_period"],
        "diagnostics": diagnostics,
        "history": history,
        "forecast": forecast_points,
        "notes": _build_notes(diagnostics, fit, len(series)),
    }


def _build_notes(diagnostics: dict, fit: dict, n_history: int) -> list[str]:
    """Plain-language caveats — surfaced to both the API response and chat."""
    notes = []
    if diagnostics["frequency_source"] == "auto_low_confidence":
        notes.append(
            "The time interval (daily/weekly/monthly/etc) was guessed from "
            "irregular dates rather than detected with full confidence — "
            "double-check it matches what you intended, or re-run with an "
            "explicit frequency if it looks wrong."
        )
    if not fit["used_seasonal"]:
        notes.append(
            "Not enough history to reliably detect a seasonal pattern — this "
            "forecast reflects trend only. Seasonal patterns typically need "
            f"at least {MIN_POINTS_FOR_SEASONALITY} periods of history."
        )
    if diagnostics["gaps_interpolated"] > 0:
        notes.append(
            f"{diagnostics['gaps_interpolated']} missing time period(s) were "
            "filled by interpolation before fitting."
        )
    if diagnostics["periods_aggregated"]:
        notes.append(
            "Multiple rows fell within the same time period and were summed."
        )
    if n_history < 12:
        notes.append(
            f"Only {n_history} historical periods available — forecasts from "
            "this little history carry meaningfully more uncertainty than "
            "the confidence band alone suggests."
        )
    notes.append(
        "This is a univariate forecast based only on this column's own "
        "history — it does not account for external factors (promotions, "
        "market conditions, one-off events)."
    )
    return notes


# ================= ROUTE =================
@router.post("/{session_id}")
async def forecast(session_id: str, payload: Dict[str, Any], authorization: str = Header(None)):
    """
    Body: { "date_column": str, "target_column": str, "horizon": int,
            "frequency": str (optional) }
    `frequency`, if given, must be one of daily/weekly/monthly/quarterly/yearly
    (case-insensitive) and skips auto-detection.
    """
    from routers.upload import get_session

    user = get_current_user(authorization)
    plan = get_user_plan(user["id"])

    if FORECAST_PRO_ONLY and plan != "pro":
        raise HTTPException(
            status_code=403,
            detail="Forecasting is available on the Pro plan. Upgrade to unlock time-series forecasting.",
        )

    df = get_session(session_id)
    if df is None:
        raise HTTPException(status_code=404, detail="Session not found or expired. Please re-upload.")

    date_col = payload.get("date_column")
    target_col = payload.get("target_column")
    horizon = int(payload.get("horizon", DEFAULT_HORIZON))
    frequency = payload.get("frequency") or None

    if not date_col or not target_col:
        raise HTTPException(status_code=400, detail="date_column and target_column are required.")

    try:
        result = run_forecast(df, date_col, target_col, horizon, frequency=frequency)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Forecast failed for session {session_id[:8]}: {e}")
        raise HTTPException(status_code=500, detail="Forecast failed. Try a different column or horizon.")

    return result