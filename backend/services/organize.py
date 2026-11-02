import os
import zipfile
from pathlib import Path
from typing import List, Optional, Dict
import pymupdf

def merge_pdfs(file_paths: List[Path], output_path: Path) -> Path:
    if not file_paths:
        raise ValueError("No files provided for merging.")
    
    merged_doc = pymupdf.open()
    for p in file_paths:
        doc = pymupdf.open(p)
        merged_doc.insert_pdf(doc)
        doc.close()
    
    merged_doc.save(output_path, garbage=3, deflate=True)
    merged_doc.close()
    return output_path

def parse_page_ranges(range_str: str, total_pages: int) -> List[int]:
    """Parses range strings like '1-3, 5, 7-9' into 1-based page numbers."""
    pages = set()
    parts = [p.strip() for p in range_str.split(",") if p.strip()]
    for part in parts:
        if "-" in part:
            sub = part.split("-")
            start = int(sub[0])
            end = int(sub[1])
            for i in range(max(1, start), min(total_pages, end) + 1):
                pages.add(i)
        else:
            val = int(part)
            if 1 <= val <= total_pages:
                pages.add(val)
    return sorted(list(pages))

def split_pdf(
    file_path: Path,
    output_dir: Path,
    split_mode: str = "ranges",
    ranges_str: Optional[str] = None
) -> Path:
    doc = pymupdf.open(file_path)
    total_pages = len(doc)
    
    if total_pages == 0:
        doc.close()
        raise ValueError("PDF has 0 pages.")
        
    created_files: List[Path] = []

    if split_mode == "all":
        # Extract every single page into its own PDF
        for i in range(total_pages):
            out_doc = pymupdf.open()
            out_doc.insert_pdf(doc, from_page=i, to_page=i)
            out_file = output_dir / f"page_{i + 1}.pdf"
            out_doc.save(out_file)
            out_doc.close()
            created_files.append(out_file)
    else:
        # Range-based split
        if not ranges_str:
            ranges_str = f"1-{total_pages}"
        
        range_groups = [r.strip() for r in ranges_str.split(";") if r.strip()]
        if len(range_groups) <= 1:
            # Single range or comma-separated ranges into one output
            pages = parse_page_ranges(ranges_str, total_pages)
            if not pages:
                raise ValueError("Invalid page ranges specified.")
            out_doc = pymupdf.open()
            for p in pages:
                out_doc.insert_pdf(doc, from_page=p - 1, to_page=p - 1)
            out_file = output_dir / "split_output.pdf"
            out_doc.save(out_file)
            out_doc.close()
            doc.close()
            return out_file
        else:
            # Multiple groups separated by semicolon: each group becomes a separate PDF
            for idx, group in enumerate(range_groups):
                pages = parse_page_ranges(group, total_pages)
                if pages:
                    out_doc = pymupdf.open()
                    for p in pages:
                        out_doc.insert_pdf(doc, from_page=p - 1, to_page=p - 1)
                    out_file = output_dir / f"split_part_{idx + 1}.pdf"
                    out_doc.save(out_file)
                    out_doc.close()
                    created_files.append(out_file)
    
    doc.close()

    # If multiple files were generated, package into a zip archive
    if len(created_files) == 1:
        return created_files[0]
    
    zip_path = output_dir / "split_pages.zip"
    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
        for f in created_files:
            zf.write(f, arcname=f.name)
    return zip_path

def remove_pages(file_path: Path, pages_to_remove: List[int], output_path: Path) -> Path:
    doc = pymupdf.open(file_path)
    total_pages = len(doc)
    
    # 1-indexed to 0-indexed, deduplicated
    to_delete = sorted(list(set(p - 1 for p in pages_to_remove if 1 <= p <= total_pages)), reverse=True)
    if len(to_delete) >= total_pages:
        doc.close()
        raise ValueError("Cannot remove all pages from document.")
    
    for p in to_delete:
        doc.delete_page(p)
        
    doc.save(output_path, garbage=3, deflate=True)
    doc.close()
    return output_path

def extract_pages(file_path: Path, pages_to_extract: List[int], output_path: Path, as_zip: bool = False) -> Path:
    doc = pymupdf.open(file_path)
    total_pages = len(doc)
    
    valid_pages = [p for p in pages_to_extract if 1 <= p <= total_pages]
    if not valid_pages:
        doc.close()
        raise ValueError("No valid pages selected for extraction.")
        
    if as_zip and len(valid_pages) > 1:
        zip_path = output_path.with_suffix(".zip")
        with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
            for p in valid_pages:
                single_doc = pymupdf.open()
                single_doc.insert_pdf(doc, from_page=p - 1, to_page=p - 1)
                temp_p = output_path.parent / f"extracted_page_{p}.pdf"
                single_doc.save(temp_p)
                single_doc.close()
                zf.write(temp_p, arcname=f"page_{p}.pdf")
                if temp_p.exists():
                    temp_p.unlink()
        doc.close()
        return zip_path
    else:
        out_doc = pymupdf.open()
        for p in valid_pages:
            out_doc.insert_pdf(doc, from_page=p - 1, to_page=p - 1)
        out_doc.save(output_path, garbage=3, deflate=True)
        out_doc.close()
        doc.close()
        return output_path

