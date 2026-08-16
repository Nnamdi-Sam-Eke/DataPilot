from fastapi import APIRouter, Header
from dotenv import load_dotenv
from pathlib import Path
from datetime import datetime
import os
import re
import logging
import json
from typing import Dict

from .upload import get_session, DATA_CACHE
from utils.auth import get_current_user, get_user_plan
from utils.plot_utils import df_to_base64_plot
from utils.data_quality import build_data_quality

router = APIRouter()
logger = logging.getLogger(__name__)

# FIX (round 2 — Nnamdi's real chart-tool test surfaced two problems):
# 1. Every chart response was a bare "Here's your hist." with zero
#    explanation — the model's own `content` is empty on a tool-calling turn
#    for this API, so the code fell back to a generic caption every single
#    time. Questions like "what are the key patterns" or "which columns are
#    most correlated" got a chart image but never an actual answer. Fixed
#    below by sending the tool's result back to the model for a genuine
#    second turn instead of stopping at the tool call.
# 2. "show me a pairplot" silently became a scatter chart with no
#    explanation of the substitution, because pairplot/heatmap weren't in
#    the allowed tool types at all — a correlation question ("which columns
#    are most correlated") should produce a heatmap, not a scatter of two
#    guessed columns. Both are now supported; neither needs x/y since they
#    use the whole dataset.
CHART_TOOL_TYPES = ["hist", "bar", "line", "scatter", "box", "pie", "density", "heatmap", "pairplot"]
CHART_TYPES_NO_XY = {"heatmap", "pairplot"}

CHART_TOOL = {
    "type": "function",
    "function": {
        "name": "generate_chart",
        "description": (
            "Render a real chart image from the current dataset. Call this "
            "when the user asks to visualize, plot, chart, or graph the "
            "data (or a specific column/relationship) — do not just "
            "describe what a chart would look like in text."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "type": {
                    "type": "string",
                    "enum": CHART_TOOL_TYPES,
                    "description": (
                        "Chart type. 'hist'/'density' = one numeric column's distribution. "
                        "'bar'/'pie' = one categorical column's counts. "
                        "'scatter'/'line' = relationship between two specific numeric columns. "
                        "'box' = one numeric column, optionally grouped by a categorical column via y. "
                        "'heatmap' = correlation between ALL numeric columns — use this (not scatter) "
                        "for any general 'which columns are correlated / related' question. "
                        "'pairplot' = grid of every numeric column against every other — use for "
                        "'show me a pairplot' or 'show relationships between all variables'. "
                        "heatmap and pairplot use the whole dataset and don't take x/y."
                    ),
                },
                "x": {
                    "type": "string",
                    "description": "Exact column name to use as X. Required for every type except heatmap/pairplot.",
                },
                "y": {
                    "type": "string",
                    "description": "Exact column name to use as Y, if the chart type needs a second variable. Omit if not needed.",
                },
                "title": {
                    "type": "string",
                    "description": "Short chart title.",
                },
            },
            "required": ["type"],
        },
    },
}


