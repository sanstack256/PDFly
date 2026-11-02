import os
import io
import base64
from pathlib import Path
from typing import List, Dict, Any, Optional
import pymupdf
from PIL import Image

PAGE_SIZES = {
    "A4": (595.32, 841.92),
    "A3": (841.92, 1190.55),
    "A5": (419.53, 595.32),
    "Letter": (612.0, 792.0),
    "Legal": (612.0, 1008.0),
}

def hex_to_rgb(hex_str: Optional[str]) -> Optional[tuple]:
    if not hex_str or hex_str == "transparent":
        return None
    hex_clean = hex_str.lstrip("#")
    if len(hex_clean) == 6:
        return tuple(int(hex_clean[i:i+2], 16) / 255.0 for i in (0, 2, 4))
    if len(hex_clean) == 3:
        return tuple(int(c * 2, 16) / 255.0 for c in hex_clean)
    return (0.0, 0.0, 0.0)

def get_font_name(family: str = "Helvetica", bold: bool = False, italic: bool = False) -> str:
    """Maps web/editor font family to standard PDF 14 base fonts in PyMuPDF."""
    fam = (family or "Helvetica").lower()
    if "times" in fam or "serif" in fam or "georgia" in fam:
        if bold and italic:
            return "tibi"
        elif bold:
            return "tibo"
        elif italic:
            return "tiit"
        return "tiro"
    elif "courier" in fam or "mono" in fam:
        if bold and italic:
            return "cobi"
        elif bold:
            return "cobo"
        elif italic:
            return "coit"
        return "cour"
    else: # Helvetica / Arial / Sans-serif
        if bold and italic:
            return "hebi"
        elif bold:
            return "hebo"
        elif italic:
            return "heit"
        return "helv"

def get_alignment_code(align_str: str = "left") -> int:
    a = (align_str or "left").lower()
    if a == "center":
        return pymupdf.TEXT_ALIGN_CENTER
    elif a == "right":
        return pymupdf.TEXT_ALIGN_RIGHT
    elif a == "justify":
        return pymupdf.TEXT_ALIGN_JUSTIFY
    return pymupdf.TEXT_ALIGN_LEFT

