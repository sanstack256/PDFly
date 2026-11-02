import os
import shutil
import subprocess
import zipfile
from pathlib import Path
from typing import List, Optional, Dict, Any
import pymupdf
from PIL import Image
import openpyxl
import pptx
from pdf2docx import Converter
import pdfplumber

SOFFICE_BIN = shutil.which("soffice") or "/opt/homebrew/bin/soffice"
GS_BIN = shutil.which("gs") or "/opt/homebrew/bin/gs"

def jpg_to_pdf(
    image_paths: List[Path],
    output_path: Path,
    page_size: str = "A4",
    orientation: str = "auto",
    margin: float = 0.0
) -> Path:
    """Converts one or multiple images into a combined PDF."""
    if not image_paths:
        raise ValueError("No images provided.")
        
    doc = pymupdf.open()
    
    # Standard dimensions (points: 72 points per inch)
    sizes = {
        "A4": (595.32, 841.92),
        "Letter": (612.0, 792.0),
        "Fit": None
    }
    target_dim = sizes.get(page_size, sizes["A4"])
    
    for img_path in image_paths:
        with Image.open(img_path) as pil_img:
            img_w, img_h = pil_img.size
            
        if target_dim is None: # Fit image dimensions exactly
            page_w, page_h = float(img_w), float(img_h)
            page = doc.new_page(width=page_w, height=page_h)
            rect = pymupdf.Rect(0, 0, page_w, page_h)
            page.insert_image(rect, filename=str(img_path))
        else:
            base_w, base_h = target_dim
            if orientation == "landscape" or (orientation == "auto" and img_w > img_h):
                page_w, page_h = max(base_w, base_h), min(base_w, base_h)
            else:
                page_w, page_h = min(base_w, base_h), max(base_w, base_h)
                
            page = doc.new_page(width=page_w, height=page_h)
            # Center image with margin
            avail_w = page_w - (2 * margin)
            avail_h = page_h - (2 * margin)
            
            # calculate scaled dimensions maintaining aspect ratio
            ratio = min(avail_w / img_w, avail_h / img_h)
            scaled_w = img_w * ratio
            scaled_h = img_h * ratio
            
            x0 = margin + (avail_w - scaled_w) / 2
            y0 = margin + (avail_h - scaled_h) / 2
            rect = pymupdf.Rect(x0, y0, x0 + scaled_w, y0 + scaled_h)
            page.insert_image(rect, filename=str(img_path))
            
    doc.save(output_path, garbage=3, deflate=True)
    doc.close()
    return output_path

def office_to_pdf(input_path: Path, output_path: Path) -> Path:
    """Converts DOCX, PPTX, XLSX, HTML to PDF using isolated LibreOffice headless."""
    if not os.path.exists(SOFFICE_BIN):
        raise RuntimeError("LibreOffice binary (soffice) not found on system.")
        
    outdir = output_path.parent
    lo_profile = f"/tmp/pdfly_lo_{os.getpid()}"
    os.makedirs(lo_profile, exist_ok=True)
    
    cmd = [
        SOFFICE_BIN,
        f"-env:UserInstallation=file://{lo_profile}",
        "--headless",
        "--convert-to", "pdf",
        str(input_path),
        "--outdir", str(outdir)
    ]
    
    res = subprocess.run(cmd, capture_output=True, text=True, timeout=60)
    
    # LibreOffice outputs with same base name + .pdf
    lo_default_output = outdir / f"{input_path.stem}.pdf"
    if lo_default_output.exists() and lo_default_output != output_path:
        shutil.move(str(lo_default_output), str(output_path))
        
    if not output_path.exists() or os.path.getsize(output_path) == 0:
        raise RuntimeError(f"Office conversion failed: {res.stderr or res.stdout}")
        
    return output_path

def html_to_pdf(input_path: Path, output_path: Path) -> Path:
    """Converts HTML file to PDF via LibreOffice headless."""
    return office_to_pdf(input_path, output_path)

