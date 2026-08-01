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

router = APIRouter()
logger = logging.getLogger(__name__)

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
MAX_MATCHED_ENTITIES_PER_COL = int(os.getenv("INSIGHTS_MAX_MATCHED_ENTITIES", "3"))
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

    # ================= BUILD CONTEXT =================
    for sid in session_ids:

        # ---------- session validation ----------
        df = get_session(sid)
        if df is None:
            CONTEXT_CACHE.pop(sid, None)
            return {"error": f"Dataset session '{sid}' not found or expired."}

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

                hits = []
                for value in all_values:
                    if not value:
                        continue
                    # word-boundary, case-insensitive match so "Chad" doesn't
                    # match inside an unrelated word, and multi-word values
                    # ("United States") still match correctly
                    if re.search(r"\b" + re.escape(value) + r"\b", prompt, flags=re.IGNORECASE):
                        hits.append(value)
                    if len(hits) >= MAX_MATCHED_ENTITIES_PER_COL:
                        break

                if not hits:
                    continue

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

            summary = {
                "shape": list(df.shape),
                "columns": cols,
                "sample": sample,
                "numeric_summary": numeric_summary,
                "unique_counts": unique_counts,
                "categorical_summary": categorical_summary,
                "matched_entities": matched_entities,
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
        "The sample field only shows a few example rows for context and must not be used "
        "to answer aggregate, cardinality, membership, or entity-specific questions. "
        "Be concise, accurate, and avoid hallucinating missing data."
    )

    user_message = (
        f"Dataset context:\n{chr(10).join(datasets_text)}\n\n"
        f"User question:\n{prompt}"
    )

    if len(user_message) > MAX_PROMPT_CHARS:
        user_message = user_message[:MAX_PROMPT_CHARS] + "\n...[truncated]"

    # ================= LLM CALL =================
    try:
        result = GROQ_CLIENT.chat.completions.create(
            model=GROQ_MODEL,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_message},
            ],
            temperature=0.3,
            max_tokens=2048,
        )

        response = result.choices[0].message.content or "No response generated."

        logger.info(f"Insight generated for {len(session_ids)} dataset(s)")

        return {
            "response": response,
        }

    except Exception as e:
        err = str(e).lower()
        logger.error(f"Groq request failed: {err}")

        if "api_key" in err or "authentication" in err:
            return {"error": "AI key is invalid or missing."}

        if "rate" in err and "limit" in err:
            return {"error": "AI service rate limit hit. Try again shortly."}

        return {"error": "AI request failed. Please try again."}