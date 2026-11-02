import base64
from pathlib import Path
from typing import Dict, Any, List
import pymupdf

def get_pdf_info(file_path: Path) -> Dict[str, Any]:
    try:
        doc = pymupdf.open(file_path)
        is_encrypted = doc.is_encrypted
        if is_encrypted:
            return {
                "is_encrypted": True,
                "page_count": 0,
                "pages": []
            }
            
        page_count = len(doc)
        pages_info = []
        for i in range(page_count):
            p = doc[i]
            r = p.rect
            pages_info.append({
                "page_number": i + 1,
                "width": round(r.width, 2),
                "height": round(r.height, 2),
                "rotation": p.rotation
            })
            
        metadata = doc.metadata or {}
        doc.close()
        return {
            "is_encrypted": False,
            "page_count": page_count,
            "pages": pages_info,
            "title": metadata.get("title", ""),
            "author": metadata.get("author", "")
        }
    except Exception as e:
        return {
            "error": str(e),
            "is_encrypted": False,
            "page_count": 0,
            "pages": []
        }

def generate_page_thumbnails(
    file_path: Path,
    max_pages: int = 50,
    dpi: int = 72
) -> List[Dict[str, Any]]:
    """Generates base64 preview thumbnails for document pages."""
    doc = pymupdf.open(file_path)
    if doc.is_encrypted:
        doc.close()
        raise ValueError("Document is password protected.")
        
    thumbnails = []
    limit = min(len(doc), max_pages)
    for i in range(limit):
        page = doc[i]
        pix = page.get_pixmap(dpi=dpi)
        img_bytes = pix.tobytes("jpeg")
        b64_str = base64.b64encode(img_bytes).decode("utf-8")
        thumbnails.append({
            "page_number": i + 1,
            "width": pix.width,
            "height": pix.height,
            "rotation": page.rotation,
            "thumbnail_data": f"data:image/jpeg;base64,{b64_str}"
        })
        
    doc.close()
    return thumbnails
