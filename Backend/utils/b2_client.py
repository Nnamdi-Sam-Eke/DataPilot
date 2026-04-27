"""
utils/b2_client.py

Single source of truth for the Backblaze B2 / S3-compatible client.
Both upload.py and file_store.py import from here so there is only
one boto3 connection pool and one place to update credentials.

Required env vars (set in Render):
    B2_ENDPOINT            e.g. https://s3.us-east-005.backblazeb2.com
    B2_ACCESS_KEY_ID       Backblaze application key ID
    B2_SECRET_ACCESS_KEY   Backblaze application key
    B2_BUCKET_NAME         your bucket name  e.g. "datapilot-files"
"""

import os
import logging

logger = logging.getLogger(__name__)

_b2_client = None

BUCKET = os.getenv("B2_BUCKET_NAME", "datapilot-files")


def b2_available() -> bool:
    """Return True only if all four B2 env vars are present and non-empty."""
    return all([
        os.getenv("B2_ENDPOINT", "").strip(),
        os.getenv("B2_ACCESS_KEY_ID", "").strip(),
        os.getenv("B2_SECRET_ACCESS_KEY", "").strip(),
        os.getenv("B2_BUCKET_NAME", "").strip(),
    ])


def get_b2():
    """
    Return a lazily-initialised boto3 S3 client pointed at Backblaze B2.
    Raises RuntimeError if env vars are missing — call b2_available() first.
    """
    global _b2_client
    if _b2_client is not None:
        return _b2_client

    endpoint   = os.getenv("B2_ENDPOINT", "").strip()
    access_key = os.getenv("B2_ACCESS_KEY_ID", "").strip()
    secret_key = os.getenv("B2_SECRET_ACCESS_KEY", "").strip()

    if not all([endpoint, access_key, secret_key]):
        raise RuntimeError(
            "B2 not configured. Set B2_ENDPOINT, B2_ACCESS_KEY_ID, "
            "and B2_SECRET_ACCESS_KEY in your Render environment variables."
        )

    import boto3
    from botocore.config import Config

    _b2_client = boto3.client(
        "s3",
        endpoint_url=endpoint,
        aws_access_key_id=access_key,
        aws_secret_access_key=secret_key,
        config=Config(signature_version="s3v4"),
        region_name="auto",
    )
    logger.info("✅ B2 client initialised")
    return _b2_client


def mime_from_ext(ext: str) -> str:
    return {
        "csv":  "text/csv",
        "xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "xls":  "application/vnd.ms-excel",
        "json": "application/json",
    }.get(ext.lower(), "application/octet-stream")