def pdf_to_jpg(file_path: Path, output_dir: Path, dpi: int = 200, as_zip: bool = True) -> Path:
    """Converts each page of PDF to a JPG image."""
    doc = pymupdf.open(file_path)
    total_pages = len(doc)
    if total_pages == 0:
        doc.close()
        raise ValueError("PDF has no pages.")
        
    generated_images: List[Path] = []
    
    for page_idx in range(total_pages):
        page = doc[page_idx]
        pix = page.get_pixmap(dpi=dpi)
        img_file = output_dir / f"page_{page_idx + 1}.jpg"
        pix.save(str(img_file))
        generated_images.append(img_file)
        
    doc.close()
    
    if len(generated_images) == 1 and not as_zip:
        return generated_images[0]
        
    zip_path = output_dir / "converted_pages.zip"
    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
        for img in generated_images:
            zf.write(img, arcname=img.name)
    return zip_path

def pdf_to_word(file_path: Path, output_path: Path) -> Path:
    """Converts PDF to genuine Word (.docx) document preserving styles & layout."""
    cv = Converter(str(file_path))
    try:
        cv.convert(str(output_path), start=0, end=None)
    finally:
        cv.close()
        
    if not output_path.exists() or os.path.getsize(output_path) == 0:
        raise RuntimeError("PDF to Word conversion failed to produce output file.")
    return output_path

def pdf_to_pptx(file_path: Path, output_path: Path) -> Path:
    """Converts PDF to genuine PowerPoint (.pptx) presentation slides."""
    doc = pymupdf.open(file_path)
    prs = pptx.Presentation()
    
    # Match presentation aspect ratio to first page
    first_page = doc[0]
    p_width = first_page.rect.width
    p_height = first_page.rect.height
    
    prs.slide_width = pptx.util.Inches(p_width / 72.0)
    prs.slide_height = pptx.util.Inches(p_height / 72.0)
    blank_layout = prs.slide_layouts[6]
    
    for page_idx in range(len(doc)):
        page = doc[page_idx]
        pix = page.get_pixmap(dpi=150)
        temp_img = output_path.parent / f"_temp_slide_{page_idx}.png"
        pix.save(str(temp_img))
        
        slide = prs.slides.add_slide(blank_layout)
        slide.shapes.add_picture(
            str(temp_img),
            0,
            0,
            width=prs.slide_width,
            height=prs.slide_height
        )
        if temp_img.exists():
            temp_img.unlink()
            
    doc.close()
    prs.save(str(output_path))
    return output_path

def pdf_to_excel(file_path: Path, output_path: Path) -> Path:
    """Extracts tables and structured data from PDF into an Excel (.xlsx) file."""
    wb = openpyxl.Workbook()
    # remove default sheet
    default_sheet = wb.active
    wb.remove(default_sheet)
    
    has_content = False
    with pdfplumber.open(str(file_path)) as pdf:
        for idx, page in enumerate(pdf.pages):
            sheet = wb.create_sheet(title=f"Page {idx + 1}")
            tables = page.extract_tables()
            if tables:
                for table in tables:
                    for row in table:
                        sheet.append([cell if cell is not None else "" for cell in row])
                    sheet.append([]) # space between tables
                has_content = True
            else:
                # Fallback to lines of text
                text = page.extract_text()
                if text:
                    for line in text.splitlines():
                        sheet.append([line])
                    has_content = True
                    
    if not has_content:
        # Create at least one sheet with message
        sheet = wb.create_sheet(title="Extracted Data")
        sheet.append(["No extractable tabular data found in document."])
        
    wb.save(str(output_path))
    return output_path

def pdf_to_pdfa(file_path: Path, output_path: Path, pdfa_level: str = "2") -> Path:
    """Converts PDF to ISO compliant PDF/A archival format using Ghostscript."""
    if not os.path.exists(GS_BIN):
        raise RuntimeError("Ghostscript binary (gs) not found on system.")
        
    cmd = [
        GS_BIN,
        f"-dPDFA={pdfa_level}",
        "-dBATCH",
        "-dNOPAUSE",
        "-dNOOUTERSAVE",
        "-sColorConversionStrategy=UseDeviceIndependentColor",
        "-sDEVICE=pdfwrite",
        "-dPDFACompatibilityPolicy=1",
        f"-sOutputFile={str(output_path)}",
        str(file_path)
    ]
    
    res = subprocess.run(cmd, capture_output=True, text=True)
    if not output_path.exists() or os.path.getsize(output_path) == 0:
        raise RuntimeError(f"PDF/A conversion failed: {res.stderr}")
    return output_path

