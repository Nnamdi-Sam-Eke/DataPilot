from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from typing import Dict, Any, Optional
import pandas as pd
import numpy as np
import uuid
import io
import logging
from datetime import datetime

router = APIRouter()
logger = logging.getLogger(__name__)

# In-memory model store
MODEL_STORE: Dict[str, Any] = {}

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
async def train_model(payload: Dict):
    """
    Train a model on a cached session dataset.
    payload = {
        "session_id": str,
        "target_column": str,
        "model_type": "rf" | "lr" | "xgb" | "svm",
        "test_size": float (default 0.2)
    }
    """
    from routers.upload import get_session

    session_id = payload.get("session_id")
    target_column = payload.get("target_column")
    model_type = payload.get("model_type", "rf")
    test_size = float(payload.get("test_size", 0.2))

    if not session_id or not target_column:
        raise HTTPException(status_code=400, detail="session_id and target_column are required.")

    df = get_session(session_id)
    if df is None:
        raise HTTPException(status_code=404, detail="Session not found or expired.")

    if target_column not in df.columns:
        raise HTTPException(status_code=400, detail=f"Column '{target_column}' not found in dataset.")

    try:
        from sklearn.model_selection import train_test_split
        from sklearn.preprocessing import LabelEncoder, StandardScaler
        from sklearn.metrics import (
            accuracy_score, f1_score, precision_score, recall_score,
            confusion_matrix, mean_squared_error, mean_absolute_error, r2_score
        )
        from sklearn.ensemble import RandomForestClassifier, RandomForestRegressor
        from sklearn.linear_model import LogisticRegression, LinearRegression
        from sklearn.svm import SVC, SVR

        # Prepare features
        df_clean = df.dropna().copy()
        X = df_clean.drop(columns=[target_column])
        y = df_clean[target_column]

        # Drop datetime columns — sklearn cannot handle DateTime64
        datetime_cols = X.select_dtypes(include=["datetime", "datetime64", "datetimetz"]).columns.tolist()
        if datetime_cols:
            logger.info(f"Dropping datetime columns from features: {datetime_cols}")
            X = X.drop(columns=datetime_cols)

        if X.shape[1] == 0:
            raise HTTPException(status_code=400, detail="No usable feature columns after removing datetime columns.")

        # Encode categoricals in X
        for col in X.select_dtypes(include=["object", "category"]).columns:
            le = LabelEncoder()
            X[col] = le.fit_transform(X[col].astype(str))

        # Ensure all remaining columns are numeric — coerce anything else
        for col in X.columns:
            if not pd.api.types.is_numeric_dtype(X[col]):
                X[col] = pd.to_numeric(X[col], errors="coerce").fillna(0)

        # Determine task type
        is_classification = (
            y.dtype == "object" or
            y.dtype.name == "category" or
            y.nunique() <= 20
        )

        if is_classification:
            le_y = LabelEncoder()
            y_enc = le_y.fit_transform(y.astype(str))
        else:
            y_enc = y.values
            le_y = None

        X_train, X_test, y_train, y_test = train_test_split(
            X, y_enc, test_size=test_size, random_state=42
        )

        # Scale for LR and SVM
        scaler = StandardScaler()
        X_train_scaled = scaler.fit_transform(X_train)
        X_test_scaled = scaler.transform(X_test)

        # Select model
        MODEL_MAP = {
            "rf":  RandomForestClassifier(n_estimators=100, random_state=42) if is_classification else RandomForestRegressor(n_estimators=100, random_state=42),
            "lr":  LogisticRegression(max_iter=500, random_state=42) if is_classification else LinearRegression(),
            "svm": SVC(probability=True, random_state=42) if is_classification else SVR(),
        }

        # XGBoost (optional dependency)
        try:
            from xgboost import XGBClassifier, XGBRegressor
            MODEL_MAP["xgb"] = XGBClassifier(n_estimators=100, random_state=42, eval_metric="logloss") if is_classification else XGBRegressor(n_estimators=100, random_state=42)
        except ImportError:
            if model_type == "xgb":
                raise HTTPException(status_code=400, detail="XGBoost not installed. Run: pip install xgboost")

        if model_type not in MODEL_MAP:
            raise HTTPException(status_code=400, detail=f"Unknown model type: {model_type}")

        model = MODEL_MAP[model_type]
        use_scaled = model_type in ["lr", "svm"]
        Xtr = X_train_scaled if use_scaled else X_train
        Xte = X_test_scaled if use_scaled else X_test

        model.fit(Xtr, y_train)
        y_pred = model.predict(Xte)

        # Metrics
        metrics = {}
        if is_classification:
            avg = "binary" if len(np.unique(y_enc)) == 2 else "weighted"
            metrics = {
                "accuracy": float(accuracy_score(y_test, y_pred)),
                "f1": float(f1_score(y_test, y_pred, average=avg, zero_division=0)),
                "precision": float(precision_score(y_test, y_pred, average=avg, zero_division=0)),
                "recall": float(recall_score(y_test, y_pred, average=avg, zero_division=0)),
            }
            cm = confusion_matrix(y_test, y_pred).tolist()
            classes = le_y.classes_.tolist() if le_y else list(map(str, np.unique(y_enc)))
        else:
            mse = mean_squared_error(y_test, y_pred)
            metrics = {
                "rmse": float(np.sqrt(mse)),
                "mae": float(mean_absolute_error(y_test, y_pred)),
                "r2": float(r2_score(y_test, y_pred)),
            }
            cm = []
            classes = []

        # Feature importance
        feature_importance = []
        if hasattr(model, "feature_importances_"):
            fi = model.feature_importances_
            feature_importance = sorted(
                [{"feature": col, "importance": float(imp)} for col, imp in zip(X.columns, fi)],
                key=lambda x: x["importance"], reverse=True
            )[:15]
        elif hasattr(model, "coef_"):
            coef = np.abs(model.coef_[0]) if model.coef_.ndim > 1 else np.abs(model.coef_)
            feature_importance = sorted(
                [{"feature": col, "importance": float(imp)} for col, imp in zip(X.columns, coef)],
                key=lambda x: x["importance"], reverse=True
            )[:15]

        # Save sizes BEFORE releasing large training arrays — used later in metadata
        train_size_val = len(X_train)
        test_size_val = len(X_test)

        # Release large training arrays before storing model — keeps RAM lean
        import gc
        try:
            del X_train, X_test, y_train, y_test, y_pred
            if use_scaled:
                del X_train_scaled, X_test_scaled
            else:
                del Xtr, Xte
        except NameError:
            pass
        gc.collect()

        # Store model for predictions and export
        model_id = str(uuid.uuid4())
        MODEL_STORE[model_id] = {
            "model": model,
            "scaler": scaler if use_scaled else None,
            "feature_columns": X.columns.tolist(),
            "target_column": target_column,
            "is_classification": is_classification,
            "label_encoder": le_y,
            "model_type": model_type,
            "metrics": metrics,
            "train_size": train_size_val,
            "test_size": test_size_val,
            "created_at": datetime.utcnow(),
        }

        logger.info(f"✅ Model trained: {model_type}, model_id={model_id}")

        return sanitize({
            "model_id": model_id,
            "model_type": model_type,
            "task": "classification" if is_classification else "regression",
            "metrics": metrics,
            "confusion_matrix": cm,
            "classes": classes,
            "feature_importance": feature_importance,
            "train_size": train_size_val,
            "test_size": test_size_val,
        })

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Training failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Training failed: {str(e)}")

