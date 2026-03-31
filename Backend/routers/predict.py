from fastapi import APIRouter, HTTPException, UploadFile, File
from typing import Dict, Any
import pandas as pd
import numpy as np
import io
import logging

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
async def predict(model_id: str, file: UploadFile = File(...)):
    """
    Score a new CSV/XLSX file against a trained model.
    Query param: model_id
    Body: multipart file upload
    """
    from routers.train import MODEL_STORE
    from sklearn.preprocessing import LabelEncoder

    if model_id not in MODEL_STORE:
        raise HTTPException(status_code=404, detail="Model not found. Please train a model first.")

    store = MODEL_STORE[model_id]
    model = store["model"]
    scaler = store["scaler"]
    feature_cols = store["feature_columns"]
    is_classification = store["is_classification"]
    le_y = store["label_encoder"]

    try:
        content = await file.read()
        buf = io.BytesIO(content)

        if file.filename.endswith(".csv"):
            # Auto-detect encoding to handle Latin-1, Windows-1252, etc.
            try:
                import chardet
                detected = chardet.detect(content)
                encoding = detected.get("encoding") or "utf-8"
            except ImportError:
                encoding = "utf-8"
            # Try detected encoding first, fall back through common encodings
            for enc in [encoding, "utf-8", "latin-1", "cp1252", "iso-8859-1"]:
                try:
                    buf.seek(0)
                    df = pd.read_csv(buf, encoding=enc)
                    break
                except (UnicodeDecodeError, LookupError):
                    continue
            else:
                buf.seek(0)
                df = pd.read_csv(buf, encoding="latin-1", errors="replace")
        elif file.filename.endswith((".xlsx", ".xls")):
            df = pd.read_excel(buf)
        else:
            raise HTTPException(status_code=400, detail="Only CSV and XLSX files are supported.")

        # Align columns
        missing = [c for c in feature_cols if c not in df.columns]
        if missing:
            raise HTTPException(
                status_code=400,
                detail=f"Missing columns in uploaded file: {', '.join(missing)}"
            )

        X = df[feature_cols].copy()

        # Encode categoricals
        for col in X.select_dtypes(include=["object", "category"]).columns:
            le = LabelEncoder()
            X[col] = le.fit_transform(X[col].astype(str))

        X = X.fillna(X.median(numeric_only=True))

        # Scale if needed
        X_input = scaler.transform(X) if scaler is not None else X

        preds = model.predict(X_input)
        proba = None
        if is_classification and hasattr(model, "predict_proba"):
            proba = model.predict_proba(X_input)

        # Build results
        results = []
        for i, pred in enumerate(preds):
            row: Dict[str, Any] = {}
            # Add original row data (first few identifying cols if present)
            for col in ["id", "ID", "customer_id", "CustomerID", "name", "Name"]:
                if col in df.columns:
                    row["id"] = str(df.iloc[i].get(col, i))
                    break
            else:
                row["id"] = str(i + 1)

            if is_classification and le_y is not None:
                label = le_y.inverse_transform([int(pred)])[0]
                row["prediction"] = str(label)
                if proba is not None:
                    row["probability"] = float(max(proba[i]))
                    row["confidence"] = "High" if row["probability"] > 0.7 else "Medium" if row["probability"] > 0.4 else "Low"
            else:
                row["prediction"] = float(pred)

            results.append(row)

        # Summary stats
        if is_classification:
            from collections import Counter
            counts = Counter(r["prediction"] for r in results)
            summary = {str(k): int(v) for k, v in counts.items()}
        else:
            pred_vals = [r["prediction"] for r in results]
            summary = {
                "mean": float(np.mean(pred_vals)),
                "min": float(np.min(pred_vals)),
                "max": float(np.max(pred_vals)),
            }

        logger.info(f"✅ Predictions generated: {len(results)} rows, model_id={model_id}")
        return sanitize({
            "predictions": results,
            "total": len(results),
            "summary": summary,
            "task": "classification" if is_classification else "regression",
        })

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Prediction failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Prediction failed: {str(e)}")