import os
import shutil
import time
import uuid
from pathlib import Path
from typing import List
from fastapi import UploadFile

BASE_STORAGE_DIR = Path(os.environ.get("PDFLY_STORAGE_DIR", "/tmp/pdfly_storage"))
BASE_STORAGE_DIR.mkdir(parents=True, exist_ok=True)

MAX_JOB_AGE_SECONDS = 3600  # 1 hour

def create_job_dir() -> Path:
    job_id = str(uuid.uuid4())
    job_dir = BASE_STORAGE_DIR / job_id
    job_dir.mkdir(parents=True, exist_ok=True)
    return job_dir

async def save_upload(upload_file: UploadFile, target_dir: Path, custom_filename: str = None) -> Path:
    filename = custom_filename or upload_file.filename or f"file_{uuid.uuid4().hex}"
    # sanitize filename
    safe_filename = "".join(c for c in filename if c.isalnum() or c in "._- ")
    target_path = target_dir / safe_filename
    with open(target_path, "wb") as f:
        content = await upload_file.read()
        f.write(content)
    return target_path

def cleanup_job(job_dir: Path):
    try:
        if job_dir.exists() and job_dir.is_dir():
            shutil.rmtree(job_dir, ignore_errors=True)
    except Exception:
        pass

def cleanup_old_jobs():
    try:
        now = time.time()
        for item in BASE_STORAGE_DIR.iterdir():
            if item.is_dir():
                mtime = item.stat().st_mtime
                if now - mtime > MAX_JOB_AGE_SECONDS:
                    shutil.rmtree(item, ignore_errors=True)
    except Exception:
        pass

