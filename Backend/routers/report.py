from fastapi import APIRouter, HTTPException
from typing import Dict, Any, List, Optional
import pandas as pd
import numpy as np
import logging
import os
from pathlib import Path
from datetime import datetime
from dotenv import load_dotenv

# Load server .env (same pattern as insights.py)
_ENV_PATH = Path(__file__).resolve().parent.parent / ".env"
load_dotenv(dotenv_path=_ENV_PATH)

router = APIRouter()
logger = logging.getLogger(__name__)

# Cache for expensive per-session computations (describe + corr).
# Keyed by session_id — invalidated when the session is evicted.
# Structure: { session_id: { "stats": {...}, "corr_matrix": {...}, "top_corrs": [...] } }
REPORT_CACHE: Dict[str, Dict] = {}


def _get_server_groq_key() -> str:
    """Return the server-side GROQ_API_KEY from env, stripped of whitespace."""
    val = os.getenv("GROQ_API_KEY", "")
    return val.strip() if val else ""


def _get_groq_client():
    """
    Return the shared Groq client initialised in main.py (preferred) or
    fall back to creating one inline.  Avoids duplicate HTTP connection pools.
    """
    try:
        from main import GROQ_CLIENT
        if GROQ_CLIENT is not None:
            return GROQ_CLIENT
    except Exception:
        pass
    key = _get_server_groq_key()
    if not key:
        return None
    try:
        from groq import Groq
        return Groq(api_key=key)
    except Exception:
        return None


