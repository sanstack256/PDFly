import os
import json
import base64
from pathlib import Path
from typing import List, Optional
from fastapi import FastAPI, UploadFile, File, Form, HTTPException, BackgroundTasks
from fastapi.responses import FileResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware

from storage import create_job_dir, save_upload, cleanup_old_jobs
from services.organize import (
    merge_pdfs, split_pdf, remove_pages, extract_pages,
    organize_pages, rotate_pdf, add_page_numbers, add_watermark
)
from services.optimize import compress_pdf, repair_pdf, ocr_pdf
from services.convert import (
    jpg_to_pdf, office_to_pdf, html_to_pdf,
    pdf_to_jpg, pdf_to_word, pdf_to_pptx, pdf_to_excel, pdf_to_pdfa
)
from services.edit import apply_pdf_edits
from services.security import protect_pdf, unlock_pdf, sign_pdf, redact_pdf
from services.preview import get_pdf_info, generate_page_thumbnails

app = FastAPI(title="PDFly Backend API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("startup")
def startup_event():
    cleanup_old_jobs()

@app.get("/api/health")
def health_check():
    return {"status": "ok", "app": "PDFly"}

# ---------------- PREVIEW / METADATA ----------------

@app.post("/api/preview/info")
async def preview_info(file: UploadFile = File(...)):
    job_dir = create_job_dir()
    file_path = await save_upload(file, job_dir)
    try:
        info = get_pdf_info(file_path)
        return info
    finally:
        pass

@app.post("/api/preview/thumbnails")
async def preview_thumbnails(
    file: UploadFile = File(...),
    max_pages: int = Form(50),
    dpi: int = Form(72)
):
    job_dir = create_job_dir()
    file_path = await save_upload(file, job_dir)
    try:
        thumbnails = generate_page_thumbnails(file_path, max_pages=max_pages, dpi=dpi)
        return {"thumbnails": thumbnails, "job_id": job_dir.name}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

# ---------------- 1. ORGANIZE PDF ----------------

@app.post("/api/organize/merge")
async def handle_merge(files: List[UploadFile] = File(...)):
    if len(files) < 2:
        raise HTTPException(status_code=400, detail="Please upload at least 2 PDF files to merge.")
    job_dir = create_job_dir()
    saved_paths = []
    for f in files:
        p = await save_upload(f, job_dir)
        saved_paths.append(p)
    out_file = job_dir / "merged.pdf"
    try:
        merge_pdfs(saved_paths, out_file)
        return {
            "success": True,
            "filename": out_file.name,
            "download_url": f"/api/download/{job_dir.name}/{out_file.name}",
            "job_id": job_dir.name,
            "file_size": os.path.getsize(out_file)
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/organize/split")
async def handle_split(
    file: UploadFile = File(...),
    split_mode: str = Form("ranges"),
    ranges: Optional[str] = Form(None)
):
    job_dir = create_job_dir()
    file_path = await save_upload(file, job_dir)
    try:
        out_path = split_pdf(file_path, job_dir, split_mode=split_mode, ranges_str=ranges)
        return {
            "success": True,
            "filename": out_path.name,
            "download_url": f"/api/download/{job_dir.name}/{out_path.name}",
            "job_id": job_dir.name,
            "file_size": os.path.getsize(out_path)
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.post("/api/organize/remove-pages")
async def handle_remove_pages(
    file: UploadFile = File(...),
    pages: str = Form(...)  # Comma-separated page numbers: "1, 3, 5"
):
    job_dir = create_job_dir()
    file_path = await save_upload(file, job_dir)
    out_file = job_dir / "pages_removed.pdf"
    try:
        page_nums = [int(p.strip()) for p in pages.split(",") if p.strip().isdigit()]
        remove_pages(file_path, page_nums, out_file)
        return {
            "success": True,
            "filename": out_file.name,
            "download_url": f"/api/download/{job_dir.name}/{out_file.name}",
            "job_id": job_dir.name,
            "file_size": os.path.getsize(out_file)
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.post("/api/organize/extract-pages")
async def handle_extract_pages(
    file: UploadFile = File(...),
    pages: str = Form(...),
    as_zip: bool = Form(False)
):
    job_dir = create_job_dir()
    file_path = await save_upload(file, job_dir)
    out_file = job_dir / "extracted_pages.pdf"
    try:
        page_nums = [int(p.strip()) for p in pages.split(",") if p.strip().isdigit()]
        out_path = extract_pages(file_path, page_nums, out_file, as_zip=as_zip)
        return {
            "success": True,
            "filename": out_path.name,
            "download_url": f"/api/download/{job_dir.name}/{out_path.name}",
            "job_id": job_dir.name,
            "file_size": os.path.getsize(out_path)
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.post("/api/organize/organize-pages")
async def handle_organize_pages(
    file: UploadFile = File(...),
    page_order: str = Form(...),  # JSON array "[1, 3, 2]"
    rotations: Optional[str] = Form(None)  # JSON object '{"1": 90}'
):
    job_dir = create_job_dir()
    file_path = await save_upload(file, job_dir)
    out_file = job_dir / "organized.pdf"
    try:
        order = json.loads(page_order)
        rot_dict = json.loads(rotations) if rotations else {}
        organize_pages(file_path, order, rot_dict, out_file)
        return {
            "success": True,
            "filename": out_file.name,
            "download_url": f"/api/download/{job_dir.name}/{out_file.name}",
            "job_id": job_dir.name,
            "file_size": os.path.getsize(out_file)
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.post("/api/organize/rotate")
async def handle_rotate(
    file: UploadFile = File(...),
    angle: int = Form(90),
    pages: Optional[str] = Form(None)
):
    job_dir = create_job_dir()
    file_path = await save_upload(file, job_dir)
    out_file = job_dir / "rotated.pdf"
    try:
        page_nums = [int(p.strip()) for p in pages.split(",") if p.strip().isdigit()] if pages else None
        rotate_pdf(file_path, angle, page_nums, out_file)
        return {
            "success": True,
            "filename": out_file.name,
            "download_url": f"/api/download/{job_dir.name}/{out_file.name}",
            "job_id": job_dir.name,
            "file_size": os.path.getsize(out_file)
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.post("/api/organize/page-numbers")
async def handle_page_numbers(
    file: UploadFile = File(...),
    position: str = Form("bottom-center"),
    format_type: str = Form("page_of_total"),
    start_page: int = Form(1),
    font_size: float = Form(10.0),
    margin: float = Form(36.0)
):
    job_dir = create_job_dir()
    file_path = await save_upload(file, job_dir)
    out_file = job_dir / "page_numbered.pdf"
    try:
        add_page_numbers(file_path, position, format_type, start_page, font_size, margin, out_file)
        return {
            "success": True,
            "filename": out_file.name,
            "download_url": f"/api/download/{job_dir.name}/{out_file.name}",
            "job_id": job_dir.name,
            "file_size": os.path.getsize(out_file)
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.post("/api/organize/watermark")
async def handle_watermark(
    file: UploadFile = File(...),
    watermark_type: str = Form("text"),
    text: str = Form("CONFIDENTIAL"),
    watermark_image: Optional[UploadFile] = File(None),
    opacity: float = Form(0.3),
    rotation: float = Form(45.0),
    font_size: float = Form(48.0),
    color: str = Form("#888888")
):
    job_dir = create_job_dir()
    file_path = await save_upload(file, job_dir)
    image_path = None
    if watermark_image:
        image_path = await save_upload(watermark_image, job_dir, custom_filename="watermark_img.png")
    out_file = job_dir / "watermarked.pdf"
    try:
        add_watermark(
            file_path, watermark_type=watermark_type, text=text,
            image_path=image_path, opacity=opacity, rotation=rotation,
            font_size=font_size, color_hex=color, output_path=out_file
        )
        return {
            "success": True,
            "filename": out_file.name,
            "download_url": f"/api/download/{job_dir.name}/{out_file.name}",
            "job_id": job_dir.name,
            "file_size": os.path.getsize(out_file)
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

# ---------------- 2. OPTIMIZE PDF ----------------

@app.post("/api/optimize/compress")
async def handle_compress(
    file: UploadFile = File(...),
    compression_level: str = Form("recommended") # extreme, recommended, less
):
    job_dir = create_job_dir()
    file_path = await save_upload(file, job_dir)
    out_file = job_dir / "compressed.pdf"
    try:
        stats = compress_pdf(file_path, compression_level, out_file)
        return {
            "success": True,
            "filename": out_file.name,
            "download_url": f"/api/download/{job_dir.name}/{out_file.name}",
            "job_id": job_dir.name,
            "file_size": stats["compressed_size"],
            "original_size": stats["original_size"],
            "savings_percent": stats["savings_percent"]
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.post("/api/optimize/repair")
async def handle_repair(file: UploadFile = File(...)):
    job_dir = create_job_dir()
    file_path = await save_upload(file, job_dir)
    out_file = job_dir / "repaired.pdf"
    try:
        res = repair_pdf(file_path, out_file)
        return {
            "success": True,
            "filename": out_file.name,
            "download_url": f"/api/download/{job_dir.name}/{out_file.name}",
            "job_id": job_dir.name,
            "file_size": res["file_size"],
            "details": res["details"]
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.post("/api/optimize/ocr")
async def handle_ocr(
    file: UploadFile = File(...),
    language: str = Form("eng")
):
    job_dir = create_job_dir()
    file_path = await save_upload(file, job_dir)
    out_file = job_dir / "ocr_searchable.pdf"
    try:
        res = ocr_pdf(file_path, language=language, output_path=out_file)
        return {
            "success": True,
            "filename": out_file.name,
            "download_url": f"/api/download/{job_dir.name}/{out_file.name}",
            "job_id": job_dir.name,
            "file_size": os.path.getsize(out_file),
            "pages_processed": res["pages_processed"]
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# ---------------- 3. CONVERT TO PDF ----------------

@app.post("/api/convert/jpg-to-pdf")
async def handle_jpg_to_pdf(
    files: List[UploadFile] = File(...),
    page_size: str = Form("A4"),
    orientation: str = Form("auto"),
    margin: float = Form(0.0)
):
    job_dir = create_job_dir()
    saved = []
    for f in files:
        p = await save_upload(f, job_dir)
        saved.append(p)
    out_file = job_dir / "images_combined.pdf"
    try:
        jpg_to_pdf(saved, out_file, page_size=page_size, orientation=orientation, margin=margin)
        return {
            "success": True,
            "filename": out_file.name,
            "download_url": f"/api/download/{job_dir.name}/{out_file.name}",
            "job_id": job_dir.name,
            "file_size": os.path.getsize(out_file)
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.post("/api/convert/word-to-pdf")
async def handle_word_to_pdf(file: UploadFile = File(...)):
    job_dir = create_job_dir()
    file_path = await save_upload(file, job_dir)
    out_file = job_dir / "converted_from_word.pdf"
    try:
        office_to_pdf(file_path, out_file)
        return {
            "success": True,
            "filename": out_file.name,
            "download_url": f"/api/download/{job_dir.name}/{out_file.name}",
            "job_id": job_dir.name,
            "file_size": os.path.getsize(out_file)
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/convert/pptx-to-pdf")
async def handle_pptx_to_pdf(file: UploadFile = File(...)):
    job_dir = create_job_dir()
    file_path = await save_upload(file, job_dir)
    out_file = job_dir / "converted_from_powerpoint.pdf"
    try:
        office_to_pdf(file_path, out_file)
        return {
            "success": True,
            "filename": out_file.name,
            "download_url": f"/api/download/{job_dir.name}/{out_file.name}",
            "job_id": job_dir.name,
            "file_size": os.path.getsize(out_file)
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/convert/excel-to-pdf")
async def handle_excel_to_pdf(file: UploadFile = File(...)):
    job_dir = create_job_dir()
    file_path = await save_upload(file, job_dir)
    out_file = job_dir / "converted_from_excel.pdf"
    try:
        office_to_pdf(file_path, out_file)
        return {
            "success": True,
            "filename": out_file.name,
            "download_url": f"/api/download/{job_dir.name}/{out_file.name}",
            "job_id": job_dir.name,
            "file_size": os.path.getsize(out_file)
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/convert/html-to-pdf")
async def handle_html_to_pdf(file: UploadFile = File(...)):
    job_dir = create_job_dir()
    file_path = await save_upload(file, job_dir)
    out_file = job_dir / "converted_from_html.pdf"
    try:
        html_to_pdf(file_path, out_file)
        return {
            "success": True,
            "filename": out_file.name,
            "download_url": f"/api/download/{job_dir.name}/{out_file.name}",
            "job_id": job_dir.name,
            "file_size": os.path.getsize(out_file)
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# ---------------- 4. CONVERT FROM PDF ----------------

@app.post("/api/convert/pdf-to-jpg")
async def handle_pdf_to_jpg(
    file: UploadFile = File(...),
    dpi: int = Form(200)
):
    job_dir = create_job_dir()
    file_path = await save_upload(file, job_dir)
    try:
        out_path = pdf_to_jpg(file_path, job_dir, dpi=dpi, as_zip=True)
        return {
            "success": True,
            "filename": out_path.name,
            "download_url": f"/api/download/{job_dir.name}/{out_path.name}",
            "job_id": job_dir.name,
            "file_size": os.path.getsize(out_path)
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/convert/pdf-to-word")
async def handle_pdf_to_word(file: UploadFile = File(...)):
    job_dir = create_job_dir()
    file_path = await save_upload(file, job_dir)
    out_file = job_dir / f"{file_path.stem}.docx"
    try:
        pdf_to_word(file_path, out_file)
        return {
            "success": True,
            "filename": out_file.name,
            "download_url": f"/api/download/{job_dir.name}/{out_file.name}",
            "job_id": job_dir.name,
            "file_size": os.path.getsize(out_file)
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/convert/pdf-to-pptx")
async def handle_pdf_to_pptx(file: UploadFile = File(...)):
    job_dir = create_job_dir()
    file_path = await save_upload(file, job_dir)
    out_file = job_dir / f"{file_path.stem}.pptx"
    try:
        pdf_to_pptx(file_path, out_file)
        return {
            "success": True,
            "filename": out_file.name,
            "download_url": f"/api/download/{job_dir.name}/{out_file.name}",
            "job_id": job_dir.name,
            "file_size": os.path.getsize(out_file)
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/convert/pdf-to-excel")
async def handle_pdf_to_excel(file: UploadFile = File(...)):
    job_dir = create_job_dir()
    file_path = await save_upload(file, job_dir)
    out_file = job_dir / f"{file_path.stem}.xlsx"
    try:
        pdf_to_excel(file_path, out_file)
        return {
            "success": True,
            "filename": out_file.name,
            "download_url": f"/api/download/{job_dir.name}/{out_file.name}",
            "job_id": job_dir.name,
            "file_size": os.path.getsize(out_file)
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/convert/pdf-to-pdfa")
async def handle_pdf_to_pdfa(
    file: UploadFile = File(...),
    version: str = Form("2")
):
    job_dir = create_job_dir()
    file_path = await save_upload(file, job_dir)
    out_file = job_dir / f"{file_path.stem}_pdfa.pdf"
    try:
        pdf_to_pdfa(file_path, out_file, pdfa_level=version)
        return {
            "success": True,
            "filename": out_file.name,
            "download_url": f"/api/download/{job_dir.name}/{out_file.name}",
            "job_id": job_dir.name,
            "file_size": os.path.getsize(out_file)
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# ---------------- 5. EDIT PDF ----------------

@app.post("/api/edit/apply-edits")
async def handle_apply_edits(
    file: UploadFile = File(...),
    edits: str = Form(...), # JSON string array
    images: List[UploadFile] = File([])
):
    job_dir = create_job_dir()
    file_path = await save_upload(file, job_dir)
    
    # Save attached images if any
    saved_images = {}
    for img in images:
        if img.filename:
            img_p = await save_upload(img, job_dir)
            saved_images[img.filename] = str(img_p)
            
    out_file = job_dir / "edited_document.pdf"
    try:
        edit_list = json.loads(edits)
        for edit in edit_list:
            if edit.get("type") == "image":
                name = edit.get("image_name")
                if name in saved_images:
                    edit["image_path"] = saved_images[name]
                    
        apply_pdf_edits(file_path, edit_list, out_file)
        return {
            "success": True,
            "filename": out_file.name,
            "download_url": f"/api/download/{job_dir.name}/{out_file.name}",
            "job_id": job_dir.name,
            "file_size": os.path.getsize(out_file)
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

# ---------------- 6. PDF SECURITY ----------------

@app.post("/api/security/protect")
async def handle_protect(
    file: UploadFile = File(...),
    password: str = Form(...)
):
    job_dir = create_job_dir()
    file_path = await save_upload(file, job_dir)
    out_file = job_dir / "protected.pdf"
    try:
        protect_pdf(file_path, password, out_file)
        return {
            "success": True,
            "filename": out_file.name,
            "download_url": f"/api/download/{job_dir.name}/{out_file.name}",
            "job_id": job_dir.name,
            "file_size": os.path.getsize(out_file)
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.post("/api/security/unlock")
async def handle_unlock(
    file: UploadFile = File(...),
    password: str = Form(...)
):
    job_dir = create_job_dir()
    file_path = await save_upload(file, job_dir)
    out_file = job_dir / "unlocked.pdf"
    try:
        unlock_pdf(file_path, password, out_file)
        return {
            "success": True,
            "filename": out_file.name,
            "download_url": f"/api/download/{job_dir.name}/{out_file.name}",
            "job_id": job_dir.name,
            "file_size": os.path.getsize(out_file)
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.post("/api/security/sign")
async def handle_sign(
    file: UploadFile = File(...),
    page: int = Form(1),
    x: float = Form(100.0),
    y: float = Form(100.0),
    width: float = Form(150.0),
    height: float = Form(60.0),
    signature_image: Optional[UploadFile] = File(None),
    signature_data_url: Optional[str] = Form(None)
):
    job_dir = create_job_dir()
    file_path = await save_upload(file, job_dir)
    sig_path = job_dir / "signature.png"
    
    if signature_image:
        sig_path = await save_upload(signature_image, job_dir, custom_filename="signature.png")
    elif signature_data_url:
        # Base64 data URL e.g. "data:image/png;base64,..."
        header, b64_data = signature_data_url.split(",", 1) if "," in signature_data_url else ("", signature_data_url)
        with open(sig_path, "wb") as f:
            f.write(base64.b64decode(b64_data))
    else:
        raise HTTPException(status_code=400, detail="Signature image or drawing data required.")
        
    out_file = job_dir / "signed_document.pdf"
    try:
        sign_pdf(file_path, sig_path, page, x, y, width, height, out_file)
        return {
            "success": True,
            "filename": out_file.name,
            "download_url": f"/api/download/{job_dir.name}/{out_file.name}",
            "job_id": job_dir.name,
            "file_size": os.path.getsize(out_file)
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.post("/api/security/redact")
async def handle_redact(
    file: UploadFile = File(...),
    redactions: str = Form(...) # JSON string array
):
    job_dir = create_job_dir()
    file_path = await save_upload(file, job_dir)
    out_file = job_dir / "redacted.pdf"
    try:
        redaction_list = json.loads(redactions)
        redact_pdf(file_path, redaction_list, out_file)
        return {
            "success": True,
            "filename": out_file.name,
            "download_url": f"/api/download/{job_dir.name}/{out_file.name}",
            "job_id": job_dir.name,
            "file_size": os.path.getsize(out_file)
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

# ---------------- DOWNLOAD ----------------

@app.get("/api/download/{job_id}/{filename}")
async def download_file(job_id: str, filename: str):
    from storage import BASE_STORAGE_DIR
    target = BASE_STORAGE_DIR / job_id / filename
    if not target.exists():
        raise HTTPException(status_code=404, detail="Requested file was not found or has expired.")
        
    suffix = target.suffix.lower()
    media_types = {
        ".pdf": "application/pdf",
        ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".png": "image/png",
        ".zip": "application/zip",
    }
    media_type = media_types.get(suffix, "application/octet-stream")
    return FileResponse(
        path=str(target),
        filename=filename,
        media_type=media_type,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'}
    )
