from fastapi import APIRouter, HTTPException
from typing import Dict, Any, List, Optional
import pandas as pd
import numpy as np
import logging
from datetime import datetime

router = APIRouter()
logger = logging.getLogger(__name__)


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


@router.post("/")
async def generate_report(payload: Dict):
    """
    Generate a structured analysis report from a session.
    payload = {
        "session_id": str,
        "sections": ["executive_summary", "data_quality", "statistics", "correlations", ...],
        "model_id": str (optional),
        "file_name": str (optional)
    }
    """
    from routers.upload import get_session

    session_id = payload.get("session_id")
    sections = payload.get("sections", ["executive_summary", "data_quality", "statistics", "correlations", "recommendations"])
    model_id = payload.get("model_id")
    file_name = payload.get("file_name", "dataset.csv")

    if not session_id:
        raise HTTPException(status_code=400, detail="session_id is required.")

    df = get_session(session_id)
    if df is None:
        raise HTTPException(status_code=404, detail="Session not found or expired.")

    report: Dict[str, Any] = {
        "generated_at": datetime.utcnow().isoformat(),
        "file_name": file_name,
        "sections": {}
    }

    try:
        n_rows, n_cols = df.shape
        numeric_cols = df.select_dtypes(include=["number"]).columns.tolist()
        categorical_cols = df.select_dtypes(include=["object", "category"]).columns.tolist()
        total_missing = int(df.isnull().sum().sum())
        missing_pct = round(total_missing / (n_rows * n_cols) * 100, 2) if n_rows * n_cols > 0 else 0
        duplicates = int(df.duplicated().sum())

        # Executive Summary
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
                )
            }

        # Data Quality
        if "data_quality" in sections:
            missing_by_col = df.isnull().sum()
            quality_cols = []
            for col in df.columns:
                miss = int(missing_by_col[col])
                quality_cols.append({
                    "column": col,
                    "missing_count": miss,
                    "missing_pct": round(miss / n_rows * 100, 2) if n_rows > 0 else 0,
                    "dtype": str(df[col].dtype),
                    "unique_values": int(df[col].nunique()),
                })
            report["sections"]["data_quality"] = {
                "total_missing": total_missing,
                "missing_pct": missing_pct,
                "duplicate_rows": duplicates,
                "columns": quality_cols,
            }

        # Statistics
        if "statistics" in sections and numeric_cols:
            stats = {}
            desc = df[numeric_cols].describe()
            for col in numeric_cols:
                col_stats = desc[col].to_dict()
                col_stats = {k: (None if (isinstance(v, float) and (np.isnan(v) or np.isinf(v))) else v)
                             for k, v in col_stats.items()}
                stats[col] = col_stats
            report["sections"]["statistics"] = stats

        # ==================== REAL CORRELATION MATRIX ====================
        if "correlations" in sections and len(numeric_cols) >= 2:
            corr = df[numeric_cols].corr()
            
            # Top correlations (excluding diagonal)
            top_corrs = []
            for i in range(len(numeric_cols)):
                for j in range(i + 1, len(numeric_cols)):
                    val = corr.iloc[i, j]
                    if not np.isnan(val):
                        top_corrs.append({
                            "col_a": numeric_cols[i],
                            "col_b": numeric_cols[j],
                            "correlation": round(float(val), 4),
                        })
            top_corrs.sort(key=lambda x: abs(x["correlation"]), reverse=True)

            # Full correlation matrix - JSON safe
            corr_matrix = {}
            for i, col in enumerate(numeric_cols):
                corr_matrix[col] = {}
                for j, other in enumerate(numeric_cols):
                    val = corr.iloc[i, j]
                    corr_matrix[col][other] = None if np.isnan(val) else round(float(val), 4)

            report["sections"]["correlations"] = {
                "top_correlations": top_corrs[:15],
                "matrix": corr_matrix,
                "numeric_columns": numeric_cols
            }

        # Feature Importance
        if "feature_importance" in sections and model_id:
            try:
                from routers.train import MODEL_STORE
                if model_id in MODEL_STORE:
                    store = MODEL_STORE[model_id]
                    model = store["model"]
                    feature_cols = store["feature_columns"]
                    fi_data = []
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

        # Model Performance
        if "model_performance" in sections and model_id:
            try:
                from routers.train import MODEL_STORE
                if model_id in MODEL_STORE:
                    store = MODEL_STORE[model_id]
                    report["sections"]["model_performance"] = {
                        "model_type": store["model_type"],
                        "task": "classification" if store["is_classification"] else "regression",
                    }
            except Exception:
                pass

        # Recommendations
        if "recommendations" in sections:
            recs = []
            if missing_pct > 5:
                recs.append(f"Address missing values ({missing_pct}% of data). Consider median/mode imputation or row removal.")
            if duplicates > 0:
                recs.append(f"Remove {duplicates} duplicate rows before modeling.")
            if len(categorical_cols) > 0:
                recs.append(f"Encode {len(categorical_cols)} categorical column(s) before training.")
            if len(numeric_cols) >= 2:
                try:
                    high_corr = [(numeric_cols[i], numeric_cols[j], corr.iloc[i, j])
                                 for i in range(len(numeric_cols))
                                 for j in range(i+1, len(numeric_cols))
                                 if abs(corr.iloc[i, j]) > 0.9 and not np.isnan(corr.iloc[i, j])]
                    if high_corr:
                        recs.append(f"Found {len(high_corr)} highly correlated column pair(s) — consider removing redundant features.")
                except Exception:
                    pass
            if not recs:
                recs.append("Dataset looks clean. Ready for modeling.")
            report["sections"]["recommendations"] = recs

        logger.info(f"✅ Report generated for session {session_id}")
        return sanitize(report)

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Report generation failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Report generation failed: {str(e)}")