def export_editor_pdf(
    original_pdf_path: Optional[Path],
    editor_state: Dict[str, Any],
    image_files_map: Dict[str, Path],
    output_path: Path
) -> Path:
    """
    Exports the editor document state into a vector-preserved, standards-compliant PDF:
    - Preserves all original pages, vectors, fonts, images.
    - Handles page operations (add, delete, duplicate, reorder, rotate).
    - Applies page backgrounds and customizable borders.
    - Renders text boxes with wrapping, fonts, styling, colors, and alignments.
    - Renders images with position, dimensions, rotation, and opacity.
    """
    if original_pdf_path and original_pdf_path.exists():
        src_doc = pymupdf.open(original_pdf_path)
    else:
        src_doc = pymupdf.open()
        # Create default page if starting from scratch
        src_doc.new_page(width=PAGE_SIZES["A4"][0], height=PAGE_SIZES["A4"][1])

    out_doc = pymupdf.open()

    src_total = len(src_doc)
    raw_pages = editor_state.get("pages", [])
    
    # Check if raw_pages is an explicit full page sequence
    is_explicit_sequence = bool(raw_pages and all("sourceIndex" in p for p in raw_pages))

    if is_explicit_sequence:
        page_configs = raw_pages
    else:
        # Build full page list covering all original pages, merging any overrides
        page_configs = []
        for i in range(src_total):
            override = next((p for p in raw_pages if p.get("page") == i + 1 or p.get("sourceIndex") == i + 1), {})
            page_configs.append({
                "sourceIndex": i + 1,
                "rotation": override.get("rotation", override.get("angle", 0)),
                "backgroundColor": override.get("backgroundColor"),
                "border": override.get("border"),
                "width": src_doc[i].rect.width,
                "height": src_doc[i].rect.height
            })
        # Add any purely added pages (without sourceIndex or sourceIndex is None)
        for p in raw_pages:
            if p.get("sourceIndex") is None and p.get("isNew"):
                page_configs.append(p)

    # Build destination pages according to page_configs
    for idx, p_cfg in enumerate(page_configs):
        src_idx = p_cfg.get("sourceIndex") # 1-indexed, or None for newly added blank pages
        width = float(p_cfg.get("width", PAGE_SIZES.get(p_cfg.get("size", "A4"), PAGE_SIZES["A4"])[0]))
        height = float(p_cfg.get("height", PAGE_SIZES.get(p_cfg.get("size", "A4"), PAGE_SIZES["A4"])[1]))
        
        if src_idx is not None and 1 <= src_idx <= len(src_doc):
            out_doc.insert_pdf(src_doc, from_page=src_idx - 1, to_page=src_idx - 1)
            target_page = out_doc[-1]
        else:
            # New blank page
            target_page = out_doc.new_page(width=width, height=height)

        # Apply page rotation
        rot = int(p_cfg.get("rotation", 0))
        if rot != 0:
            target_page.set_rotation((target_page.rotation + rot) % 360)

        # Apply page background color if set
        bg_color = hex_to_rgb(p_cfg.get("backgroundColor"))
        if bg_color and bg_color != (1.0, 1.0, 1.0):
            target_page.draw_rect(target_page.rect, color=None, fill=bg_color, overlay=False)

        # Apply page borders if configured
        border = p_cfg.get("border")
        if border and border.get("enabled", False):
            thickness = float(border.get("thickness", 2.0))
            b_color = hex_to_rgb(border.get("color", "#000000")) or (0.0, 0.0, 0.0)
            margin = float(border.get("margin", 20.0))
            style = border.get("style", "solid")
            
            p_rect = target_page.rect
            border_rect = pymupdf.Rect(
                margin,
                margin,
                p_rect.width - margin,
                p_rect.height - margin
            )
            dashes = None
            if style == "dashed":
                dashes = "[6 4] 0"
            elif style == "dotted":
                dashes = "[2 2] 0"
                
            target_page.draw_rect(border_rect, color=b_color, width=thickness, dashes=dashes, overlay=True)

    src_doc.close()

    total_out_pages = len(out_doc)

    # 1. Render Shapes
    shapes = editor_state.get("shapes", [])
    for shape in shapes:
        page_num = int(shape.get("page", 1)) - 1
        if not (0 <= page_num < total_out_pages):
            continue
        page = out_doc[page_num]
        
        stype = shape.get("type", "rect")
        x0 = float(shape.get("x", 50))
        y0 = float(shape.get("y", 50))
        w = float(shape.get("width", 100))
        h = float(shape.get("height", 100))
        x1, y1 = x0 + w, y0 + h
        rect = pymupdf.Rect(x0, y0, x1, y1)
        
        stroke = hex_to_rgb(shape.get("strokeColor", "#000000"))
        fill = hex_to_rgb(shape.get("fillColor"))
        width = float(shape.get("strokeWidth", 1.5))
        
        if stype == "circle":
            page.draw_oval(rect, color=stroke, fill=fill, width=width, overlay=True)
        elif stype == "line":
            page.draw_line(pymupdf.Point(x0, y0), pymupdf.Point(x1, y1), color=stroke, width=width, overlay=True)
        else: # rect
            page.draw_rect(rect, color=stroke, fill=fill, width=width, overlay=True)

    # 2. Render Images
    images = editor_state.get("images", [])
    for img_item in images:
        page_num = int(img_item.get("page", 1)) - 1
        if not (0 <= page_num < total_out_pages):
            continue
        page = out_doc[page_num]
        
        x = float(img_item.get("x", 50))
        y = float(img_item.get("y", 50))
        w = float(img_item.get("width", 150))
        h = float(img_item.get("height", 150))
        rect = pymupdf.Rect(x, y, x + w, y + h)
        
        # Check source: either in image_files_map or data URL
        img_id = img_item.get("id")
        img_data = img_item.get("src")
        img_file_path = image_files_map.get(img_id) or image_files_map.get(img_item.get("name", ""))
        
        img_bytes = None
        if img_file_path and img_file_path.exists():
            with open(img_file_path, "rb") as f:
                img_bytes = f.read()
        elif img_data and img_data.startswith("data:"):
            try:
                header, b64 = img_data.split(",", 1)
                img_bytes = base64.b64decode(b64)
            except Exception:
                pass
                
        if img_bytes:
            # Handle crop or rotation if needed
            crop = img_item.get("crop")
            rotation = int(img_item.get("rotation", 0)) % 360
            if crop or rotation != 0:
                try:
                    pil_img = Image.open(io.BytesIO(img_bytes))
                    if crop:
                        cx = max(0.0, float(crop.get("x", 0)))
                        cy = max(0.0, float(crop.get("y", 0)))
                        cw = min(1.0 - cx, float(crop.get("width", 1)))
                        ch = min(1.0 - cy, float(crop.get("height", 1)))
                        im_w, im_h = pil_img.size
                        box = (
                            int(cx * im_w),
                            int(cy * im_h),
                            int((cx + cw) * im_w),
                            int((cy + ch) * im_h)
                        )
                        pil_img = pil_img.crop(box)
                    if rotation != 0:
                        # PIL rotate is counter-clockwise, so negative for clockwise
                        pil_img = pil_img.rotate(-rotation, expand=True)
                    buf = io.BytesIO()
                    pil_img.save(buf, format="PNG")
                    img_bytes = buf.getvalue()
                except Exception:
                    pass
                    
            page.insert_image(rect, stream=img_bytes, keep_proportion=False, overlay=True)

    # 3. Render Text Elements (Word-like text wrapping, formatting)
    text_elements = editor_state.get("textElements", [])
    for text_item in text_elements:
        page_num = int(text_item.get("page", 1)) - 1
        if not (0 <= page_num < total_out_pages):
            continue
        page = out_doc[page_num]
        
        raw_text = text_item.get("text", "")
        if not raw_text:
            continue
            
        x = float(text_item.get("x", 50))
        y = float(text_item.get("y", 50))
        w = max(40.0, float(text_item.get("width", 200)))
        h = max(20.0, float(text_item.get("height", 60)))
        
        font_family = text_item.get("fontFamily", "Helvetica")
        font_size = float(text_item.get("fontSize", 14))
        bold = bool(text_item.get("bold", False))
        italic = bool(text_item.get("italic", False))
        underline = bool(text_item.get("underline", False))
        strike = bool(text_item.get("strike", False))
        
        color = hex_to_rgb(text_item.get("color", "#000000")) or (0.0, 0.0, 0.0)
        highlight = hex_to_rgb(text_item.get("highlight"))
        align_code = get_alignment_code(text_item.get("align", "left"))
        
        fontname = get_font_name(font_family, bold=bold, italic=italic)
        rect = pymupdf.Rect(x, y, x + w, y + h)
        
        # Render highlight background if requested
        if highlight:
            page.draw_rect(rect, color=None, fill=highlight, overlay=True)

        # Format lists if bullet or numbered
        list_type = text_item.get("listType")
        processed_lines = []
        for l_idx, line in enumerate(raw_text.splitlines()):
            if list_type == "bullet" and not line.startswith("• "):
                processed_lines.append(f"• {line}")
            elif list_type == "numbered" and not (line and line[0].isdigit() and "." in line[:4]):
                processed_lines.append(f"{l_idx + 1}. {line}")
            else:
                processed_lines.append(line)
        final_text = "\n".join(processed_lines)
        
        # Insert text box with genuine word wrapping
        rc = page.insert_textbox(
            rect,
            final_text,
            fontsize=font_size,
            fontname=fontname,
            color=color,
            align=align_code,
            overlay=True
        )
        if rc < 0:
            # If initial box height was too tight, expand height downwards to ensure full text is rendered
            expanded_rect = pymupdf.Rect(x, y, x + w, y + h + abs(rc) + (font_size * 2))
            page.insert_textbox(
                expanded_rect,
                final_text,
                fontsize=font_size,
                fontname=fontname,
                color=color,
                align=align_code,
                overlay=True
            )
        
        # Render underline / strikethrough decorations
        if underline or strike:
            line_y = y + font_size + 2 if underline else y + (font_size / 2)
            page.draw_line(
                pymupdf.Point(x, min(line_y, y + h)),
                pymupdf.Point(min(x + w, x + (len(final_text) * font_size * 0.5)), min(line_y, y + h)),
                color=color,
                width=1.0,
                overlay=True
            )

    out_doc.save(output_path, garbage=3, deflate=True)
    out_doc.close()
    return output_path
