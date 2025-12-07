from __future__ import annotations

import os
import pathlib
from typing import Optional

from flask import current_app

try:
    import boto3
    from botocore.exceptions import ClientError
except ImportError:  # if you haven't installed boto3 yet
    boto3 = None
    ClientError = Exception


# ---------- helpers ----------

def _use_s3() -> bool:
    """Return True if S3 is configured in app.config."""
    cfg = current_app.config
    bucket = cfg.get("S3_BUCKET")
    return bool(bucket)


def _get_s3_client():
    """Create a low-level S3 client based on app.config."""
    if not boto3:
        raise RuntimeError(
            "boto3 is not installed but S3_BUCKET is configured. "
            "Install boto3 or remove S3 config."
        )

    cfg = current_app.config
    return boto3.client(
        "s3",
        aws_access_key_id=cfg.get("AWS_ACCESS_KEY_ID"),
        aws_secret_access_key=cfg.get("AWS_SECRET_ACCESS_KEY"),
        region_name=cfg.get("AWS_REGION", "ap-southeast-1"),
    )


def _local_base() -> pathlib.Path:
    """
    Local fallback base directory for file storage.

    We don’t rely on UPLOAD_DIR_PATH anymore, we just create
    <project_root>/uploads if needed.
    """
    base = pathlib.Path(current_app.root_path) / "uploads"
    base.mkdir(parents=True, exist_ok=True)
    return base


# ---------- public API ----------

def storage_save(key: str, data: bytes, *, content_type: Optional[str] = None) -> str:
    """
    Save an object under the given key.

    * If S3 is configured -> upload to S3 and return the key.
    * Otherwise -> store under local 'uploads' folder and return the relative key.
    """
    if _use_s3():
        cfg = current_app.config
        client = _get_s3_client()
        extra = {}
        if content_type:
            extra["ContentType"] = content_type
        client.put_object(
            Bucket=cfg["S3_BUCKET"],
            Key=key,
            Body=data,
            **extra,
        )
        return key

    # Local fallback
    base = _local_base()
    full = base / key
    full.parent.mkdir(parents=True, exist_ok=True)
    with full.open("wb") as f:
        f.write(data)
    # we store the key (relative path) in DB
    return key


def storage_get_bytes(key: str) -> Optional[bytes]:
    """
    Get raw bytes for a key, or None if not found.
    """
    if _use_s3():
        cfg = current_app.config
        client = _get_s3_client()
        try:
            obj = client.get_object(Bucket=cfg["S3_BUCKET"], Key=key)
        except ClientError:
            return None
        return obj["Body"].read()

    base = _local_base()
    full = base / key
    if not full.exists():
        return None
    return full.read_bytes()


def storage_exists(key: str) -> bool:
    """
    Check whether a key exists in storage.
    """
    if _use_s3():
        cfg = current_app.config
        client = _get_s3_client()
        try:
            client.head_object(Bucket=cfg["S3_BUCKET"], Key=key)
            return True
        except ClientError:
            return False

    base = _local_base()
    return (base / key).exists()


def storage_delete(key: str) -> None:
    """
    Delete the object for the given key (no error if it doesn't exist).
    """
    if _use_s3():
        cfg = current_app.config
        client = _get_s3_client()
        try:
            client.delete_object(Bucket=cfg["S3_BUCKET"], Key=key)
        except ClientError:
            # ignore missing objects etc. – safe for demo
            pass
        return

    base = _local_base()
    full = base / key
    if full.exists():
        full.unlink()
