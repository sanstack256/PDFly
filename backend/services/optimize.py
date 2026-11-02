import os
import subprocess
import shutil
from pathlib import Path
from typing import Tuple, Dict, Any
import pymupdf
from PIL import Image
import pytesseract
import io

def compress_pdf(file_path: Path, compression_level: str, output_path: Path) -> Dict[str, Any]:
    orig_size = os.path.getsize(file_path)
    doc = pymupdf.open(file_path)
    
    if compression_level == "extreme":
        # Downsample and compress all embedded images
        for page_idx in range(len(doc)):
            page = doc[page_idx]
            image_list = page.get_images(full=True)
            for img in image_list:
                xref = img[0]
                try:
                    base_image = doc.extract_image(xref)
                    image_bytes = base_image["image"]
                    image_ext = base_image["ext"]
                    
                    pil_img = Image.open(io.BytesIO(image_bytes))
                    # Downscale if large
                    if pil_img.width > 1200 or pil_img.height > 1200:
                        pil_img.thumbnail((1000, 1000), Image.Resampling.LANCZOS)
                        
                    out_io = io.BytesIO()
                    if pil_img.mode in ("RGBA", "P"):
                        pil_img = pil_img.convert("RGB")
                    pil_img.save(out_io, format="JPEG", quality=55, optimize=True)
                    new_bytes = out_io.getvalue()
                    
                    if len(new_bytes) < len(image_bytes):
                        doc.update_stream(xref, new_bytes)
                except Exception:
                    continue
                    
        doc.save(
            output_path,
            garbage=4,
            deflate=True,
            deflate_images=True,
            deflate_fonts=True,
            clean=True
        )
    elif compression_level == "less":
        # Mild compression preserving highest image fidelity
        doc.save(
            output_path,
            garbage=3,
            deflate=True,
            clean=True
        )
    else:
        # "recommended"
        for page_idx in range(len(doc)):
            page = doc[page_idx]
            image_list = page.get_images(full=True)
            for img in image_list:
                xref = img[0]
                try:
                    base_image = doc.extract_image(xref)
                    image_bytes = base_image["image"]
                    pil_img = Image.open(io.BytesIO(image_bytes))
                    if pil_img.width > 1800 or pil_img.height > 1800:
                        pil_img.thumbnail((1500, 1500), Image.Resampling.LANCZOS)
                    out_io = io.BytesIO()
                    if pil_img.mode in ("RGBA", "P"):
                        pil_img = pil_img.convert("RGB")
                    pil_img.save(out_io, format="JPEG", quality=75, optimize=True)
                    new_bytes = out_io.getvalue()
                    if len(new_bytes) < len(image_bytes):
                        doc.update_stream(xref, new_bytes)
                except Exception:
                    continue
                    
        doc.save(
            output_path,
            garbage=4,
            deflate=True,
            deflate_images=True,
            deflate_fonts=True,
            clean=True
        )
        
    doc.close()
    
    new_size = os.path.getsize(output_path)
    percent = 0.0
    if orig_size > 0:
        percent = max(0.0, round(((orig_size - new_size) / orig_size) * 100, 1))
        
    return {
        "original_size": orig_size,
        "compressed_size": new_size,
        "savings_percent": percent,
        "output_path": output_path
    }

def repair_pdf(file_path: Path, output_path: Path) -> Dict[str, Any]:
    """Repairs corrupted/damaged PDF using MuPDF XREF rebuilder and Ghostscript fallback."""
    success = False
    details = ""
    
    # Attempt 1: PyMuPDF opening in repair mode
    try:
        doc = pymupdf.open(file_path)
        # Resave rebuilding all internal tables and streams
        doc.save(output_path, garbage=4, clean=True, deflate=True)
        doc.close()
        if output_path.exists() and os.path.getsize(output_path) > 0:
            success = True
            details = "Repaired PDF cross-reference table and re-indexed streams with PyMuPDF."
    except Exception as e:
        details = f"MuPDF repair step: {str(e)}"
        
    # Attempt 2: Ghostscript repair filter if Attempt 1 failed or file is 0 bytes
    if not success or not output_path.exists() or os.path.getsize(output_path) == 0:
        gs_binary = shutil.which("gs") or "/opt/homebrew/bin/gs"
        if os.path.exists(gs_binary):
            cmd = [
                gs_binary,
                "-o", str(output_path),
                "-sDEVICE=pdfwrite",
                "-dPDFSETTINGS=/default",
                "-dNOPAUSE",
                "-dBATCH",
                str(file_path)
            ]
            res = subprocess.run(cmd, capture_output=True, text=True)
            if output_path.exists() and os.path.getsize(output_path) > 0:
                success = True
                details = "Repaired PDF structure and reconstructed xref using Ghostscript engine."
            else:
                raise RuntimeError(f"Could not repair PDF: {res.stderr or details}")
        else:
            raise RuntimeError(f"Could not repair PDF: {details}")
            
    return {
        "success": success,
        "details": details,
        "file_size": os.path.getsize(output_path)
    }

def ocr_pdf(file_path: Path, language: str = "eng", output_path: Path = None) -> Dict[str, Any]:
    """Performs genuine OCR on a PDF and produces a searchable text PDF."""
    doc = pymupdf.open(file_path)
    total_pages = len(doc)
    
    ocr_doc = pymupdf.open()
    
    for page_idx in range(total_pages):
        page = doc[page_idx]
        # Render page to high-res image (200 DPI) for accurate character recognition
        pix = page.get_pixmap(dpi=200)
        img_bytes = pix.tobytes("png")
        pil_img = Image.open(io.BytesIO(img_bytes))
        
        # Run Tesseract to generate searchable PDF bytes
        page_pdf_bytes = pytesseract.image_to_pdf_or_hocr(pil_img, extension='pdf', lang=language)
        page_pdf_doc = pymupdf.open("pdf", page_pdf_bytes)
        ocr_doc.insert_pdf(page_pdf_doc)
        page_pdf_doc.close()
        
    doc.close()
    
    ocr_doc.save(output_path, garbage=3, deflate=True)
    ocr_doc.close()
    
    return {
        "success": True,
        "pages_processed": total_pages,
        "language": language,
        "output_path": output_path
    }