# Time-series forecasting tool — reuses run_forecast() from routers/forecast.py
# (same pure-function pattern as df_to_base64_plot for charts). Pro-only,
# same gate as the dedicated /forecast/{session_id} route, and only offered
# for a single active dataset for the same reason the chart tool is.
#
# NOTE (review pass): this tool was described as already wired in an earlier
# session, but the actual file never had it — CHART_TOOL existed, nothing
# forecast-related did. Adding it for real here, plus a `frequency` argument
# so the model can pass along "monthly"/"weekly"/etc when the user says it,
# instead of leaving forecast.py's frequency auto-detection (a best-effort
# guess on irregular data) as the only option.
FORECAST_TOOL = {
    "type": "function",
    "function": {
        "name": "run_forecast",
        "description": (
            "Forecast future values of ONE numeric column from its own time "
            "history using Holt-Winters exponential smoothing. Call this when "
            "the user asks to forecast, project, predict next periods, next "
            "quarter, next month, or any future values of a time-series "
            "column. Univariate only — does NOT use other columns as features "
            "(that is a supervised train/predict problem). Requires a real "
            "date/period column and a numeric target. Returns point forecasts "
            "plus approximate confidence bands and honest diagnostics."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "date_column": {
                    "type": "string",
                    "description": "Exact name of the date or period column in the dataset.",
                },
                "target_column": {
                    "type": "string",
                    "description": "Exact name of the numeric column to forecast from its own history.",
                },
                "horizon": {
                    "type": "integer",
                    "description": "How many periods ahead to forecast (1–60). Defaults to 12 if omitted.",
                },
                "frequency": {
                    "type": "string",
                    "enum": ["daily", "weekly", "monthly", "quarterly", "yearly"],
                    "description": (
                        "The time granularity to forecast at, if the user stated or implied "
                        "one (e.g. 'forecast monthly revenue' -> 'monthly'). Omit to let the "
                        "system auto-detect it from the data — auto-detection is reliable for "
                        "clean regular dates but a best-effort guess when a period has multiple "
                        "rows (e.g. several transactions per month), so pass this whenever the "
                        "intended granularity is known."
                    ),
                },
            },
            "required": ["date_column", "target_column"],
        },
    },
}


def _forecast_grounding_summary(result: dict) -> dict:
    """
    Compact, model-facing summary of a successful run_forecast() result so
    the follow-up explanation turn is grounded in real numbers rather than
    invented ones. Keep it small — the full history/forecast arrays stay in
    the payload returned to the frontend, not in what the model sees here.
    """
    try:
        fc = result.get("forecast") or []
        hist = result.get("history") or []
        notes = result.get("notes") or []
        return {
            "status": "forecast generated",
            "method": result.get("method"),
            "frequency": result.get("frequency"),
            "horizon": result.get("horizon"),
            "seasonal_period": result.get("seasonal_period"),
            "history_points": len(hist),
            "diagnostics": result.get("diagnostics") or {},
            "first_forecast": fc[0] if fc else None,
            "last_forecast": fc[-1] if fc else None,
            "notes": notes[:4],  # cap so the tool message stays short
        }
    except Exception as e:
        logger.warning(f"Forecast grounding summary failed (non-fatal): {e}")
        return {"status": "forecast generated"}


def _chart_grounding_stats(df, chart_type: str, x_col, y_col) -> dict:
    """
    Small, cheap, real numbers about what was just plotted, handed back to
    the model as the tool's result so its follow-up explanation is grounded
    in the actual chart instead of invented. Deliberately compact — this is
    context for one sentence or two of explanation, not a full re-analysis.
    """
    try:
        if chart_type in ("hist", "density", "box") and x_col and x_col in df.columns:
            s = df[x_col].dropna()
            if not len(s):
                return {}
            return {
                "column": x_col,
                "mean": round(float(s.mean()), 4) if s.dtype.kind in "if" else None,
                "median": round(float(s.median()), 4) if s.dtype.kind in "if" else None,
                "min": float(s.min()) if s.dtype.kind in "if" else str(s.min()),
                "max": float(s.max()) if s.dtype.kind in "if" else str(s.max()),
                "std": round(float(s.std()), 4) if s.dtype.kind in "if" else None,
            }
        if chart_type in ("bar", "pie") and x_col and x_col in df.columns:
            counts = df[x_col].dropna().astype(str).value_counts().head(5)
            total = int(df[x_col].dropna().shape[0]) or 1
            return {
                "column": x_col,
                "top_categories": [
                    {"value": k, "count": int(v), "pct": round(v / total * 100, 1)}
                    for k, v in counts.items()
                ],
            }
        if chart_type in ("scatter", "line") and x_col and y_col and x_col in df.columns and y_col in df.columns:
            xs, ys = df[x_col], df[y_col]
            if xs.dtype.kind in "if" and ys.dtype.kind in "if":
                corr = xs.corr(ys)
                return {
                    "x": x_col, "y": y_col,
                    "pearson_correlation": round(float(corr), 4) if corr == corr else None,
                }
            return {"x": x_col, "y": y_col}
        if chart_type == "heatmap":
            numeric_df = df.select_dtypes(include=["number"])
            if numeric_df.shape[1] < 2:
                return {}
            corr = numeric_df.corr().abs()
            pairs = []
            seen = set()
            for c1 in corr.columns:
                for c2 in corr.columns:
                    if c1 == c2 or (c2, c1) in seen:
                        continue
                    seen.add((c1, c2))
                    pairs.append((c1, c2, corr.loc[c1, c2]))
            pairs.sort(key=lambda p: -p[2] if p[2] == p[2] else 0)
            top = pairs[:5]
            return {
                "top_correlated_pairs": [
                    {"columns": [a, b], "correlation": round(float(v), 4)}
                    for a, b, v in top if v == v
                ]
            }
        if chart_type == "pairplot":
            numeric_cols = df.select_dtypes(include=["number"]).columns.tolist()
            return {"numeric_columns_included": numeric_cols}
    except Exception as e:
        logger.warning(f"Chart grounding stats failed (non-fatal): {e}")
    return {}