@router.get("/download/{model_id}")
async def download_model(model_id: str):
    """
    Serialize and stream a trained model as a .pkl bundle.
    The bundle includes the model, scaler, feature columns, label encoder,
    and metadata — everything needed to run predictions outside DataPilot.
    """
    if model_id not in MODEL_STORE:
        raise HTTPException(status_code=404, detail="Model not found or server was restarted.")

    try:
        import joblib

        store = MODEL_STORE[model_id]

        # Bundle everything the user needs to reproduce predictions externally
        bundle = {
            "model":           store["model"],
            "scaler":          store["scaler"],
            "feature_columns": store["feature_columns"],
            "target_column":   store["target_column"],
            "is_classification": store["is_classification"],
            "label_encoder":   store["label_encoder"],
            "model_type":      store["model_type"],
            "metrics":         store.get("metrics", {}),
            "train_size":      store.get("train_size"),
            "test_size":       store.get("test_size"),
            "trained_at":      store["created_at"].isoformat(),
            "datapilot_version": "1.0",
        }

        buf = io.BytesIO()
        joblib.dump(bundle, buf)
        buf.seek(0)

        model_type = store["model_type"]
        target     = store["target_column"].replace(" ", "_")
        filename   = f"datapilot_{model_type}_{target}.pkl"

        logger.info(f"✅ Model download: {model_id} → {filename}")

        return StreamingResponse(
            buf,
            media_type="application/octet-stream",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'},
        )

    except Exception as e:
        logger.error(f"Model download failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Model download failed: {str(e)}")