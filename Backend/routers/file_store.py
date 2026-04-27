# routers/file_store.py
#
# Backblaze B2 integration for DataPilot persistent file storage.
# B2 client is shared via utils/b2_client.py — no duplicate singleton here.

import os
import io
import uuid
import logging
from datetime import datetime, timedelta

import pandas as pd
import chardet

from fastapi import APIRouter, HTTPException
from utils.b2_client import get_b2, b2_available, BUCKET, mime_from_ext

from routers.upload import DATA_CACHE, create_session, READERS, generate_summary
from routers.upload import sanitize_for_json, PLAN_EXPIRY

router = APIRouter()
logger = logging.getLogger(__name__)


# ── Helpers ───────────────────────────────────────────────────────────────────

def store_file_to_b2(uid: str, dataset_doc_id: str, file_name: str, content: bytes) -> str:
    """Upload raw file bytes to Backblaze B2. Returns the storage key."""
    ext         = file_name.rsplit(".", 1)[-1].lower() if "." in file_name else "bin"
    storage_key = f"users/{uid}/datasets/{dataset_doc_id}/{file_name}"

    get_b2().put_object(
        Bucket=BUCKET,
        Key=storage_key,
        Body=content,
        ContentType=mime_from_ext(ext),
        Metadata={
            "original_name":  file_name,
            "uploaded_at":    datetime.utcnow().isoformat(),
            "dataset_doc_id": dataset_doc_id,
        },
    )
    logger.info(f"✅ Stored to B2: {storage_key}")
    return storage_key


def fetch_file_from_b2(storage_key: str) -> tuple[bytes, str]:
    """Download file bytes from B2. Returns (content_bytes, original_file_name)."""
    response  = get_b2().get_object(Bucket=BUCKET, Key=storage_key)
    content   = response["Body"].read()
    file_name = response.get("Metadata", {}).get("original_name") or storage_key.split("/")[-1]
    return content, file_name


def _parse_content(content: bytes, file_name: str) -> pd.DataFrame:
    """
    Parse raw bytes back into a DataFrame.
    Supports CSV, XLSX/XLS, JSON, and Parquet (for promoted cleaned sessions).
    """
    ext = file_name.rsplit(".", 1)[-1].lower() if "." in file_name else ""
    buf = io.BytesIO(content)

    if ext == "parquet":
        return pd.read_parquet(buf)

    if ext in ("xlsx", "xls"):
        return pd.read_excel(buf)

    if ext == "json":
        return pd.read_json(buf)

    # CSV — auto-detect encoding
    detected = chardet.detect(content)
    encoding = detected.get("encoding") or "utf-8"
    for enc in [encoding, "utf-8", "latin-1", "cp1252"]:
        try:
            buf.seek(0)
            return pd.read_csv(buf, encoding=enc)
        except (UnicodeDecodeError, LookupError):
            continue

    buf.seek(0)
    return pd.read_csv(buf, encoding="latin-1", errors="replace")


# ── Routes ────────────────────────────────────────────────────────────────────

@router.post("/session/restore")
async def restore_session(payload: dict):
    """Re-create a DATA_CACHE session from a file stored in B2."""
    storage_key = (payload.get("storage_key") or "").strip()
    plan        = (payload.get("plan") or "free").lower()

    if not storage_key:
        raise HTTPException(status_code=400, detail="storage_key is required")

    if not b2_available():
        raise HTTPException(status_code=503, detail="B2 storage not configured.")

    try:
        content, file_name = fetch_file_from_b2(storage_key)
    except Exception as e:
        logger.error(f"B2 fetch failed for key {storage_key!r}: {e}")
        raise HTTPException(status_code=404, detail="Stored file not found.")

    try:
        df = _parse_content(content, file_name)
    except Exception as e:
        logger.error(f"Failed to parse restored file {file_name!r}: {e}")
        raise HTTPException(status_code=422, detail=f"Could not parse file: {e}")

    if df.empty:
        raise HTTPException(status_code=422, detail="Restored file is empty")

    session_id     = create_session(df, plan=plan, file_name=file_name)
    summary        = generate_summary(df)
    columns        = df.columns.tolist()
    sample_rows    = df.head(5).to_dict(orient="records")
    expiry_minutes = PLAN_EXPIRY.get(plan, PLAN_EXPIRY["free"])

    DATA_CACHE[session_id].update({
        "columns":   columns[:20],
        "sample":    sample_rows[:3],
        "summary":   dict(list(summary.items())[:10]),
        "row_count": len(df),
    })

    logger.info(f"✅ Session restored from B2: {file_name} → {session_id}")

    return sanitize_for_json({
        "session_id":     session_id,
        "file_name":      file_name,
        "columns":        columns,
        "summary":        summary,
        "sample":         sample_rows,
        "row_count":      len(df),
        "uploaded_at":    DATA_CACHE[session_id]["uploaded_at"],
        "expiry_minutes": expiry_minutes,
    })