# Data-quality (outliers + mixed formats) lives in utils.data_quality
# so clean.py and insights.py share one implementation.
_MAX_OUTLIER_COLS = int(os.getenv("INSIGHTS_MAX_OUTLIER_COLS", "10"))
_MAX_OUTLIER_SAMPLES = int(os.getenv("INSIGHTS_MAX_OUTLIER_SAMPLES", "5"))
_MAX_MIXED_FORMAT_COLS = int(os.getenv("INSIGHTS_MAX_MIXED_FORMAT_COLS", "10"))
_MAX_MIXED_FORMAT_SAMPLES = int(os.getenv("INSIGHTS_MAX_MIXED_FORMAT_SAMPLES", "5"))


# ================= CACHE =================
CONTEXT_CACHE: Dict[str, str] = {}

# ================= FREE-PLAN DAILY RATE LIMIT =================
# Persisted in Firestore (users/{uid}/counters/insights) so quotas survive
# restarts and stay consistent across instances. See utils.quota.
from utils.quota import (
    FREE_DAILY_INSIGHT_LIMIT,
    check_and_consume_insight_quota as _check_and_consume_insight_quota,
)

MAX_COLUMNS = int(os.getenv("INSIGHTS_MAX_COLUMNS", "20"))
MAX_SAMPLE_ROWS = int(os.getenv("INSIGHTS_MAX_SAMPLE_ROWS", "3"))
MAX_PROMPT_CHARS = int(os.getenv("INSIGHTS_MAX_PROMPT_CHARS", "20000"))
MAX_MATCHED_ENTITIES_PER_COL = int(os.getenv("INSIGHTS_MAX_MATCHED_ENTITIES", "10"))
MAX_MATCHED_ROWS = int(os.getenv("INSIGHTS_MAX_MATCHED_ROWS", "500"))

# ================= ENV =================
ENV_PATH = Path(__file__).resolve().parent.parent / ".env"
load_dotenv(dotenv_path=ENV_PATH)

logger.info(f"Loading .env from: {ENV_PATH}")
logger.info(f".env exists: {ENV_PATH.exists()}")


def get_env(name: str, default: str | None = None) -> str | None:
    value = os.getenv(name, default)
    return value.strip() if isinstance(value, str) else value


