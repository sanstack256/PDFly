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

def int_to_hex_color(int_col: int) -> str:
    r = (int_col >> 16) & 255
    g = (int_col >> 8) & 255
    b = int_col & 255
    return f"#{r:02x}{g:02x}{b:02x}"

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

def extract_pdf_content(file_path: Path, max_pages: int = 50) -> Dict[str, Any]:
    """
    Extracts text blocks/spans, embedded images, and page structure from an uploaded PDF.
    Generates clean background thumbnails with text redacted so the editable text on canvas
    is interactive without duplicate rasterized text underneath.
    Supports OCR for scanned documents with no native selectable text.
    """
    doc = pymupdf.open(file_path)
    pages_data = []
    text_elements = []
    image_elements = []
    has_scanned_ocr = False

    total_pages = min(len(doc), max_pages)

    for p_no in range(total_pages):
        page = doc[p_no]
        rect = page.rect
        p_width = float(rect.width)
        p_height = float(rect.height)
        p_rot = int(page.rotation)

        d = page.get_text("dict")
        page_text_spans = []

        for b_idx, b in enumerate(d.get("blocks", [])):
            if "lines" in b:
                for l_idx, l in enumerate(b.get("lines", [])):
                    spans = l.get("spans", [])
                    line_text = "".join(s.get("text", "") for s in spans).strip()
                    if not line_text:
                        continue

                    first_span = spans[0] if spans else {}
                    font_size = float(first_span.get("size", 14.0))
                    raw_font = first_span.get("font", "Helvetica").lower()
                    flags = first_span.get("flags", 0)
                    is_bold = bool(flags & 16 or "bold" in raw_font)
                    is_italic = bool(flags & 2 or "italic" in raw_font or "oblique" in raw_font)

                    fam = "Helvetica"
                    if "times" in raw_font or "serif" in raw_font:
                        fam = "Times-Roman"
                    elif "courier" in raw_font or "mono" in raw_font:
                        fam = "Courier"
                    elif "georgia" in raw_font:
                        fam = "Georgia"

                    color_hex = int_to_hex_color(first_span.get("color", 0))
                    bbox = l.get("bbox", [50, 50, 150, 80])

                    elem_id = f"txt-p{p_no + 1}-b{b_idx}-l{l_idx}"
                    span_dict = {
                        "id": elem_id,
                        "type": "text",
                        "page": p_no + 1,
                        "text": line_text,
                        "originalText": line_text,
                        "originalBbox": [float(c) for c in bbox],
                        "x": round(float(bbox[0]), 1),
                        "y": round(float(bbox[1]), 1),
                        "width": max(40.0, round(float(bbox[2] - bbox[0]), 1)),
                        "height": max(20.0, round(float(bbox[3] - bbox[1]), 1)),
                        "fontSize": round(font_size, 1),
                        "fontFamily": fam,
                        "bold": is_bold,
                        "italic": is_italic,
                        "underline": False,
                        "strike": False,
                        "color": color_hex,
                        "align": "left",
                        "lineHeight": 1.3,
                        "letterSpacing": 0,
                        "zIndex": len(text_elements) + 1,
                        "isExisting": True,
                    }
                    page_text_spans.append(span_dict)
                    text_elements.append(span_dict)

        # Scanned page check: if text is empty, try OCR
        if len(page_text_spans) == 0:
            try:
                import pytesseract
                pix = page.get_pixmap(dpi=150)
                img = Image.open(io.BytesIO(pix.tobytes("png")))
                ocr_data = pytesseract.image_to_data(img, output_type=pytesseract.Output.DICT)
                scale_x = p_width / pix.width
                scale_y = p_height / pix.height

                lines_map = {}
                n_boxes = len(ocr_data['text'])
                for i in range(n_boxes):
                    word = ocr_data['text'][i].strip()
                    if not word:
                        continue
                    line_num = (ocr_data['block_num'][i], ocr_data['line_num'][i])
                    if line_num not in lines_map:
                        lines_map[line_num] = []
                    lines_map[line_num].append({
                        "text": word,
                        "x": ocr_data['left'][i] * scale_x,
                        "y": ocr_data['top'][i] * scale_y,
                        "w": ocr_data['width'][i] * scale_x,
                        "h": ocr_data['height'][i] * scale_y,
                    })

                for l_key, words in lines_map.items():
                    line_str = " ".join(w["text"] for w in words)
                    x0 = min(w["x"] for w in words)
                    y0 = min(w["y"] for w in words)
                    x1 = max(w["x"] + w["w"] for w in words)
                    y1 = max(w["y"] + w["h"] for w in words)
                    h = y1 - y0

                    elem_id = f"ocr-p{p_no + 1}-b{l_key[0]}-l{l_key[1]}"
                    ocr_elem = {
                        "id": elem_id,
                        "type": "text",
                        "page": p_no + 1,
                        "text": line_str,
                        "originalText": line_str,
                        "originalBbox": [float(x0), float(y0), float(x1), float(y1)],
                        "x": round(float(x0), 1),
                        "y": round(float(y0), 1),
                        "width": max(40.0, round(float(x1 - x0), 1)),
                        "height": max(20.0, round(float(h), 1)),
                        "fontSize": max(10.0, round(float(h) * 0.8, 1)),
                        "fontFamily": "Helvetica",
                        "bold": False,
                        "italic": False,
                        "underline": False,
                        "strike": False,
                        "color": "#000000",
                        "align": "left",
                        "lineHeight": 1.3,
                        "letterSpacing": 0,
                        "zIndex": len(text_elements) + 1,
                        "isExisting": True,
                        "isOcr": True,
                    }
                    page_text_spans.append(ocr_elem)
                    text_elements.append(ocr_elem)
                    has_scanned_ocr = True
            except Exception:
                pass

        # Extract images on page
        try:
            img_list = page.get_images()
            for img_idx, img_info in enumerate(img_list):
                xref = img_info[0]
                rects = page.get_image_rects(xref)
                if not rects:
                    continue
                extracted = doc.extract_image(xref)
                img_bytes = extracted.get("image")
                img_ext = extracted.get("ext", "png")
                b64_data = f"data:image/{img_ext};base64,{base64.b64encode(img_bytes).decode('ascii')}"

                for r_idx, r in enumerate(rects):
                    # Skip full-page background images if OCR was done
                    if (
                        len(page_text_spans) > 0
                        and r.width >= p_width * 0.95
                        and r.height >= p_height * 0.95
                        and any(e.get("isOcr") for e in page_text_spans)
                    ):
                        continue

                    img_elem = {
                        "id": f"img-p{p_no + 1}-{xref}-{r_idx}",
                        "type": "image",
                        "page": p_no + 1,
                        "src": b64_data,
                        "x": round(float(r.x0), 1),
                        "y": round(float(r.y0), 1),
                        "width": max(30.0, round(float(r.width), 1)),
                        "height": max(30.0, round(float(r.height), 1)),
                        "originalBbox": [float(r.x0), float(r.y0), float(r.x1), float(r.y1)],
                        "originalRatio": (r.width / r.height) if r.height > 0 else 1.0,
                        "lockAspectRatio": True,
                        "rotation": 0,
                        "opacity": 1.0,
                        "zIndex": len(image_elements) + 1,
                        "isExisting": True,
                    }
                    image_elements.append(img_elem)
        except Exception:
            pass

        # Generate clean background thumbnail (redacting text to prevent double rendering)
        clean_doc = pymupdf.open(file_path)
        clean_page = clean_doc[p_no]
        for s in page_text_spans:
            if s.get("originalBbox"):
                clean_page.add_redact_annot(pymupdf.Rect(s["originalBbox"]), fill=(1, 1, 1))
        clean_page.apply_redactions()
        pix = clean_page.get_pixmap(dpi=72)
        bg_b64 = f"data:image/png;base64,{base64.b64encode(pix.tobytes('png')).decode('ascii')}"
        clean_doc.close()

        pages_data.append({
            "id": f"page-{p_no + 1}",
            "pageNumber": p_no + 1,
            "sourceIndex": p_no + 1,
            "width": p_width,
            "height": p_height,
            "rotation": p_rot,
            "backgroundColor": "#ffffff",
            "thumbnail": bg_b64,
            "border": {"enabled": False, "thickness": 2, "color": "#000000", "style": "solid", "margin": 20},
        })

    doc.close()

    return {
        "pages": pages_data,
        "text_elements": text_elements,
        "image_elements": image_elements,
        "has_scanned_ocr": has_scanned_ocr,
        "total_pages": len(pages_data),
    }

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
    - Genuinely replaces modified existing text and images by redacting their original locations.
    - Renders text boxes with wrapping, fonts, styling, colors, and alignments.
    - Renders images with position, dimensions, rotation, and opacity.
    """
    if original_pdf_path and original_pdf_path.exists():
        src_doc = pymupdf.open(original_pdf_path)
    else:
        src_doc = pymupdf.open()
        src_doc.new_page(width=PAGE_SIZES["A4"][0], height=PAGE_SIZES["A4"][1])

    out_doc = pymupdf.open()
    src_total = len(src_doc)
    raw_pages = editor_state.get("pages", [])

    is_explicit_sequence = bool(raw_pages and all("sourceIndex" in p for p in raw_pages))

    if is_explicit_sequence:
        page_configs = raw_pages
    else:
        page_configs = []
        for i in range(src_total):
            override = next((p for p in raw_pages if p.get("page") == i + 1 or p.get("sourceIndex") == i + 1), {})
            page_configs.append({
                "sourceIndex": i + 1,
                "rotation": override.get("rotation", override.get("angle", 0)),
                "backgroundColor": override.get("backgroundColor"),
                "border": override.get("border"),
                "width": src_doc[i].rect.width,
                "height": src_doc[i].rect.height,
            })
        for p in raw_pages:
            if p.get("sourceIndex") is None and p.get("isNew"):
                page_configs.append(p)

    # Build destination pages according to page_configs
    for idx, p_cfg in enumerate(page_configs):
        src_idx = p_cfg.get("sourceIndex")
        width = float(p_cfg.get("width", PAGE_SIZES.get(p_cfg.get("size", "A4"), PAGE_SIZES["A4"])[0]))
        height = float(p_cfg.get("height", PAGE_SIZES.get(p_cfg.get("size", "A4"), PAGE_SIZES["A4"])[1]))

        if src_idx is not None and 1 <= src_idx <= len(src_doc):
            out_doc.insert_pdf(src_doc, from_page=src_idx - 1, to_page=src_idx - 1)
            target_page = out_doc[-1]
        else:
            target_page = out_doc.new_page(width=width, height=height)

        rot = int(p_cfg.get("rotation", 0))
        if rot != 0:
            target_page.set_rotation((target_page.rotation + rot) % 360)

        bg_color = hex_to_rgb(p_cfg.get("backgroundColor"))
        if bg_color and bg_color != (1.0, 1.0, 1.0):
            target_page.draw_rect(target_page.rect, color=None, fill=bg_color, overlay=False)

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

    # 0. REDACTION OF MODIFIED OR DELETED EXISTING CONTENT (Items 1, 2)
    # Redact any existing text elements that were modified or moved
    text_elements = editor_state.get("textElements", [])
    for text_item in text_elements:
        if text_item.get("isExisting") and text_item.get("originalBbox"):
            orig_t = text_item.get("originalText", "")
            cur_t = text_item.get("text", "")
            orig_bbox = text_item.get("originalBbox")
            cur_x = float(text_item.get("x", 0))
            cur_y = float(text_item.get("y", 0))

            # If text was edited, deleted, or moved, redact the original text completely
            if cur_t != orig_t or abs(cur_x - orig_bbox[0]) > 2 or abs(cur_y - orig_bbox[1]) > 2:
                p_idx = int(text_item.get("page", 1)) - 1
                if 0 <= p_idx < total_out_pages:
                    r = pymupdf.Rect(orig_bbox[0] - 0.5, orig_bbox[1] - 0.5, orig_bbox[2] + 0.5, orig_bbox[3] + 0.5)
                    out_doc[p_idx].add_redact_annot(r, fill=(1, 1, 1))

    # Redact any explicitly deleted elements
    deleted_orig_bboxes = editor_state.get("deletedOriginalBboxes", [])
    for del_item in deleted_orig_bboxes:
        p_idx = int(del_item.get("page", 1)) - 1
        bbox = del_item.get("bbox")
        if bbox and 0 <= p_idx < total_out_pages:
            r = pymupdf.Rect(bbox[0] - 0.5, bbox[1] - 0.5, bbox[2] + 0.5, bbox[3] + 0.5)
            out_doc[p_idx].add_redact_annot(r, fill=(1, 1, 1))

    # Apply redactions
    for p in out_doc:
        p.apply_redactions(images=pymupdf.PDF_REDACT_IMAGE_REMOVE)

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

        # If existing image was untouched, no need to re-insert (it's already in the page)
        if img_item.get("isExisting") and img_item.get("originalBbox"):
            orig_bbox = img_item.get("originalBbox")
            cur_x = float(img_item.get("x", 0))
            cur_y = float(img_item.get("y", 0))
            cur_w = float(img_item.get("width", 0))
            cur_h = float(img_item.get("height", 0))
            cur_rot = int(img_item.get("rotation", 0))
            if (
                abs(cur_x - orig_bbox[0]) <= 2
                and abs(cur_y - orig_bbox[1]) <= 2
                and abs(cur_w - (orig_bbox[2] - orig_bbox[0])) <= 2
                and abs(cur_h - (orig_bbox[3] - orig_bbox[1])) <= 2
                and cur_rot == 0
                and not img_item.get("crop")
            ):
                continue

        x = float(img_item.get("x", 50))
        y = float(img_item.get("y", 50))
        w = float(img_item.get("width", 150))
        h = float(img_item.get("height", 150))
        rect = pymupdf.Rect(x, y, x + w, y + h)

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
                            int((cy + ch) * im_h),
                        )
                        pil_img = pil_img.crop(box)
                    if rotation != 0:
                        pil_img = pil_img.rotate(-rotation, expand=True)
                    buf = io.BytesIO()
                    pil_img.save(buf, format="PNG")
                    img_bytes = buf.getvalue()
                except Exception:
                    pass

            page.insert_image(rect, stream=img_bytes, keep_proportion=False, overlay=True)

    # 3. Render Text Elements
    for text_item in text_elements:
        page_num = int(text_item.get("page", 1)) - 1
        if not (0 <= page_num < total_out_pages):
            continue
        page = out_doc[page_num]

        raw_text = text_item.get("text", "")
        if not raw_text or not raw_text.strip():
            continue

        # If existing text was not edited or moved, skip re-insertion (preserves original vector fonts)
        if text_item.get("isExisting") and text_item.get("originalBbox"):
            orig_t = text_item.get("originalText", "")
            orig_bbox = text_item.get("originalBbox")
            cur_x = float(text_item.get("x", 0))
            cur_y = float(text_item.get("y", 0))
            if raw_text == orig_t and abs(cur_x - orig_bbox[0]) <= 2 and abs(cur_y - orig_bbox[1]) <= 2:
                continue

        x = float(text_item.get("x", 50))
        y = float(text_item.get("y", 50))
        w = max(40.0, float(text_item.get("width", 200)))
        font_size = float(text_item.get("fontSize", 14))
        h = max(font_size * 1.5, float(text_item.get("height", 40)))

        font_family = text_item.get("fontFamily", "Helvetica")
        bold = bool(text_item.get("bold", False))
        italic = bool(text_item.get("italic", False))
        underline = bool(text_item.get("underline", False))
        strike = bool(text_item.get("strike", False))

        color = hex_to_rgb(text_item.get("color", "#000000")) or (0.0, 0.0, 0.0)
        highlight = hex_to_rgb(text_item.get("highlight"))
        align_code = get_alignment_code(text_item.get("align", "left"))
        fontname = get_font_name(font_family, bold=bold, italic=italic)

        # Generous rect to prevent text clipping
        rect = pymupdf.Rect(x, y, x + w + 50, y + h + (font_size * 1.5))

        if highlight:
            page.draw_rect(pymupdf.Rect(x, y, x + w, y + h), color=None, fill=highlight, overlay=True)

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
            expanded_rect = pymupdf.Rect(x, y, x + w + 100, y + h + abs(rc) + (font_size * 3))
            page.insert_textbox(
                expanded_rect,
                final_text,
                fontsize=font_size,
                fontname=fontname,
                color=color,
                align=align_code,
                overlay=True
            )

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