def organize_pages(
    file_path: Path,
    page_order: List[int],
    rotations: Optional[Dict[str, int]],
    output_path: Path
) -> Path:
    """
    page_order: list of 1-based page numbers in the desired sequence.
    rotations: optional dict like {"1": 90, "2": 180} of rotations per original page or position.
    """
    doc = pymupdf.open(file_path)
    total_pages = len(doc)
    
    out_doc = pymupdf.open()
    rotations = rotations or {}
    
    for idx, p in enumerate(page_order):
        if 1 <= p <= total_pages:
            out_doc.insert_pdf(doc, from_page=p - 1, to_page=p - 1)
            new_page = out_doc[-1]
            rot = rotations.get(str(p), rotations.get(str(idx + 1), 0))
            if rot:
                new_page.set_rotation((new_page.rotation + rot) % 360)
                
    out_doc.save(output_path, garbage=3, deflate=True)
    out_doc.close()
    doc.close()
    return output_path

def rotate_pdf(
    file_path: Path,
    rotation_angle: int,
    page_numbers: Optional[List[int]],
    output_path: Path
) -> Path:
    doc = pymupdf.open(file_path)
    total_pages = len(doc)
    
    pages = set(page_numbers) if page_numbers else set(range(1, total_pages + 1))
    for p in range(1, total_pages + 1):
        if p in pages:
            page = doc[p - 1]
            page.set_rotation((page.rotation + rotation_angle) % 360)
            
    doc.save(output_path, garbage=3, deflate=True)
    doc.close()
    return output_path

def add_page_numbers(
    file_path: Path,
    position: str = "bottom-center",
    format_type: str = "page_of_total",
    start_page: int = 1,
    font_size: float = 10.0,
    margin: float = 36.0,
    output_path: Path = None
) -> Path:
    doc = pymupdf.open(file_path)
    total_pages = len(doc)
    
    for idx, page in enumerate(doc):
        rect = page.rect
        curr_page = idx + start_page
        
        if format_type == "page_of_total":
            text = f"Page {curr_page} of {total_pages}"
        elif format_type == "page_only":
            text = f"{curr_page}"
        elif format_type == "dash":
            text = f"- {curr_page} -"
        else:
            text = f"{curr_page}"
            
        text_width = pymupdf.get_text_length(text, fontname="helv", fontsize=font_size)
        
        # Determine X position
        if "left" in position:
            x = margin
        elif "right" in position:
            x = rect.width - margin - text_width
        else: # center
            x = (rect.width - text_width) / 2
            
        # Determine Y position
        if "top" in position:
            y = margin + font_size
        else: # bottom
            y = rect.height - margin
            
        page.insert_text(
            pymupdf.Point(x, y),
            text,
            fontsize=font_size,
            fontname="helv",
            color=(0.2, 0.2, 0.2)
        )
        
    doc.save(output_path, garbage=3, deflate=True)
    doc.close()
    return output_path

def add_watermark(
    file_path: Path,
    watermark_type: str = "text",
    text: str = "CONFIDENTIAL",
    image_path: Optional[Path] = None,
    opacity: float = 0.3,
    rotation: float = 45.0,
    font_size: float = 48.0,
    color_hex: str = "#888888",
    position: str = "center",
    output_path: Path = None
) -> Path:
    doc = pymupdf.open(file_path)
    
    # parse hex color to RGB tuple (0.0 to 1.0)
    hex_clean = color_hex.lstrip("#")
    if len(hex_clean) == 6:
        r, g, b = tuple(int(hex_clean[i:i+2], 16) / 255.0 for i in (0, 2, 4))
    else:
        r, g, b = (0.5, 0.5, 0.5)
        
    for page in doc:
        rect = page.rect
        if watermark_type == "image" and image_path and image_path.exists():
            from PIL import Image as PILImage
            import io
            with PILImage.open(image_path) as pil_img:
                pil_img = pil_img.convert("RGBA")
                if opacity < 1.0:
                    r_ch, g_ch, b_ch, a_ch = pil_img.split()
                    a_ch = a_ch.point(lambda p: int(p * max(0.05, min(1.0, opacity))))
                    pil_img = PILImage.merge("RGBA", (r_ch, g_ch, b_ch, a_ch))
                if rotation != 0:
                    pil_img = pil_img.rotate(-rotation, expand=True, resample=PILImage.BICUBIC)
                
                buf = io.BytesIO()
                pil_img.save(buf, format="PNG")
                img_bytes = buf.getvalue()

            w = min(rect.width * 0.7, rect.height * 0.7)
            h = w * (pil_img.height / pil_img.width) if pil_img.width > 0 else w
            x0 = (rect.width - w) / 2
            y0 = (rect.height - h) / 2
            target_rect = pymupdf.Rect(x0, y0, x0 + w, y0 + h)
            page.insert_image(target_rect, stream=img_bytes, keep_proportion=True, overlay=True)
        else:
            # Text watermark with rotation angle
            text_len = pymupdf.get_text_length(text, fontname="helv", fontsize=font_size)
            pivot = pymupdf.Point(rect.width / 2 - text_len / 4, rect.height / 2)
            mat = pymupdf.Matrix(float(rotation))
            page.insert_text(
                pivot,
                text,
                fontsize=font_size,
                fontname="helv",
                color=(r, g, b),
                morph=(pivot, mat),
                overlay=True
            )
            
    doc.save(output_path, garbage=3, deflate=True)
    doc.close()
    return output_path