# ================= MAIN ROUTE =================
@router.post("/")
async def get_insights(payload: dict, authorization: str = Header(None)):

    # FIX: uid and plan used to come straight from the payload
    # (payload.get("uid"), payload.get("plan")) — fully client-supplied and
    # unverified. Neither is currently used to gate anything in this route,
    # but an unverified "uid" logged/trusted here is a bad habit to leave in
    # place, and plan will very likely be used for per-tier rate limiting or
    # model selection later. Deriving both from the verified token now means
    # that future addition doesn't reintroduce the same spoofing hole.
    user = get_current_user(authorization)
    uid  = user["id"]
    plan = get_user_plan(uid)
    is_pro = plan == "pro"

    # ---------- safe import (avoid circular issues) ----------
    try:
        from main import GROQ_CLIENT, GROQ_MODEL
    except Exception:
        GROQ_CLIENT = None
        GROQ_MODEL = get_env("GROQ_MODEL", "llama-3.3-70b-versatile")

    if not GROQ_CLIENT:
        return {"error": "AI service is not configured on the server."}

    prompt = str(payload.get("prompt", "")).strip()
    session_ids = payload.get("session_ids", [])

    if not prompt:
        return {"error": "Please provide a prompt."}
    if not session_ids:
        return {"error": "No dataset selected."}

    quota_error = _check_and_consume_insight_quota(uid, plan)
    if quota_error:
        return {"error": quota_error, "plan_gate": "pro"}

    now = datetime.utcnow()
    datasets_text = []
    dfs_by_sid: Dict[str, "pd.DataFrame"] = {}

    # ================= BUILD CONTEXT =================
    for sid in session_ids:

        # ---------- session validation ----------
        df = get_session(sid)
        if df is None:
            CONTEXT_CACHE.pop(sid, None)
            return {"error": f"Dataset session '{sid}' not found or expired."}

        dfs_by_sid[sid] = df

        # ================= BUILD SUMMARY =================
        try:
            cols = df.columns.tolist()[:MAX_COLUMNS]
            sample = df.head(MAX_SAMPLE_ROWS).to_dict(orient="records")

            # ---------- FIX: full numeric stats for EVERY numeric column ----------
            # Previously this was truncated to the first MAX_SUMMARY_ITEMS (10)
            # columns via describe(), which meant min/max/count for any numeric
            # column past that cutoff never reached the LLM at all. Any question
            # like "what's the highest X" for a later column silently fell back
            # to the LLM guessing off the 3-row sample instead of real data.
            numeric_cols = df.select_dtypes(include=["number"]).columns.tolist()
            numeric_summary = {}

            for col in numeric_cols:
                series = df[col].dropna()
                if series.empty:
                    continue
                numeric_summary[col] = {
                    "min": series.min(),
                    "max": series.max(),
                    "mean": round(series.mean(), 4),
                    "sum": series.sum(),
                    "count": int(series.count()),
                }

            # ---------- FIX: full unique-value coverage for categorical columns ----------
            # The previous version only ever sent the top 5 most-frequent values per
            # categorical column. In a dataset like "country x year" (each country
            # appearing roughly the same number of times), value_counts().head(5)
            # returns 5 essentially arbitrary countries — any country NOT in that
            # top 5 was invisible to the LLM, which then (correctly, per its own
            # "don't hallucinate" instruction) reported it as missing even though
            # it was present in every row. Same root cause meant "how many unique
            # locations" was unanswerable — nunique was never computed at all.
            #
            # Fix: always report the exact unique-value COUNT for every column
            # (so cardinality questions are answerable regardless of size), and
            # for columns with low/moderate cardinality, send the FULL sorted list
            # of unique values — not just the top 5 by frequency — so "is X present"
            # questions are answered from ground truth. High-cardinality columns
            # (free text, IDs) still fall back to top-N-by-frequency to keep the
            # prompt bounded.
            MAX_FULL_UNIQUE_VALUES = int(get_env("INSIGHTS_MAX_FULL_UNIQUE_VALUES", "300"))

            unique_counts = {}
            for col in cols:
                try:
                    unique_counts[col] = int(df[col].nunique(dropna=True))
                except Exception:
                    continue

            categorical_cols = df.select_dtypes(exclude=["number"]).columns.tolist()
            categorical_summary = {}

            for col in categorical_cols[:MAX_COLUMNS]:
                try:
                    non_null = df[col].dropna().astype(str)
                    nunique = non_null.nunique()

                    if nunique <= MAX_FULL_UNIQUE_VALUES:
                        # Small/medium cardinality: give the complete set of
                        # distinct values so presence/absence questions are exact.
                        categorical_summary[col] = {
                            "unique_count": int(nunique),
                            "all_values": sorted(non_null.unique().tolist()),
                        }
                    else:
                        # High cardinality: full list would blow the prompt budget,
                        # fall back to top values by frequency plus the exact count.
                        top_values = non_null.value_counts().head(5).to_dict()
                        categorical_summary[col] = {
                            "unique_count": int(nunique),
                            "top_values": top_values,
                        }
                except Exception:
                    continue

            # ---------- FIX: entity/filter-aware row retrieval ----------
            # Knowing an entity EXISTS (via all_values above) isn't enough for
            # questions like "what is Nigeria's trend from 2000 to 2019" — that
            # needs Nigeria's actual rows, which the model never received before
            # (only a 3-row sample and dataset-wide aggregates). This scans the
            # user's prompt for any exact mention of a value from a low/medium
            # cardinality categorical column (the ones where we have the full
            # all_values list, so we know precisely what to look for), filters
            # the FULL dataframe down to just the matching rows, and includes
            # them verbatim so entity-specific questions are answered from real
            # data rather than global aggregates or a guess.
            matched_entities = {}

            for col, cs in categorical_summary.items():
                all_values = cs.get("all_values")
                if not all_values:
                    continue  # high-cardinality column — no reliable full list to match against

                # FIX: this used to break out of the scan as soon as it hit
                # MAX_MATCHED_ENTITIES_PER_COL matches, while walking
                # all_values in alphabetical order. That meant a query naming
                # more entities than the cap (e.g. 4 countries) would silently
                # drop whichever ones happened to sort later alphabetically —
                # "Nigeria, Ghana, Kenya, South Africa" hit the old cap of 3
                # right before reaching "South Africa", not because of any
                # data issue. Now we scan the full value list unconditionally
                # (cheap — it's just regex checks against an already-loaded
                # list of strings) and only apply the cap afterward, keeping
                # the entities in the order they were first mentioned in the
                # prompt rather than alphabetical column order, so truncation
                # (if it ever happens) drops the least-relevant ones instead
                # of an arbitrary alphabetical tail.
                hits = []
                for value in all_values:
                    if not value:
                        continue
                    # word-boundary, case-insensitive match so "Chad" doesn't
                    # match inside an unrelated word, and multi-word values
                    # ("United States") still match correctly
                    if re.search(r"\b" + re.escape(value) + r"\b", prompt, flags=re.IGNORECASE):
                        hits.append(value)

                if not hits:
                    continue

                if len(hits) > MAX_MATCHED_ENTITIES_PER_COL:
                    hits.sort(key=lambda v: prompt.lower().find(v.lower()))
                    hits = hits[:MAX_MATCHED_ENTITIES_PER_COL]

                try:
                    mask = df[col].astype(str).isin(hits)
                    matched_rows = df.loc[mask].head(MAX_MATCHED_ROWS).to_dict(orient="records")
                    matched_entities[col] = {
                        "matched_values": hits,
                        "row_count": int(mask.sum()),
                        "rows": matched_rows,
                    }
                except Exception:
                    continue

            # ---------- Data-quality facts (outliers + mixed formats) ----------
            # Shared helpers in utils.data_quality — same bounds math as
            # clean.py cap_outliers, plus CI-suffix detection for values like
            # "62.62 [58.4-66.8]" that parse_number never handled.
            data_quality = build_data_quality(
                df,
                outlier_method="iqr",
                outlier_threshold=1.5,
                max_outlier_cols=_MAX_OUTLIER_COLS,
                max_outlier_samples=_MAX_OUTLIER_SAMPLES,
                max_mixed_cols=_MAX_MIXED_FORMAT_COLS,
                max_mixed_samples=_MAX_MIXED_FORMAT_SAMPLES,
            )

            summary = {
                "shape": list(df.shape),
                "columns": cols,
                "sample": sample,
                "numeric_summary": numeric_summary,
                "unique_counts": unique_counts,
                "categorical_summary": categorical_summary,
                "matched_entities": matched_entities,
                "data_quality": data_quality,
            }

        except Exception as e:
            logger.error(f"Failed building dataset summary for {sid}: {e}")
            summary = {
                "shape": [0, 0],
                "columns": [],
                "sample": [],
                "numeric_summary": {},
                "unique_counts": {},
                "categorical_summary": {},
                "matched_entities": {},
                "data_quality": {"outliers": {}, "mixed_formats": {}},
            }

        # ================= SAFE CONTEXT STRING =================
        text = json.dumps(
            {"dataset_id": sid[:8], "summary": summary},
            indent=2,
            default=str
        )

        CONTEXT_CACHE[sid] = text
        datasets_text.append(text)

    # ================= PROMPT =================
    system_prompt = (
        "You are DataPilot, a precise data analysis assistant. "
        "You analyze datasets and return structured insights with numbers, patterns, and explanations. "
        "The numeric_summary field contains the exact min, max, mean, sum, and count "
        "for every numeric column in the full dataset (not just the sample rows) — "
        "always use these exact values when answering questions about highest, lowest, "
        "average, or total figures. "
        "The unique_counts field gives the EXACT number of distinct values for every "
        "column in the full dataset — always use it for questions like 'how many unique X'. "
        "The categorical_summary field describes text/category columns. When it contains "
        "an 'all_values' list, that list is the COMPLETE set of distinct values in the full "
        "dataset for that column — use it as ground truth to answer whether a specific value "
        "(e.g. a country or category) is present, and never say a value is missing just because "
        "it doesn't appear in the sample rows. When categorical_summary only contains "
        "'top_values' (high-cardinality columns), those are the most frequent values only, "
        "not the complete set — do not claim a value is absent based on top_values alone; "
        "say the full list isn't available for that column instead. "
        "The matched_entities field contains the ACTUAL FULL ROWS from the complete dataset "
        "for any specific value the user named in their question (e.g. a country, category, or "
        "ID mentioned by name). If the user asks about a specific entity — a trend, values over "
        "time, a comparison, or any question about 'X' where X names something specific — and "
        "matched_entities contains that entity's rows, you MUST base your answer on those exact "
        "rows, not on numeric_summary (which is aggregated across the whole column) and not on "
        "the sample. If the user names an entity but it does NOT appear in matched_entities, "
        "check categorical_summary's all_values/unique_count for that column first — if the "
        "column uses top_values only (no all_values), say you can't confirm whether that specific "
        "entity exists rather than asserting it's missing. "
        "The data_quality field surfaces real pre-computed facts: "
        "data_quality.outliers lists numeric columns with IQR-based outlier bounds, counts, "
        "sample outlier values (with row indices and row context), and a driven_by breakdown "
        "of which categories/segments dominate the outlier rows — use these when the user asks "
        "about outliers, extremes, anomalies, or 'what's driving' unusual values. Cite "
        "driven_by (e.g. which industry, gas, or region appears most among outliers) and "
        "sample row context, not invented causes. If outlier_pct is high (>=10%) and a note "
        "is present, acknowledge the distribution may simply be skewed/heavy-tailed rather "
        "than treating every flagged value as an error. "
        "data_quality.mixed_formats flags object/string columns that mix numeric-looking "
        "formats — confidence-interval suffixes like '62.62 [58.4-66.8]', bracket-style "
        "negatives like (500), currency symbols, percentages, comma-separated numbers — "
        "use this when explaining why a column won't sum, average, or plot correctly, "
        "or when the user asks about data-quality / cleaning issues. "
        "The sample field only shows a few example rows for context and must not be used "
        "to answer aggregate, cardinality, membership, or entity-specific questions. "
        "When the user asks to forecast, project, or predict future values of a "
        "time-series column, use the run_forecast tool (if available) rather than "
        "inventing numbers — pass a frequency argument if the user stated or implied "
        "one (e.g. 'monthly'). "
        "Be concise, accurate, and avoid hallucinating missing data."
    )

    user_message = (
        f"Dataset context:\n{chr(10).join(datasets_text)}\n\n"
        f"User question:\n{prompt}"
    )

    if len(user_message) > MAX_PROMPT_CHARS:
        user_message = user_message[:MAX_PROMPT_CHARS] + "\n...[truncated]"

    # ================= LLM CALL =================
    # Only offer tools for a single active dataset — with multiple datasets
    # selected, column names ("x"/"y", or a forecast's date/target columns)
    # are ambiguous across them, and getting that wrong (silently acting on
    # the wrong dataset) is worse than just not offering a tool in that case.
    single_df = dfs_by_sid.get(session_ids[0]) if len(session_ids) == 1 else None
    offer_chart_tool = single_df is not None
    # Forecasting is Pro-only — same gate as the dedicated /forecast route —
    # so free-plan users never even see it offered as a tool.
    offer_forecast_tool = single_df is not None and is_pro

    tools = []
    if offer_chart_tool:
        tools.append(CHART_TOOL)
    if offer_forecast_tool:
        tools.append(FORECAST_TOOL)

    try:
        create_kwargs = dict(
            model=GROQ_MODEL,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_message},
            ],
            temperature=0.3,
            max_tokens=2048,
        )
        if tools:
            create_kwargs["tools"] = tools
            create_kwargs["tool_choice"] = "auto"

        result = GROQ_CLIENT.chat.completions.create(**create_kwargs)
        message = result.choices[0].message

        chart_payload = None
        forecast_payload = None
        tool_calls = getattr(message, "tool_calls", None)

        if tools and tool_calls:
            # Only ever act on the first tool call — one tool result per
            # message keeps this predictable, and nothing here asks the
            # model for more.
            call = tool_calls[0]
            fn_name = getattr(call.function, "name", "") or ""
            try:
                args = json.loads(call.function.arguments or "{}")
            except Exception:
                args = {}

            tool_result_summary = {"status": "failed", "reason": "invalid arguments"}

            # ---------- Chart tool ----------
            if fn_name == "generate_chart":
                chart_type = args.get("type")
                x_col = args.get("x")
                y_col = args.get("y") or None
                chart_title = args.get("title") or None
                no_xy = chart_type in CHART_TYPES_NO_XY

                # Validate everything against the REAL dataframe before
                # touching matplotlib — a model-hallucinated column name or
                # type must not reach df_to_base64_plot, which assumes valid
                # inputs. heatmap and pairplot use the whole dataset, so they
                # don't need x.
                valid = chart_type in CHART_TOOL_TYPES and (
                    no_xy
                    or (
                        isinstance(x_col, str)
                        and x_col in single_df.columns
                        and (y_col is None or (isinstance(y_col, str) and y_col in single_df.columns))
                    )
                )

                if valid:
                    try:
                        img_b64 = df_to_base64_plot(
                            df=single_df,
                            session_id=session_ids[0],
                            plot_type=chart_type,
                            x=None if no_xy else x_col,
                            y=None if no_xy else y_col,
                            title=chart_title,
                        )
                        chart_payload = {
                            "type": chart_type,
                            "x": None if no_xy else x_col,
                            "y": None if no_xy else y_col,
                            "title": chart_title,
                            "image": img_b64,
                        }
                        # Grounding stats (real numbers computed from the
                        # actual chart, not invented) go back to the model
                        # next so its explanation is accurate rather than
                        # generic or fabricated.
                        tool_result_summary = {
                            "status": "chart generated",
                            "type": chart_type,
                            "x": None if no_xy else x_col,
                            "y": None if no_xy else y_col,
                            "stats": _chart_grounding_stats(single_df, chart_type, x_col, y_col),
                        }
                    except Exception as chart_err:
                        logger.error(f"Chart tool call failed to render: {chart_err}")
                        tool_result_summary = {"status": "failed", "reason": str(chart_err)}
                else:
                    logger.warning(f"Chart tool call had invalid args, skipping: {args}")
                    tool_result_summary = {
                        "status": "failed",
                        "reason": (
                            f"Requested column(s) not found in dataset. "
                            f"Available columns: {', '.join(single_df.columns.astype(str))}"
                        ),
                    }

            # ---------- Forecast tool ----------
            elif fn_name == "run_forecast":
                date_col = args.get("date_column")
                target_col = args.get("target_column")
                horizon = args.get("horizon", 12)
                frequency = args.get("frequency") or None
                try:
                    horizon = int(horizon)
                except Exception:
                    horizon = 12

                col_valid = (
                    isinstance(date_col, str) and date_col in single_df.columns
                    and isinstance(target_col, str) and target_col in single_df.columns
                )

                if not col_valid:
                    logger.warning(f"Forecast tool call had invalid columns, skipping: {args}")
                    tool_result_summary = {
                        "status": "failed",
                        "reason": (
                            f"Requested column(s) not found in dataset. "
                            f"Available columns: {', '.join(single_df.columns.astype(str))}"
                        ),
                    }
                else:
                    try:
                        # Lazy import (mirrors the routers.upload import
                        # above) keeps insights.py importable even if
                        # forecast.py's extra dependency (statsmodels) is
                        # momentarily missing in a broken deploy.
                        from .forecast import run_forecast
                        fc_result = run_forecast(
                            single_df,
                            date_col=date_col,
                            target_col=target_col,
                            horizon=horizon,
                            frequency=frequency,
                        )
                        # Full result goes to the frontend so it can render
                        # the same chart/table the dedicated Train tab shows.
                        forecast_payload = fc_result
                        tool_result_summary = _forecast_grounding_summary(fc_result)
                    except ValueError as ve:
                        # Honest validation errors from run_forecast (too
                        # little history, irregular/unrecognized dates,
                        # non-numeric target, bad frequency…) — surfaced to
                        # the model as-is so its explanation is accurate
                        # instead of guessing why it failed.
                        tool_result_summary = {"status": "failed", "reason": str(ve)}
                    except Exception as fc_err:
                        logger.error(f"Forecast tool call failed: {fc_err}")
                        tool_result_summary = {"status": "failed", "reason": "Forecast failed unexpectedly."}

            else:
                logger.warning(f"Unknown tool call, skipping: {fn_name}")
                tool_result_summary = {"status": "failed", "reason": f"Unknown tool: {fn_name}"}

            # ---------- SECOND TURN: let the model actually explain it ----------
            # Send the tool call + its result back as a real conversation turn
            # and ask for a follow-up completion with no tools offered, so the
            # model is forced to answer in plain text instead of calling a
            # tool again. This is what turns "Here's your hist." into an
            # actual answer to the user's original question.
            try:
                follow_up_messages = [
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_message},
                    {
                        "role": "assistant",
                        "content": message.content or "",
                        "tool_calls": [
                            {
                                "id": call.id,
                                "type": "function",
                                "function": {
                                    "name": call.function.name,
                                    "arguments": call.function.arguments,
                                },
                            }
                        ],
                    },
                    {
                        "role": "tool",
                        "tool_call_id": call.id,
                        "content": json.dumps(tool_result_summary, default=str),
                    },
                ]
                follow_up = GROQ_CLIENT.chat.completions.create(
                    model=GROQ_MODEL,
                    messages=follow_up_messages,
                    temperature=0.3,
                    max_tokens=1024,
                    # No `tools` here — this turn must answer in text, not
                    # request another tool call, so the chat can't loop.
                )
                follow_up_text = follow_up.choices[0].message.content
            except Exception as follow_up_err:
                logger.error(f"Tool follow-up explanation call failed: {follow_up_err}")
                follow_up_text = None

            if follow_up_text:
                response_text = follow_up_text
            elif chart_payload:
                response_text = f"Here's your {chart_payload.get('type')} chart."
            elif forecast_payload:
                response_text = (
                    f"Here's the forecast for '{forecast_payload.get('target_column')}' "
                    f"({forecast_payload.get('method')}, horizon={forecast_payload.get('horizon')})."
                )
            else:
                reason = tool_result_summary.get("reason", "")
                response_text = f"I couldn't complete that request. {reason}".strip()
        else:
            response_text = message.content or "No response generated."

        logger.info(f"Insight generated for {len(session_ids)} dataset(s)")

        result_payload = {"response": response_text}
        if chart_payload:
            result_payload["chart"] = chart_payload
        if forecast_payload:
            result_payload["forecast"] = forecast_payload
        return result_payload

    except Exception as e:
        err = str(e).lower()
        logger.error(f"Groq request failed: {err}")

        if "api_key" in err or "authentication" in err:
            return {"error": "AI key is invalid or missing."}

        if "rate" in err and "limit" in err:
            return {"error": "AI service rate limit hit. Try again shortly."}

        return {"error": "AI request failed. Please try again."}