@router.post("/session/snapshot")
async def snapshot_session_to_b2(payload: dict):
    """
    Serialize the current in-memory cleaned session DataFrame to CSV and upload to B2.
    CSV is used (not Parquet) so the restore path is identical to raw file uploads —
    _parse_content already handles CSV perfectly, no special branch needed.
    """
    session_id = (payload.get("session_id") or "").strip()
    file_name  = (payload.get("file_name")  or "").strip()

    if not session_id:
        raise HTTPException(status_code=400, detail="session_id is required")

    if session_id not in DATA_CACHE:
        raise HTTPException(status_code=404, detail="Session not found.")

    if not b2_available():
        raise HTTPException(status_code=503, detail="B2 storage not configured.")

    # Always produce a _cleaned.csv name regardless of the original extension
    if file_name and "." in file_name:
        csv_name = file_name.rsplit(".", 1)[0] + "_cleaned.csv"
    elif file_name:
        csv_name = file_name + "_cleaned.csv"
    else:
        csv_name = f"cleaned_{session_id[:8]}.csv"

    df = DATA_CACHE[session_id]["df"]

    try:
        buf = io.BytesIO()
        df.to_csv(buf, index=False, encoding="utf-8")
        buf.seek(0)
        csv_bytes = buf.read()
    except Exception as e:
        logger.error(f"CSV serialisation failed for session {session_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Could not serialise: {e}")

    dataset_doc_id = (payload.get("dataset_doc_id") or "").strip()
    uid            = (payload.get("uid")            or "").strip()

    if dataset_doc_id and uid:
        storage_key = f"users/{uid}/datasets/{dataset_doc_id}/{csv_name}"
    elif dataset_doc_id:
        storage_key = f"datasets/{dataset_doc_id}/{csv_name}"
    else:
        # legacy fallback — session created before this fix was deployed
        storage_key = f"files/{session_id}/{csv_name}"

    try:
        get_b2().put_object(
            Bucket=BUCKET,
            Key=storage_key,
            Body=csv_bytes,
            ContentType="text/csv",
            Metadata={
                "original_name": csv_name,
                "uploaded_at":   datetime.utcnow().isoformat(),
                "session_id":    session_id,
                "is_promoted":   "true",
            },
        )
    except Exception as e:
        logger.error(f"B2 snapshot upload failed for session {session_id}: {e}")
        raise HTTPException(status_code=500, detail=f"B2 upload failed: {e}")

    logger.info(f"✅ Cleaned snapshot stored to B2: {storage_key}")

    return {
        "status":      "ok",
        "storage_key": storage_key,
        "session_id":  session_id,
        "file_name":   csv_name,
    }


@router.delete("/file/delete")
async def delete_stored_file(payload: dict):
    """Delete a file from B2."""
    storage_key = (payload.get("storage_key") or "").strip()
    if not storage_key or not b2_available():
        return {"deleted": False}

    try:
        get_b2().delete_object(Bucket=BUCKET, Key=storage_key)
        logger.info(f"✅ Deleted from B2: {storage_key}")
        return {"deleted": True}
    except Exception as e:
        logger.warning(f"B2 delete failed (non-fatal): {e}")
        return {"deleted": False}


# ── Workspace: Model save/restore ─────────────────────────────────────────────

