import os
import sys
import json
import io
from pathlib import Path
import pytest
from fastapi.testclient import TestClient
from PIL import Image, ImageDraw
import pymupdf

sys.path.insert(0, str(Path(__file__).parent.parent))
from main import app

client = TestClient(app)

TMP_DIR = Path("/tmp/pdfly_test_editor")
TMP_DIR.mkdir(parents=True, exist_ok=True)

def create_base_pdf(filename: str = "base.pdf", pages: int = 2) -> Path:
    p = TMP_DIR / filename
    doc = pymupdf.open()
    for i in range(pages):
        page = doc.new_page(width=595.32, height=841.92) # A4
        page.insert_text((72, 72), f"Original Unaffected Text Page {i + 1}", fontsize=16)
        page.insert_text((72, 120), "This text must remain 100% vector and selectable without rasterization.", fontsize=11)
    doc.save(p)
    doc.close()
    return p

def create_test_image(filename: str = "stamp.png") -> Path:
    p = TMP_DIR / filename
    img = Image.new("RGBA", (200, 100), (255, 0, 0, 200))
    d = ImageDraw.Draw(img)
    d.text((20, 40), "STAMP", fill=(255, 255, 255, 255))
    img.save(p)
    return p

def test_editor_add_text_and_word_wrap():
    base = create_base_pdf("test_text.pdf", 1)
    
    editor_state = {
        "pages": [{"sourceIndex": 1, "rotation": 0, "size": "A4"}],
        "textElements": [
            {
                "id": "t1",
                "page": 1,
                "text": "First heading added in Word-style editor",
                "x": 72,
                "y": 180,
                "width": 300,
                "height": 40,
                "fontSize": 18,
                "fontFamily": "Times-Roman",
                "bold": True,
                "color": "#112233",
                "align": "left"
            },
            {
                "id": "t2",
                "page": 1,
                "text": "This is a paragraph with automatic word wrapping enabled. It tests that multi-line text stays within its designated bounding box correctly.",
                "x": 72,
                "y": 240,
                "width": 250,
                "height": 100,
                "fontSize": 12,
                "fontFamily": "Helvetica",
                "color": "#444444",
                "align": "justify"
            }
        ]
    }

    with open(base, "rb") as f:
        res = client.post(
            "/api/edit/export-pdf",
            files={"file": ("test_text.pdf", f, "application/pdf")},
            data={"editor_state": json.dumps(editor_state)}
        )
    assert res.status_code == 200
    data = res.json()
    assert data["success"] is True

    # Verify output PDF
    dl = client.get(data["download_url"])
    doc = pymupdf.open("pdf", dl.content)
    text = doc[0].get_text()
    
    # 1. Original text must remain intact (no rasterization)
    assert "Original Unaffected Text Page 1" in text
    # 2. Newly added text must be present and searchable
    assert "First heading added" in text
    assert "wrapping enabled" in text
    doc.close()

def test_editor_images_and_move_between_pages():
    base = create_base_pdf("test_img.pdf", 2)
    img_path = create_test_image("sample_stamp.png")

    with open(img_path, "rb") as img_file:
        img_bytes = img_file.read()
    b64_url = f"data:image/png;base64,{img_bytes.hex()}" # or base64

    import base64
    b64_data = f"data:image/png;base64,{base64.b64encode(img_bytes).decode('utf-8')}"

    # Move image specifically to page 2
    editor_state = {
        "pages": [
            {"sourceIndex": 1, "rotation": 0},
            {"sourceIndex": 2, "rotation": 0}
        ],
        "images": [
            {
                "id": "img1",
                "page": 2, # specifically targeted to page 2!
                "src": b64_data,
                "x": 100,
                "y": 300,
                "width": 150,
                "height": 75,
                "rotation": 90
            }
        ]
    }

    with open(base, "rb") as f:
        res = client.post(
            "/api/edit/export-pdf",
            files={"file": ("test_img.pdf", f, "application/pdf")},
            data={"editor_state": json.dumps(editor_state)}
        )
    assert res.status_code == 200
    dl = client.get(res.json()["download_url"])
    doc = pymupdf.open("pdf", dl.content)
    assert len(doc) == 2
    # Page 1 should NOT have the image
    assert len(doc[0].get_images()) == 0
    # Page 2 MUST have the placed image
    assert len(doc[1].get_images()) == 1
    # Surrounding text on page 2 remains intact
    assert "Original Unaffected Text Page 2" in doc[1].get_text()
    doc.close()

def test_editor_page_operations_add_duplicate_delete_reorder():
    base = create_base_pdf("test_pages.pdf", 3)
    
    # Operations:
    # 1. Reorder page 2 to first: sourceIndex 2
    # 2. Duplicate page 1: sourceIndex 1 twice
    # 3. Add brand new blank A4 page: isNew: True, sourceIndex: None
    # 4. Total pages = 4 (Page 3 deleted by omission)
    editor_state = {
        "pages": [
            {"sourceIndex": 2, "rotation": 0},
            {"sourceIndex": 1, "rotation": 90},
            {"sourceIndex": 1, "rotation": 0},
            {"sourceIndex": None, "isNew": True, "size": "A4", "width": 595.32, "height": 841.92, "rotation": 0}
        ]
    }

    with open(base, "rb") as f:
        res = client.post(
            "/api/edit/export-pdf",
            files={"file": ("test_pages.pdf", f, "application/pdf")},
            data={"editor_state": json.dumps(editor_state)}
        )
    assert res.status_code == 200
    dl = client.get(res.json()["download_url"])
    doc = pymupdf.open("pdf", dl.content)
    assert len(doc) == 4
    # First page is original page 2
    assert "Original Unaffected Text Page 2" in doc[0].get_text()
    # Second page is original page 1 with 90 deg rotation
    assert doc[1].rotation == 90
    assert "Original Unaffected Text Page 1" in doc[1].get_text()
    doc.close()

def test_editor_page_borders_and_background():
    base = create_base_pdf("test_borders.pdf", 1)
    editor_state = {
        "pages": [
            {
                "sourceIndex": 1,
                "backgroundColor": "#FFFDE7",
                "border": {
                    "enabled": True,
                    "thickness": 3.0,
                    "color": "#D32F2F",
                    "style": "dashed",
                    "margin": 25.0
                }
            }
        ]
    }
    with open(base, "rb") as f:
        res = client.post(
            "/api/edit/export-pdf",
            files={"file": ("test_borders.pdf", f, "application/pdf")},
            data={"editor_state": json.dumps(editor_state)}
        )
    assert res.status_code == 200
    dl = client.get(res.json()["download_url"])
    doc = pymupdf.open("pdf", dl.content)
    assert len(doc) == 1
    # Vector drawings (background + dashed border) must be present
    drawings = doc[0].get_drawings()
    assert len(drawings) >= 2
    doc.close()

def test_editor_create_blank_document():
    res = client.post(
        "/api/edit/create-blank",
        data={"size": "Letter", "orientation": "landscape"}
    )
    assert res.status_code == 200
    data = res.json()
    assert data["success"] is True
    assert data["width"] == 792.0
    assert data["height"] == 612.0
