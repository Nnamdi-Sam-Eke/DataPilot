from fastapi import APIRouter
from dotenv import load_dotenv
from pathlib import Path
from datetime import datetime
import os
import logging
import json
from typing import Dict

from .upload import get_session, DATA_CACHE

router = APIRouter()
logger = logging.getLogger(__name__)

# ================= CACHE =================
CONTEXT_CACHE: Dict[str, str] = {}
REQUEST_LOGS: Dict[str, list] = {}

# ================= CONFIG =================
RATE_LIMIT = int(os.getenv("INSIGHTS_RATE_LIMIT", "5"))
RATE_WINDOW_SECONDS = int(os.getenv("INSIGHTS_RATE_WINDOW", "60"))

MAX_COLUMNS = int(os.getenv("INSIGHTS_MAX_COLUMNS", "20"))
MAX_SAMPLE_ROWS = int(os.getenv("INSIGHTS_MAX_SAMPLE_ROWS", "3"))
MAX_SUMMARY_ITEMS = int(os.getenv("INSIGHTS_MAX_SUMMARY_ITEMS", "10"))
MAX_PROMPT_CHARS = int(os.getenv("INSIGHTS_MAX_PROMPT_CHARS", "12000"))

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
async def get_insights(payload: dict):

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

    now = datetime.utcnow()
    datasets_text = []

    # ================= BUILD CONTEXT =================
    for sid in session_ids:

        # ---------- session validation ----------
        df = get_session(sid)
        if df is None:
            CONTEXT_CACHE.pop(sid, None)
            return {"error": f"Dataset session '{sid}' not found or expired."}

        # ---------- rate limit ----------
        times = REQUEST_LOGS.get(sid, [])
        times = [t for t in times if (now - t).total_seconds() < RATE_WINDOW_SECONDS]

        if len(times) >= RATE_LIMIT:
            return {"error": f"Rate limit exceeded for session '{sid}'"}

        times.append(now)
        REQUEST_LOGS[sid] = times

        # ================= BUILD SUMMARY =================
        try:
            cols = df.columns.tolist()[:MAX_COLUMNS]
            sample = df.head(MAX_SAMPLE_ROWS).to_dict(orient="records")

            numeric_cols = df.select_dtypes(include=["number"]).columns.tolist()
            numeric_summary = {}

            if numeric_cols:
                desc = df[numeric_cols].describe().to_dict()
                numeric_summary = dict(list(desc.items())[:MAX_SUMMARY_ITEMS])

            summary = {
                "shape": list(df.shape),
                "columns": cols,
                "sample": sample,
                "numeric_summary": numeric_summary,
            }

        except Exception as e:
            logger.error(f"Failed building dataset summary for {sid}: {e}")
            summary = {
                "shape": [0, 0],
                "columns": [],
                "sample": [],
                "numeric_summary": {},
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

        return {"response": response}

    except Exception as e:
        err = str(e).lower()
        logger.error(f"Groq request failed: {err}")

        if "api_key" in err or "authentication" in err:
            return {"error": "AI key is invalid or missing."}

        if "rate" in err and "limit" in err:
            return {"error": "AI service rate limit hit. Try again shortly."}

        return {"error": "AI request failed. Please try again."}