def sanitize(obj):
    if isinstance(obj, dict):
        return {k: sanitize(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [sanitize(v) for v in obj]
    if isinstance(obj, np.generic):
        try:
            v = obj.item()
            if isinstance(v, float) and (np.isnan(v) or np.isinf(v)):
                return None
            return v
        except Exception:
            return str(obj)
    if isinstance(obj, float):
        if np.isnan(obj) or np.isinf(obj):
            return None
        return obj
    return obj


async def generate_ai_narrative(
    groq_key: str,
    file_name: str,
    n_rows: int,
    n_cols: int,
    numeric_cols: list,
    categorical_cols: list,
    missing_pct: float,
    duplicates: int,
    top_corrs: list,
    recommendations: list,
    model_type: str = None,
    task: str = None,
    metrics: dict = None,
) -> str:
    """
    Call Groq to generate a professional analyst narrative for the report header.
    Returns an empty string gracefully if the call fails or no key is provided.
    Uses the shared Groq client from main.py where available.
    """
    if not groq_key:
        return ""

    try:
        client = _get_groq_client()
        if client is None:
            return ""

        # Build a compact context string for the prompt
        corr_summary = ""
        if top_corrs:
            top = top_corrs[0]
            corr_summary = (
                f"The strongest correlation is between '{top['col_a']}' and '{top['col_b']}' "
                f"(r = {top['correlation']})."
            )

        model_summary = ""
        if model_type and task and metrics:
            primary_metric = ""
            if task == "classification" and "accuracy" in metrics:
                primary_metric = f"accuracy of {metrics['accuracy']*100:.1f}%"
            elif task == "regression" and "r2" in metrics:
                primary_metric = f"R² of {metrics['r2']:.3f}"
            if primary_metric:
                model_summary = (
                    f"A {model_type.upper()} model was trained for {task}, achieving a {primary_metric}."
                )

        rec_text = " ".join(recommendations[:3]) if recommendations else ""

        prompt = f"""You are a senior data analyst writing the opening narrative for a professional data analysis report.

Dataset: {file_name}
Shape: {n_rows:,} rows × {n_cols} columns ({len(numeric_cols)} numeric, {len(categorical_cols)} categorical)
Data quality: {missing_pct}% missing values, {duplicates} duplicate rows
{corr_summary}
{model_summary}
Key findings: {rec_text}

Write a concise, professional 3-4 sentence analyst summary for the report introduction. 
- Use confident, precise language appropriate for a business or technical audience.
- Highlight the most important findings and what they imply.
- Do NOT use bullet points, headers, or markdown — plain prose only.
- Do NOT start with "This report" or "The dataset". Be direct and insightful.
- Maximum 120 words."""

        response = client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[{"role": "user", "content": prompt}],
            max_tokens=200,
            temperature=0.5,
        )

        narrative = response.choices[0].message.content.strip()
        logger.info("✅ AI narrative generated successfully")
        return narrative

    except Exception as e:
        logger.warning(f"AI narrative generation skipped: {e}")
        return ""


@router.post("/")
async def generate_report(payload: Dict):
    """
    Generate a structured analysis report from a session.
    payload = {
        "session_id": str,
        "sections": [...],
        "model_id": str (optional),
        "file_name": str (optional),
        "groq_key": str (optional) — if provided, generates an AI narrative
    }
    """
    from routers.upload import get_session

    session_id = payload.get("session_id")
    sections   = payload.get("sections", [
        "executive_summary", "data_quality", "statistics",
        "correlations", "recommendations"
    ])
    model_id   = payload.get("model_id")
    file_name  = payload.get("file_name", "dataset.csv")

    # Prefer user BYOK key; fall back to server env key (same as insights.py)
    groq_key = (payload.get("groq_key") or "").strip() or _get_server_groq_key()

    if not session_id:
        raise HTTPException(status_code=400, detail="session_id is required.")

    df = get_session(session_id)
    if df is None:
        raise HTTPException(status_code=404, detail="Session not found or expired.")

    report: Dict[str, Any] = {
        "generated_at": datetime.utcnow().isoformat(),
        "file_name": file_name,
        "sections": {},
        "ai_narrative": "",
    }

    try:
        n_rows, n_cols       = df.shape
        numeric_cols         = df.select_dtypes(include=["number"]).columns.tolist()
        categorical_cols     = df.select_dtypes(include=["object", "category"]).columns.tolist()
        total_missing        = int(df.isnull().sum().sum())
        missing_pct          = round(total_missing / (n_rows * n_cols) * 100, 2) if n_rows * n_cols > 0 else 0
        duplicates           = int(df.duplicated().sum())

        # Check REPORT_CACHE to avoid recomputing expensive describe()/corr()
        cache_entry = REPORT_CACHE.get(session_id)
        use_cache = False
        cached_stats = None
        cached_corr_matrix = None
        cached_top_corrs = None
        cached_numeric_cols = None
        if cache_entry:
            try:
                if cache_entry.get("n_rows") == n_rows and cache_entry.get("n_cols") == n_cols:
                    use_cache = True
                    cached_stats = cache_entry.get("stats")
                    cached_corr_matrix = cache_entry.get("corr_matrix")
                    cached_top_corrs = cache_entry.get("top_corrs")
                    cached_numeric_cols = cache_entry.get("numeric_cols")
            except Exception:
                use_cache = False

        # ── Executive Summary ─────────────────────────────────────────────
        if "executive_summary" in sections:
            report["sections"]["executive_summary"] = {
                "rows": n_rows,
                "columns": n_cols,
                "numeric_columns": len(numeric_cols),
                "categorical_columns": len(categorical_cols),
                "missing_values_pct": missing_pct,
                "duplicate_rows": duplicates,
                "summary": (
                    f"The dataset contains {n_rows:,} rows and {n_cols} columns "
                    f"({len(numeric_cols)} numeric, {len(categorical_cols)} categorical). "
                    f"Missing values account for {missing_pct}% of all cells. "
                    f"{duplicates} duplicate rows were detected."
                ),
            }

        # ── Data Quality ──────────────────────────────────────────────────
        if "data_quality" in sections:
            missing_by_col = df.isnull().sum()
            quality_cols   = []
            for col in df.columns:
                miss = int(missing_by_col[col])
                quality_cols.append({
                    "column":        col,
                    "missing_count": miss,
                    "missing_pct":   round(miss / n_rows * 100, 2) if n_rows > 0 else 0,
                    "dtype":         str(df[col].dtype),
                    "unique_values": int(df[col].nunique()),
                })
            report["sections"]["data_quality"] = {
                "total_missing": total_missing,
                "missing_pct":   missing_pct,
                "duplicate_rows": duplicates,
                "columns":        quality_cols,
            }

        # ── Statistics ────────────────────────────────────────────────────
        if "statistics" in sections and numeric_cols:
            if use_cache and cached_stats is not None:
                report["sections"]["statistics"] = cached_stats
            else:
                stats = {}
                desc  = df[numeric_cols].describe()
                for col in numeric_cols:
                    col_stats = desc[col].to_dict()
                    col_stats = {
                        k: (None if (isinstance(v, float) and (np.isnan(v) or np.isinf(v))) else v)
                        for k, v in col_stats.items()
                    }
                    stats[col] = col_stats
                report["sections"]["statistics"] = stats

        # ── Correlations ──────────────────────────────────────────────────
        top_corrs = []
        corr      = None
        if "correlations" in sections and len(numeric_cols) >= 2:
            if use_cache and cached_corr_matrix is not None and cached_top_corrs is not None:
                # reuse previously computed correlation matrix and top correlations
                top_corrs = cached_top_corrs
                corr_matrix = cached_corr_matrix
                corr = None
                # ensure numeric_cols reflects cached value (for AI narrative)
                if cached_numeric_cols:
                    numeric_cols = cached_numeric_cols
            else:
                corr = df[numeric_cols].corr()

                for i in range(len(numeric_cols)):
                    for j in range(i + 1, len(numeric_cols)):
                        val = corr.iloc[i, j]
                        if not np.isnan(val):
                            top_corrs.append({
                                "col_a":       numeric_cols[i],
                                "col_b":       numeric_cols[j],
                                "correlation": round(float(val), 4),
                            })
                top_corrs.sort(key=lambda x: abs(x["correlation"]), reverse=True)

                corr_matrix = {}
                for i, col in enumerate(numeric_cols):
                    corr_matrix[col] = {}
                    for j, other in enumerate(numeric_cols):
                        val = corr.iloc[i, j]
                        corr_matrix[col][other] = None if np.isnan(val) else round(float(val), 4)

            report["sections"]["correlations"] = {
                "top_correlations": top_corrs[:15],
                "matrix":           corr_matrix,
                "numeric_columns":  numeric_cols,
            }

        # ── Feature Importance ────────────────────────────────────────────
        if "feature_importance" in sections and model_id:
            try:
                from routers.train import MODEL_STORE
                if model_id in MODEL_STORE:
                    store        = MODEL_STORE[model_id]
                    model        = store["model"]
                    feature_cols = store["feature_columns"]
                    fi_data      = []
                    if hasattr(model, "feature_importances_"):
                        fi = model.feature_importances_
                        fi_data = sorted(
                            [{"feature": col, "importance": round(float(imp), 4)}
                             for col, imp in zip(feature_cols, fi)],
                            key=lambda x: x["importance"], reverse=True
                        )[:10]
                    report["sections"]["feature_importance"] = fi_data
            except Exception as e:
                logger.warning(f"Could not get feature importance: {e}")

        # ── Model Performance (full metrics) ──────────────────────────────
        model_type_str = None
        task_str       = None
        metrics_dict   = {}
        if "model_performance" in sections and model_id:
            try:
                from routers.train import MODEL_STORE
                if model_id in MODEL_STORE:
                    store          = MODEL_STORE[model_id]
                    model_type_str = store.get("model_type", "")
                    task_str       = "classification" if store.get("is_classification") else "regression"
                    metrics_dict   = store.get("metrics", {})
                    report["sections"]["model_performance"] = {
                        "model_type": model_type_str,
                        "task":       task_str,
                        "metrics":    metrics_dict,
                        "train_size": store.get("train_size"),
                        "test_size":  store.get("test_size"),
                    }
            except Exception as e:
                logger.warning(f"Could not get model performance: {e}")

        # ── Recommendations ───────────────────────────────────────────────
        recs = []
        if "recommendations" in sections:
            if missing_pct > 5:
                recs.append(
                    f"Address missing values ({missing_pct}% of data). "
                    f"Consider median/mode imputation or row removal."
                )
            if duplicates > 0:
                recs.append(f"Remove {duplicates} duplicate rows before modeling.")
            if len(categorical_cols) > 0:
                recs.append(
                    f"Encode {len(categorical_cols)} categorical column(s) before training."
                )
            if len(numeric_cols) >= 2 and corr is not None:
                try:
                    high_corr = [
                        (numeric_cols[i], numeric_cols[j], corr.iloc[i, j])
                        for i in range(len(numeric_cols))
                        for j in range(i + 1, len(numeric_cols))
                        if abs(corr.iloc[i, j]) > 0.9 and not np.isnan(corr.iloc[i, j])
                    ]
                    if high_corr:
                        recs.append(
                            f"Found {len(high_corr)} highly correlated column pair(s) — "
                            f"consider removing redundant features."
                        )
                except Exception:
                    pass
            if not recs:
                recs.append("Dataset looks clean. Ready for modeling.")
            report["sections"]["recommendations"] = recs

        # ── AI Narrative (Groq) ───────────────────────────────────────────
        if groq_key:
            report["ai_narrative"] = await generate_ai_narrative(
                groq_key      = groq_key,
                file_name     = file_name,
                n_rows        = n_rows,
                n_cols        = n_cols,
                numeric_cols  = numeric_cols,
                categorical_cols = categorical_cols,
                missing_pct   = missing_pct,
                duplicates    = duplicates,
                top_corrs     = top_corrs,
                recommendations = recs,
                model_type    = model_type_str,
                task          = task_str,
                metrics       = metrics_dict,
            )

        logger.info(f"✅ Report generated for session {session_id}")

        # Persist expensive computations for subsequent requests
        try:
            REPORT_CACHE[session_id] = {
                "n_rows": n_rows,
                "n_cols": n_cols,
                "stats": report["sections"].get("statistics"),
                "corr_matrix": report["sections"].get("correlations", {}).get("matrix"),
                "top_corrs": report["sections"].get("correlations", {}).get("top_correlations"),
                "numeric_cols": numeric_cols,
                "stored_at": datetime.utcnow().isoformat(),
            }
        except Exception:
            pass

        return sanitize(report)

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Report generation failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Report generation failed: {str(e)}")