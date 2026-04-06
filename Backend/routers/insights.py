from fastapi import APIRouter
from groq import Groq
from dotenv import load_dotenv
from pathlib import Path
import os
import logging
from .upload import get_session

router = APIRouter()
logger = logging.getLogger(__name__)

# Always load Backend/.env explicitly
ENV_PATH = Path(__file__).resolve().parent.parent / ".env"
load_dotenv(dotenv_path=ENV_PATH)

logger.info(f"Loading .env from: {ENV_PATH}")
logger.info(f".env exists: {ENV_PATH.exists()}")

def get_env(name: str, default: str | None = None) -> str | None:
    value = os.getenv(name, default)
    return value.strip() if isinstance(value, str) else value

def get_groq_client() -> Groq | None:
    groq_api_key = get_env("GROQ_API_KEY")
    if not groq_api_key:
        logger.warning("GROQ_API_KEY is not set. Insights endpoint will not work.")
        return None

    try:
        logger.info("Server Groq key loaded.")
        return Groq(api_key=groq_api_key)
    except Exception as e:
        logger.error(f"Failed to init Groq client: {e}")
        return None

GROQ_MODEL = get_env("GROQ_MODEL", "llama-3.3-70b-versatile")


@router.post("/")
async def get_insights(payload: dict):
    client = get_groq_client()

    if not client:
        return {"error": "AI service is not configured on the server."}

    prompt = str(payload.get("prompt", "")).strip()
    session_ids = payload.get("session_ids", [])

    if not prompt:
        return {"error": "Please provide a prompt."}
    if not session_ids:
        return {"error": "No dataset selected."}

    datasets_text = []
    for sid in session_ids:
        df = get_session(sid)
        if df is None:
            return {
                "error": f"Dataset session '{sid}' not found or expired. Please re-upload."
            }

        summary = {
            "shape": list(df.shape),
            "columns": df.columns.tolist(),
            "dtypes": df.dtypes.astype(str).to_dict(),
            "sample": df.head(5).to_dict(orient="records"),
            "missing_values": df.isnull().sum().to_dict(),
            "numeric_summary": (
                df.describe().to_dict()
                if len(df.select_dtypes(include=["number"]).columns) > 0
                else {}
            ),
        }
        datasets_text.append(f"Dataset ({sid[:8]}...):\n{summary}")

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
            model=GROQ_MODEL,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_message},
            ],
            temperature=0.4,
            max_tokens=2048,
        )

        response = result.choices[0].message.content or "No response generated."
        logger.info(f"Insight generated for {len(session_ids)} dataset(s)")
        return {"response": response}

    except Exception as e:
        err = str(e)
        logger.error(f"Groq request failed: {err}")

        lower_err = err.lower()

        if "invalid_api_key" in lower_err or "authentication" in lower_err:
            return {"error": "The server AI key is invalid or expired."}

        if "rate_limit" in lower_err or "too many requests" in lower_err:
            return {"error": "AI service is temporarily busy. Please try again shortly."}

        return {"error": "AI request failed. Please try again."}