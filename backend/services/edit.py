import os
from pathlib import Path
from typing import List, Dict, Any, Optional
import pymupdf

def hex_to_rgb(hex_str: str) -> tuple:
    hex_clean = hex_str.lstrip("#")
    if len(hex_clean) == 6:
        return tuple(int(hex_clean[i:i+2], 16) / 255.0 for i in (0, 2, 4))
    return (0.0, 0.0, 0.0)

def apply_pdf_edits(file_path: Path, edits: List[Dict[str, Any]], output_path: Path) -> Path:
    """
    Applies editing actions to a PDF document:
    - Add text
    - Add images
    - Add shapes (rect, circle, line)
    - Add annotations (highlight, underline, strikeout, note)
    - Rotate pages
    - Add page numbers
    - Add watermark
    """
    doc = pymupdf.open(file_path)
    total_pages = len(doc)
    
    for edit in edits:
        action = edit.get("type")
        page_num = int(edit.get("page", 1)) - 1
        
        # Check page bounds for page-specific actions
        if action not in ("page_numbers", "watermark") and not (0 <= page_num < total_pages):
            continue
            
        page = doc[page_num] if 0 <= page_num < total_pages else None
        
        if action == "text" and page:
            text = edit.get("text", "")
            x = float(edit.get("x", 50))
            y = float(edit.get("y", 50))
            font_size = float(edit.get("fontSize", 14))
            color = hex_to_rgb(edit.get("color", "#000000"))
            page.insert_text(
                pymupdf.Point(x, y),
                text,
                fontsize=font_size,
                fontname="helv",
                color=color,
                overlay=True
            )
            
        elif action == "image" and page:
            img_path = edit.get("image_path")
            if img_path and os.path.exists(img_path):
                x = float(edit.get("x", 50))
                y = float(edit.get("y", 50))
                w = float(edit.get("width", 100))
                h = float(edit.get("height", 100))
                rect = pymupdf.Rect(x, y, x + w, y + h)
                page.insert_image(rect, filename=img_path, overlay=True)
                
        elif action == "shape" and page:
            shape_type = edit.get("shape_type", "rect")
            x0 = float(edit.get("x0", 50))
            y0 = float(edit.get("y0", 50))
            x1 = float(edit.get("x1", 150))
            y1 = float(edit.get("y1", 150))
            stroke_color = hex_to_rgb(edit.get("strokeColor", "#000000"))
            stroke_width = float(edit.get("strokeWidth", 2.0))
            fill_color_str = edit.get("fillColor")
            fill_color = hex_to_rgb(fill_color_str) if fill_color_str and fill_color_str != "transparent" else None
            
            rect = pymupdf.Rect(x0, y0, x1, y1)
            
            if shape_type == "rect":
                page.draw_rect(rect, color=stroke_color, fill=fill_color, width=stroke_width, overlay=True)
            elif shape_type == "circle":
                page.draw_oval(rect, color=stroke_color, fill=fill_color, width=stroke_width, overlay=True)
            elif shape_type == "line":
                page.draw_line(pymupdf.Point(x0, y0), pymupdf.Point(x1, y1), color=stroke_color, width=stroke_width, overlay=True)
                
        elif action == "annotation" and page:
            annot_type = edit.get("annot_type", "highlight")
            x0 = float(edit.get("x0", 50))
            y0 = float(edit.get("y0", 50))
            x1 = float(edit.get("x1", 200))
            y1 = float(edit.get("y1", 70))
            rect = pymupdf.Rect(x0, y0, x1, y1)
            annot_color = hex_to_rgb(edit.get("color", "#FFFF00"))
            
            if annot_type == "highlight":
                annot = page.add_highlight_annot(rect)
                annot.set_colors(stroke=annot_color)
                annot.update()
            elif annot_type == "underline":
                annot = page.add_underline_annot(rect)
                annot.set_colors(stroke=annot_color)
                annot.update()
            elif annot_type == "strikeout":
                annot = page.add_strikeout_annot(rect)
                annot.set_colors(stroke=annot_color)
                annot.update()
            elif annot_type == "note":
                content = edit.get("content", "Note")
                annot = page.add_text_annot(pymupdf.Point(x0, y0), content)
                annot.set_colors(stroke=annot_color)
                annot.update()
                
        elif action == "rotate" and page:
            angle = int(edit.get("angle", 90))
            page.set_rotation((page.rotation + angle) % 360)
            
        elif action == "page_numbers":
            pos = edit.get("position", "bottom-center")
            font_size = float(edit.get("fontSize", 10))
            for idx, p in enumerate(doc):
                r = p.rect
                text = f"Page {idx + 1} of {total_pages}"
                t_w = pymupdf.get_text_length(text, fontname="helv", fontsize=font_size)
                x = (r.width - t_w) / 2 if "center" in pos else (r.width - 36 - t_w if "right" in pos else 36)
                y = 36 + font_size if "top" in pos else r.height - 36
                p.insert_text(pymupdf.Point(x, y), text, fontsize=font_size, fontname="helv", color=(0.2, 0.2, 0.2))
                
        elif action == "watermark":
            wm_text = edit.get("text", "WATERMARK")
            f_size = float(edit.get("fontSize", 42))
            wm_color = hex_to_rgb(edit.get("color", "#CCCCCC"))
            for p in doc:
                r = p.rect
                t_w = pymupdf.get_text_length(wm_text, fontname="helv", fontsize=f_size)
                pivot = pymupdf.Point(r.width / 2 - t_w / 4, r.height / 2)
                mat = pymupdf.Matrix(45.0)
                p.insert_text(
                    pivot,
                    wm_text,
                    fontsize=f_size,
                    fontname="helv",
                    color=wm_color,
                    morph=(pivot, mat),
                    overlay=True
                )
                
    doc.save(output_path, garbage=3, deflate=True)
    doc.close()
    return output_path
