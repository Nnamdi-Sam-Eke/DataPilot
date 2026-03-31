from fastapi import APIRouter, Request
from groq import Groq
import os
import logging
from .upload import get_session

router = APIRouter()
logger = logging.getLogger(__name__)

# Server-level fallback key — used when user hasn't set their own
SERVER_GROQ_KEY = os.getenv("GROQ_API_KEY")

if not SERVER_GROQ_KEY:
    logger.warning("⚠️  GROQ_API_KEY not set. AI will only work if users supply their own key.")
else:
    logger.info("✅ Server Groq key loaded.")


def get_groq_client(user_key: str | None) -> Groq | None:
    """
    Return a Groq client using the user's key if provided,
    falling back to the server env key. Returns None if neither exists.
    """
    key = (user_key or "").strip() or SERVER_GROQ_KEY
    if not key:
        return None
    try:
        return Groq(api_key=key)
    except Exception as e:
        logger.error(f"Failed to init Groq client: {e}")
        return None


@router.post("/")
async def get_insights(request: Request, payload: dict):
    """
    Generate AI insights for the active dataset.

    Reads the Groq API key from:
      1. x-groq-key request header  (user's own key from Settings page)
      2. GROQ_API_KEY env variable   (server fallback)

    Payload: { prompt: str, session_ids: [str] }
    """
    # ── resolve key ──────────────────────────────────────────────────────────
    user_key  = request.headers.get("x-groq-key", "").strip()
    client    = get_groq_client(user_key)
    key_source = "user" if user_key else "server"

    if not client:
        return {
            "error": (
                "No Groq API key configured. "
                "Go to Settings → Groq API Key and add your key from console.groq.com."
            )
        }

    prompt      = payload.get("prompt", "").strip()
    session_ids = payload.get("session_ids", [])

    if not prompt:
        return {"error": "Please provide a prompt."}
    if not session_ids:
        return {"error": "No dataset selected."}

    # ── gather dataset context ────────────────────────────────────────────────
    datasets_text = []
    for sid in session_ids:
        df = get_session(sid)
        if df is None:
            return {"error": f"Dataset session '{sid}' not found or expired. Please re-upload."}

        summary = {
            "shape":           list(df.shape),
            "columns":         df.columns.tolist(),
            "dtypes":          df.dtypes.astype(str).to_dict(),
            "sample":          df.head(5).to_dict(orient="records"),
            "missing_values":  df.isnull().sum().to_dict(),
            "numeric_summary": (
                df.describe().to_dict()
                if len(df.select_dtypes(include=["number"]).columns) > 0
                else {}
            ),
        }
        datasets_text.append(f"Dataset ({sid[:8]}…):\n{summary}")

    # ── build prompt ──────────────────────────────────────────────────────────
    system_prompt = (
        "You are DataPilot, an expert data analysis assistant. "
        "Analyse the provided dataset context and answer the user's question with precision. "
        "Include specific numbers, column names, and concrete insights. "
        "Be concise and direct. Use markdown formatting where helpful."
    )

    user_message = (
        f"Dataset context:\n{chr(10).join(datasets_text)}\n\n"
        f"User question: {prompt}"
    )

    try:
        result = client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user",   "content": user_message},
            ],
            temperature=0.4,
            max_tokens=2048,
        )
        response = result.choices[0].message.content or "No response generated."
        logger.info(f"✅ Insight generated [{key_source} key] for {len(session_ids)} dataset(s)")
        return {"response": response}

    except Exception as e:
        err = str(e)
        logger.error(f"Groq request failed [{key_source} key]: {err}")
        if "invalid_api_key" in err.lower() or "authentication" in err.lower():
            return {"error": "Invalid API key. Check your key in Settings and try again."}
        if "rate_limit" in err.lower():
            return {"error": "Rate limit reached. Add your own Groq key in Settings for higher limits."}
        return {"error": f"AI request failed: {err}"}