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
    # Use the encoders fitted during training — re-fitting would give different
    # integer mappings for unseen or reordered category sets
    feature_label_encoders = store.get("feature_label_encoders", {})

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

        # Encode categoricals using the encoders fitted during training.
        # Unseen labels are mapped to -1 (out-of-vocabulary) rather than
        # causing a KeyError or producing wrong integer mappings.
        for col in X.select_dtypes(include=["object", "category"]).columns:
            le = feature_label_encoders.get(col)
            if le is not None:
                known = set(le.classes_)
                X[col] = X[col].astype(str).map(
                    lambda v, _le=le, _known=known: (
                        int(_le.transform([v])[0]) if v in _known else -1
                    )
                )
            else:
                # Fallback: fit a new encoder (old models trained before this change)
                fallback_le = LabelEncoder()
                X[col] = fallback_le.fit_transform(X[col].astype(str))

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

@router.post("/session/")
async def predict_from_session(payload: dict):
    """
    Score the already-loaded session dataset against a trained model.
    No file upload needed — uses the DataFrame already in DATA_CACHE.

    payload = {
        "model_id":  str,
        "session_id": str
    }
    """
    from routers.train import MODEL_STORE
    from routers.upload import get_session
    from sklearn.preprocessing import LabelEncoder

    model_id   = (payload.get("model_id")   or "").strip()
    session_id = (payload.get("session_id") or "").strip()

    if not model_id or not session_id:
        raise HTTPException(status_code=400, detail="model_id and session_id are required.")

    if model_id not in MODEL_STORE:
        raise HTTPException(status_code=404, detail="Model not found. Please train a model first.")

    df = get_session(session_id)
    if df is None:
        raise HTTPException(status_code=404, detail="Session not found or expired.")

    store = MODEL_STORE[model_id]
    model                  = store["model"]
    scaler                 = store["scaler"]
    feature_cols           = store["feature_columns"]
    is_classification      = store["is_classification"]
    le_y                   = store["label_encoder"]
    feature_label_encoders = store.get("feature_label_encoders", {})
    target_column          = store.get("target_column", "")

    try:
        # Drop the target column if it's present — we're predicting it
        df_input = df.drop(columns=[target_column], errors="ignore")

        # Align to the feature columns the model was trained on
        missing = [c for c in feature_cols if c not in df_input.columns]
        if missing:
            raise HTTPException(
                status_code=400,
                detail=f"Session dataset is missing columns the model needs: {', '.join(missing)}"
            )

        X = df_input[feature_cols].copy()

        # Encode categoricals using fitted training encoders
        for col in X.select_dtypes(include=["object", "category"]).columns:
            le = feature_label_encoders.get(col)
            if le is not None:
                known = set(le.classes_)
                X[col] = X[col].astype(str).map(
                    lambda v, _le=le, _known=known: (
                        int(_le.transform([v])[0]) if v in _known else -1
                    )
                )
            else:
                fallback_le = LabelEncoder()
                X[col] = fallback_le.fit_transform(X[col].astype(str))

        X = X.fillna(X.median(numeric_only=True))

        X_input = scaler.transform(X) if scaler is not None else X

        preds = model.predict(X_input)
        proba = None
        if is_classification and hasattr(model, "predict_proba"):
            proba = model.predict_proba(X_input)

        # Build results — try to carry an ID column from the original data
        results = []
        for i, pred in enumerate(preds):
            row: Dict[str, Any] = {}
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
                    row["confidence"] = (
                        "High"   if row["probability"] > 0.7 else
                        "Medium" if row["probability"] > 0.4 else
                        "Low"
                    )
            else:
                row["prediction"] = float(pred)

            results.append(row)

        # Summary stats
        if is_classification:
            from collections import Counter
            counts  = Counter(r["prediction"] for r in results)
            summary = {str(k): int(v) for k, v in counts.items()}
        else:
            pred_vals = [r["prediction"] for r in results]
            summary   = {
                "mean": float(np.mean(pred_vals)),
                "min":  float(np.min(pred_vals)),
                "max":  float(np.max(pred_vals)),
            }

        logger.info(f"✅ Session predictions: {len(results)} rows, model_id={model_id}, session_id={session_id}")
        return sanitize({
            "predictions": results,
            "total":       len(results),
            "summary":     summary,
            "task":        "classification" if is_classification else "regression",
            "source":      "session",   # lets the frontend know no file was uploaded
        })

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Session prediction failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Prediction failed: {str(e)}")