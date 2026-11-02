import os
import base64
from pathlib import Path
from typing import List, Dict, Any, Optional
import pymupdf

def hex_to_rgb(hex_str: str) -> tuple:
    hex_clean = hex_str.lstrip("#")
    if len(hex_clean) == 6:
        return tuple(int(hex_clean[i:i+2], 16) / 255.0 for i in (0, 2, 4))
    return (0.0, 0.0, 0.0)

def protect_pdf(file_path: Path, password: str, output_path: Path, owner_password: Optional[str] = None) -> Path:
    """Protects PDF with AES-256 password encryption."""
    if not password:
        raise ValueError("Password cannot be empty.")
        
    doc = pymupdf.open(file_path)
    owner_pw = owner_password or password
    
    # Save with AES-256 standard encryption
    doc.save(
        output_path,
        encryption=pymupdf.PDF_ENCRYPT_AES_256,
        user_pw=password,
        owner_pw=owner_pw,
        permissions=pymupdf.PDF_PERM_PRINT | pymupdf.PDF_PERM_COPY
    )
    doc.close()
    return output_path

def unlock_pdf(file_path: Path, password: str, output_path: Path) -> Path:
    """Removes password protection from an encrypted PDF."""
    doc = pymupdf.open(file_path)
    
    if doc.is_encrypted:
        # Authenticate with provided password
        rc = doc.authenticate(password)
        if rc == 0:
            doc.close()
            raise ValueError("Incorrect password provided for encrypted document.")
            
    # Resave without encryption
    doc.save(output_path, encryption=pymupdf.PDF_ENCRYPT_NONE, garbage=3, deflate=True)
    doc.close()
    return output_path

def sign_pdf(
    file_path: Path,
    signature_image_path: Path,
    page_num: int,
    x: float,
    y: float,
    width: float,
    height: float,
    output_path: Path
) -> Path:
    """Stamps a drawn or uploaded visual signature image onto the document at specific coordinates."""
    doc = pymupdf.open(file_path)
    total_pages = len(doc)
    
    target_page_idx = page_num - 1
    if not (0 <= target_page_idx < total_pages):
        target_page_idx = total_pages - 1 # default to last page if out of bounds
        
    page = doc[target_page_idx]
    rect = pymupdf.Rect(x, y, x + width, y + height)
    page.insert_image(rect, filename=str(signature_image_path), keep_proportion=True, overlay=True)
    
    doc.save(output_path, garbage=3, deflate=True)
    doc.close()
    return output_path

def redact_pdf(
    file_path: Path,
    redactions: List[Dict[str, Any]],
    output_path: Path
) -> Path:
    """
    Applies genuine, irreversible PDF redaction.
    Redaction permanently sanitizes underlying text, vectors, and image pixels.
    """
    doc = pymupdf.open(file_path)
    total_pages = len(doc)
    
    # Group redaction rectangles by page
    pages_to_redact = set()
    for item in redactions:
        p_num = int(item.get("page", 1)) - 1
        if 0 <= p_num < total_pages:
            page = doc[p_num]
            x0 = float(item.get("x0", 0))
            y0 = float(item.get("y0", 0))
            x1 = float(item.get("x1", 100))
            y1 = float(item.get("y1", 100))
            fill_hex = item.get("fillColor", "#000000")
            fill_rgb = hex_to_rgb(fill_hex)
            
            rect = pymupdf.Rect(x0, y0, x1, y1)
            page.add_redact_annot(rect, fill=fill_rgb)
            pages_to_redact.add(p_num)
            
    # Apply redactions to permanently remove underlying content
    for p_num in pages_to_redact:
        doc[p_num].apply_redactions(images=pymupdf.PDF_REDACT_IMAGE_PIXELS)
        
    doc.save(output_path, garbage=4, clean=True, deflate=True)
    doc.close()
    return output_path