@router.post("/workspace/model/save")
async def save_model_to_r2(payload: dict):
    """
    Serialize a trained model from MODEL_STORE and upload to B2.
    Called automatically after training completes.
    payload = { "model_id": str, "dataset_doc_id": str }
    Returns { "r2_key": str }
    """
    from routers.train import MODEL_STORE, MODEL_EXPIRY_MINUTES

    model_id       = (payload.get("model_id")       or "").strip()
    dataset_doc_id = (payload.get("dataset_doc_id") or "").strip()

    if not model_id or not dataset_doc_id:
        raise HTTPException(status_code=400, detail="model_id and dataset_doc_id are required")

    if not b2_available():
        raise HTTPException(status_code=503, detail="B2 storage not configured on this server.")

    if model_id not in MODEL_STORE:
        raise HTTPException(status_code=404, detail="Model not found in memory. It may have expired.")

    try:
        import joblib
        import io as _io

        store  = MODEL_STORE[model_id]
        bundle = {
            "model":                  store["model"],
            "scaler":                 store["scaler"],
            "feature_columns":        store["feature_columns"],
            "feature_label_encoders": store.get("feature_label_encoders", {}),
            "target_column":          store["target_column"],
            "is_classification":      store["is_classification"],
            "label_encoder":          store["label_encoder"],
            "model_type":             store["model_type"],
            "metrics":                store.get("metrics", {}),
            "train_size":             store.get("train_size"),
            "test_size":              store.get("test_size"),
            "trained_at":             store["created_at"].isoformat(),
            "datapilot_version":      "1.0",
        }

        buf = _io.BytesIO()
        joblib.dump(bundle, buf)
        buf.seek(0)
        content = buf.read()

        r2_key = f"workspace/{dataset_doc_id}/models/{model_id}.pkl"
        get_b2().put_object(
            Bucket=BUCKET,
            Key=r2_key,
            Body=content,
            ContentType="application/octet-stream",
            Metadata={
                "model_type":     bundle["model_type"],
                "dataset_doc_id": dataset_doc_id,
            },
        )
        logger.info(f"✅ Model saved to B2: {r2_key}")
        return {"r2_key": r2_key}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"B2 model save failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Model save failed: {str(e)}")


@router.post("/workspace/model/restore")
async def restore_model_from_r2(payload: dict):
    """
    Fetch a model .pkl from B2 and reload it into MODEL_STORE with a fresh model_id.
    payload = { "r2_key": str }
    Returns { "model_id", "model_type", "task", "metrics", "feature_importance" }
    """
    from routers.train import MODEL_STORE, MODEL_EXPIRY_MINUTES

    r2_key = (payload.get("r2_key") or "").strip()
    if not r2_key:
        raise HTTPException(status_code=400, detail="r2_key is required")

    if not b2_available():
        raise HTTPException(status_code=503, detail="B2 storage not configured on this server.")

    try:
        response = get_b2().get_object(Bucket=BUCKET, Key=r2_key)
        content  = response["Body"].read()
    except Exception as e:
        logger.error(f"B2 model fetch failed for {r2_key!r}: {e}")
        raise HTTPException(status_code=404, detail=f"Model not found in B2: {e}")

    try:
        import joblib
        import io as _io
        import numpy as np

        bundle       = joblib.load(_io.BytesIO(content))
        new_model_id = str(uuid.uuid4())

        MODEL_STORE[new_model_id] = {
            "model":                  bundle["model"],
            "scaler":                 bundle["scaler"],
            "feature_columns":        bundle["feature_columns"],
            "feature_label_encoders": bundle.get("feature_label_encoders", {}),
            "target_column":          bundle["target_column"],
            "is_classification":      bundle["is_classification"],
            "label_encoder":          bundle["label_encoder"],
            "model_type":             bundle["model_type"],
            "metrics":                bundle.get("metrics", {}),
            "train_size":             bundle.get("train_size"),
            "test_size":              bundle.get("test_size"),
            "created_at":             datetime.utcnow(),
            "expiry_minutes":         MODEL_EXPIRY_MINUTES,
        }

        model        = bundle["model"]
        feature_cols = bundle["feature_columns"]
        feature_importance = []
        if hasattr(model, "feature_importances_"):
            fi = model.feature_importances_
            feature_importance = sorted(
                [{"feature": col, "importance": float(imp)} for col, imp in zip(feature_cols, fi)],
                key=lambda x: x["importance"], reverse=True
            )[:15]
        elif hasattr(model, "coef_"):
            coef = np.abs(model.coef_[0]) if model.coef_.ndim > 1 else np.abs(model.coef_)
            feature_importance = sorted(
                [{"feature": col, "importance": float(imp)} for col, imp in zip(feature_cols, coef)],
                key=lambda x: x["importance"], reverse=True
            )[:15]

        task = "classification" if bundle["is_classification"] else "regression"
        logger.info(f"✅ Model restored from B2: {r2_key} → {new_model_id}")

        return {
            "model_id":           new_model_id,
            "model_type":         bundle["model_type"],
            "task":               task,
            "metrics":            bundle.get("metrics", {}),
            "feature_importance": feature_importance,
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Model restore failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Model restore failed: {str(e)}")