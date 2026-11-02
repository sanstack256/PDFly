import os
import sys
import json
import io
from pathlib import Path
import pytest
from fastapi.testclient import TestClient
from PIL import Image, ImageDraw
import pymupdf
import docx
import pptx
import openpyxl

# Set paths
sys.path.insert(0, str(Path(__file__).parent.parent))
from main import app

client = TestClient(app)

TMP_DIR = Path("/tmp/pdfly_test_files")
TMP_DIR.mkdir(parents=True, exist_ok=True)

def create_sample_pdf(filename: str, page_count: int = 3, text_prefix: str = "Page") -> Path:
    path = TMP_DIR / filename
    doc = pymupdf.open()
    for i in range(page_count):
        page = doc.new_page(width=612, height=792)
        page.insert_text((72, 72), f"{text_prefix} {i + 1}", fontsize=20)
        page.insert_text((72, 120), f"This is sample content on page {i + 1} of {page_count}.", fontsize=12)
    doc.save(path)
    doc.close()
    return path

def create_sample_image(filename: str, text: str = "Test Image") -> Path:
    path = TMP_DIR / filename
    img = Image.new("RGB", (400, 200), color=(240, 240, 250))
    d = ImageDraw.Draw(img)
    d.text((40, 90), text, fill=(20, 20, 20))
    img.save(path)
    return path

# ----------------- 1. ORGANIZE PDF TESTS -----------------

def test_merge_pdf():
    pdf1 = create_sample_pdf("merge1.pdf", 2, "Doc 1 Page")
    pdf2 = create_sample_pdf("merge2.pdf", 3, "Doc 2 Page")
    with open(pdf1, "rb") as f1, open(pdf2, "rb") as f2:
        response = client.post(
            "/api/organize/merge",
            files=[
                ("files", ("merge1.pdf", f1, "application/pdf")),
                ("files", ("merge2.pdf", f2, "application/pdf"))
            ]
        )
    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True
    assert data["file_size"] > 0
    
    # Download and verify page count
    dl = client.get(data["download_url"])
    assert dl.status_code == 200
    res_doc = pymupdf.open("pdf", dl.content)
    assert len(res_doc) == 5
    res_doc.close()

def test_split_pdf_ranges():
    pdf = create_sample_pdf("split_test.pdf", 5, "Split Page")
    with open(pdf, "rb") as f:
        response = client.post(
            "/api/organize/split",
            files={"file": ("split_test.pdf", f, "application/pdf")},
            data={"split_mode": "ranges", "ranges": "1-2, 4"}
        )
    assert response.status_code == 200
    data = response.json()
    dl = client.get(data["download_url"])
    assert dl.status_code == 200
    res_doc = pymupdf.open("pdf", dl.content)
    assert len(res_doc) == 3
    res_doc.close()

def test_split_pdf_all():
    pdf = create_sample_pdf("split_all.pdf", 3, "Page")
    with open(pdf, "rb") as f:
        response = client.post(
            "/api/organize/split",
            files={"file": ("split_all.pdf", f, "application/pdf")},
            data={"split_mode": "all"}
        )
    assert response.status_code == 200
    data = response.json()
    assert data["filename"].endswith(".zip")
    dl = client.get(data["download_url"])
    assert dl.status_code == 200
    assert len(dl.content) > 0

def test_remove_pages():
    pdf = create_sample_pdf("remove_test.pdf", 4, "Remove Page")
    with open(pdf, "rb") as f:
        response = client.post(
            "/api/organize/remove-pages",
            files={"file": ("remove_test.pdf", f, "application/pdf")},
            data={"pages": "2, 4"}
        )
    assert response.status_code == 200
    data = response.json()
    dl = client.get(data["download_url"])
    res_doc = pymupdf.open("pdf", dl.content)
    assert len(res_doc) == 2
    # Verify remaining page texts are Page 1 and Page 3
    assert "Page 1" in res_doc[0].get_text()
    assert "Page 3" in res_doc[1].get_text()
    res_doc.close()

def test_extract_pages():
    pdf = create_sample_pdf("extract_test.pdf", 5, "Extract Page")
    with open(pdf, "rb") as f:
        response = client.post(
            "/api/organize/extract-pages",
            files={"file": ("extract_test.pdf", f, "application/pdf")},
            data={"pages": "1, 3, 5", "as_zip": False}
        )
    assert response.status_code == 200
    data = response.json()
    dl = client.get(data["download_url"])
    res_doc = pymupdf.open("pdf", dl.content)
    assert len(res_doc) == 3
    assert "Page 1" in res_doc[0].get_text()
    assert "Page 3" in res_doc[1].get_text()
    assert "Page 5" in res_doc[2].get_text()
    res_doc.close()

def test_organize_pages():
    pdf = create_sample_pdf("org_test.pdf", 3, "Original Page")
    with open(pdf, "rb") as f:
        response = client.post(
            "/api/organize/organize-pages",
            files={"file": ("org_test.pdf", f, "application/pdf")},
            data={"page_order": json.dumps([3, 1, 2]), "rotations": json.dumps({"3": 90})}
        )
    assert response.status_code == 200
    data = response.json()
    dl = client.get(data["download_url"])
    res_doc = pymupdf.open("pdf", dl.content)
    assert len(res_doc) == 3
    assert "Original Page 3" in res_doc[0].get_text()
    assert res_doc[0].rotation == 90
    assert "Original Page 1" in res_doc[1].get_text()
    res_doc.close()

def test_rotate_pdf():
    pdf = create_sample_pdf("rot_test.pdf", 2, "Rotate")
    with open(pdf, "rb") as f:
        response = client.post(
            "/api/organize/rotate",
            files={"file": ("rot_test.pdf", f, "application/pdf")},
            data={"angle": 180, "pages": "1"}
        )
    assert response.status_code == 200
    data = response.json()
    dl = client.get(data["download_url"])
    res_doc = pymupdf.open("pdf", dl.content)
    assert res_doc[0].rotation == 180
    assert res_doc[1].rotation == 0
    res_doc.close()

def test_add_page_numbers():
    pdf = create_sample_pdf("num_test.pdf", 3, "Num Page")
    with open(pdf, "rb") as f:
        response = client.post(
            "/api/organize/page-numbers",
            files={"file": ("num_test.pdf", f, "application/pdf")},
            data={"position": "bottom-right", "format_type": "page_of_total", "font_size": 10.0}
        )
    assert response.status_code == 200
    data = response.json()
    dl = client.get(data["download_url"])
    res_doc = pymupdf.open("pdf", dl.content)
    assert "Page 1 of 3" in res_doc[0].get_text()
    assert "Page 3 of 3" in res_doc[2].get_text()
    res_doc.close()

def test_add_watermark():
    pdf = create_sample_pdf("wm_test.pdf", 2, "WM Page")
    with open(pdf, "rb") as f:
        response = client.post(
            "/api/organize/watermark",
            files={"file": ("wm_test.pdf", f, "application/pdf")},
            data={"watermark_type": "text", "text": "PDFLY_CONFIDENTIAL", "rotation": 45.0, "color": "#FF0000"}
        )
    assert response.status_code == 200
    data = response.json()
    dl = client.get(data["download_url"])
    res_doc = pymupdf.open("pdf", dl.content)
    assert "PDFLY_CONFIDENTIAL" in res_doc[0].get_text()
    res_doc.close()

# ----------------- 2. OPTIMIZE PDF TESTS -----------------

def test_compress_pdf():
    # Create PDF with embedded uncompressed image
    img_path = create_sample_image("comp_img.png", "Large High Resolution Image")
    pdf = TMP_DIR / "to_compress.pdf"
    doc = pymupdf.open()
    for _ in range(3):
        p = doc.new_page(width=612, height=792)
        p.insert_image(pymupdf.Rect(50, 50, 550, 400), filename=str(img_path))
    doc.save(pdf)
    doc.close()

    with open(pdf, "rb") as f:
        response = client.post(
            "/api/optimize/compress",
            files={"file": ("to_compress.pdf", f, "application/pdf")},
            data={"compression_level": "extreme"}
        )
    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True
    assert data["file_size"] > 0
    assert data["original_size"] > 0

def test_repair_pdf():
    pdf = create_sample_pdf("good.pdf", 2, "Repairable")
    # Simulate a corrupted trailer / damaged xref
    corrupted_path = TMP_DIR / "corrupted.pdf"
    with open(pdf, "rb") as f:
        content = bytearray(f.read())
    # corrupt bytes near the end
    content[-15:] = b"%%PDF-CORRUPT!!"
    with open(corrupted_path, "wb") as f:
        f.write(content)

    with open(corrupted_path, "rb") as f:
        response = client.post(
            "/api/optimize/repair",
            files={"file": ("corrupted.pdf", f, "application/pdf")}
        )
    assert response.status_code == 200
    data = response.json()
    dl = client.get(data["download_url"])
    assert dl.status_code == 200
    res_doc = pymupdf.open("pdf", dl.content)
    assert len(res_doc) == 2
    res_doc.close()

def test_ocr_pdf():
    # Create image of text and put in PDF
    img_path = create_sample_image("scanned.png", "RECOGNIZE_THIS_TEXT_123")
    pdf = TMP_DIR / "scanned.pdf"
    doc = pymupdf.open()
    p = doc.new_page(width=400, height=200)
    p.insert_image(pymupdf.Rect(0, 0, 400, 200), filename=str(img_path))
    doc.save(pdf)
    doc.close()

    with open(pdf, "rb") as f:
        response = client.post(
            "/api/optimize/ocr",
            files={"file": ("scanned.pdf", f, "application/pdf")},
            data={"language": "eng"}
        )
    assert response.status_code == 200
    data = response.json()
    assert data["pages_processed"] == 1
    dl = client.get(data["download_url"])
    res_doc = pymupdf.open("pdf", dl.content)
    extracted = res_doc[0].get_text()
    assert "RECOGNIZE" in extracted or "123" in extracted or len(extracted.strip()) > 0
    res_doc.close()

# ----------------- 3. CONVERT TO PDF TESTS -----------------

def test_jpg_to_pdf():
    img1 = create_sample_image("img1.jpg", "Photo 1")
    img2 = create_sample_image("img2.jpg", "Photo 2")
    with open(img1, "rb") as f1, open(img2, "rb") as f2:
        response = client.post(
            "/api/convert/jpg-to-pdf",
            files=[
                ("files", ("img1.jpg", f1, "image/jpeg")),
                ("files", ("img2.jpg", f2, "image/jpeg"))
            ],
            data={"page_size": "A4", "orientation": "portrait", "margin": 10.0}
        )
    assert response.status_code == 200
    data = response.json()
    dl = client.get(data["download_url"])
    res_doc = pymupdf.open("pdf", dl.content)
    assert len(res_doc) == 2
    res_doc.close()

def test_word_to_pdf():
    docx_path = TMP_DIR / "sample.docx"
    doc = docx.Document()
    doc.add_heading("Genuine Word Document", 0)
    doc.add_paragraph("Testing Word to PDF conversion in PDFly.")
    doc.save(docx_path)

    with open(docx_path, "rb") as f:
        response = client.post(
            "/api/convert/word-to-pdf",
            files={"file": ("sample.docx", f, "application/vnd.openxmlformats-officedocument.wordprocessingml.document")}
        )
    assert response.status_code == 200
    data = response.json()
    dl = client.get(data["download_url"])
    res_doc = pymupdf.open("pdf", dl.content)
    assert len(res_doc) >= 1
    assert "Genuine Word Document" in res_doc[0].get_text()
    res_doc.close()

def test_pptx_to_pdf():
    pptx_path = TMP_DIR / "sample.pptx"
    prs = pptx.Presentation()
    slide = prs.slides.add_slide(prs.slide_layouts[0])
    slide.shapes.title.text = "Genuine PPTX Slide"
    slide.placeholders[1].text = "PowerPoint to PDF testing"
    prs.save(pptx_path)

    with open(pptx_path, "rb") as f:
        response = client.post(
            "/api/convert/pptx-to-pdf",
            files={"file": ("sample.pptx", f, "application/vnd.openxmlformats-officedocument.presentationml.presentation")}
        )
    assert response.status_code == 200
    data = response.json()
    dl = client.get(data["download_url"])
    res_doc = pymupdf.open("pdf", dl.content)
    assert len(res_doc) >= 1
    assert "Genuine PPTX" in res_doc[0].get_text()
    res_doc.close()

def test_excel_to_pdf():
    xlsx_path = TMP_DIR / "sample.xlsx"
    wb = openpyxl.Workbook()
    ws = wb.active
    ws["A1"] = "Item Code"
    ws["B1"] = "Product Description"
    ws["A2"] = "X100"
    ws["B2"] = "PDFly Engine Converter"
    wb.save(xlsx_path)

    with open(xlsx_path, "rb") as f:
        response = client.post(
            "/api/convert/excel-to-pdf",
            files={"file": ("sample.xlsx", f, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")}
        )
    assert response.status_code == 200
    data = response.json()
    dl = client.get(data["download_url"])
    res_doc = pymupdf.open("pdf", dl.content)
    assert len(res_doc) >= 1
    assert "PDFly Engine" in res_doc[0].get_text()
    res_doc.close()

def test_html_to_pdf():
    html_path = TMP_DIR / "sample.html"
    with open(html_path, "w") as f:
        f.write("<html><body><h1>PDFly HTML to PDF</h1><p>Genuine conversion test.</p></body></html>")

    with open(html_path, "rb") as f:
        response = client.post(
            "/api/convert/html-to-pdf",
            files={"file": ("sample.html", f, "text/html")}
        )
    assert response.status_code == 200
    data = response.json()
    dl = client.get(data["download_url"])
    res_doc = pymupdf.open("pdf", dl.content)
    assert len(res_doc) >= 1
    assert "PDFly HTML" in res_doc[0].get_text()
    res_doc.close()

# ----------------- 4. CONVERT FROM PDF TESTS -----------------

def test_pdf_to_jpg():
    pdf = create_sample_pdf("to_jpg.pdf", 2, "Image Page")
    with open(pdf, "rb") as f:
        response = client.post(
            "/api/convert/pdf-to-jpg",
            files={"file": ("to_jpg.pdf", f, "application/pdf")},
            data={"dpi": 150}
        )
    assert response.status_code == 200
    data = response.json()
    assert data["filename"].endswith(".zip")
    dl = client.get(data["download_url"])
    assert dl.status_code == 200
    assert len(dl.content) > 0

def test_pdf_to_word():
    pdf = create_sample_pdf("to_word.pdf", 2, "Docx Flow Page")
    with open(pdf, "rb") as f:
        response = client.post(
            "/api/convert/pdf-to-word",
            files={"file": ("to_word.pdf", f, "application/pdf")}
        )
    assert response.status_code == 200
    data = response.json()
    assert data["filename"].endswith(".docx")
    dl = client.get(data["download_url"])
    assert len(dl.content) > 0
    # verify it's a valid docx
    docx_file = io.BytesIO(dl.content)
    loaded_doc = docx.Document(docx_file)
    text = " ".join(p.text for p in loaded_doc.paragraphs)
    assert "Docx Flow" in text

def test_pdf_to_pptx():
    pdf = create_sample_pdf("to_pptx.pdf", 2, "Presentation Page")
    with open(pdf, "rb") as f:
        response = client.post(
            "/api/convert/pdf-to-pptx",
            files={"file": ("to_pptx.pdf", f, "application/pdf")}
        )
    assert response.status_code == 200
    data = response.json()
    assert data["filename"].endswith(".pptx")
    dl = client.get(data["download_url"])
    prs = pptx.Presentation(io.BytesIO(dl.content))
    assert len(prs.slides) == 2

def test_pdf_to_excel():
    # PDF with table
    pdf = TMP_DIR / "to_excel.pdf"
    doc = pymupdf.open()
    p = doc.new_page(width=612, height=792)
    p.draw_rect(pymupdf.Rect(50, 50, 500, 200), color=(0, 0, 0), width=1)
    p.draw_line(pymupdf.Point(50, 100), pymupdf.Point(500, 100), color=(0, 0, 0))
    p.draw_line(pymupdf.Point(200, 50), pymupdf.Point(200, 200), color=(0, 0, 0))
    p.insert_text((60, 85), "Header A", fontsize=12)
    p.insert_text((220, 85), "Header B", fontsize=12)
    p.insert_text((60, 140), "Data 1", fontsize=11)
    p.insert_text((220, 140), "Data 2", fontsize=11)
    doc.save(pdf)
    doc.close()

    with open(pdf, "rb") as f:
        response = client.post(
            "/api/convert/pdf-to-excel",
            files={"file": ("to_excel.pdf", f, "application/pdf")}
        )
    assert response.status_code == 200
    data = response.json()
    assert data["filename"].endswith(".xlsx")
    dl = client.get(data["download_url"])
    wb = openpyxl.load_workbook(io.BytesIO(dl.content))
    assert len(wb.sheetnames) >= 1

def test_pdf_to_pdfa():
    pdf = create_sample_pdf("to_pdfa.pdf", 2, "Archival Page")
    with open(pdf, "rb") as f:
        response = client.post(
            "/api/convert/pdf-to-pdfa",
            files={"file": ("to_pdfa.pdf", f, "application/pdf")},
            data={"version": "2"}
        )
    assert response.status_code == 200
    data = response.json()
    dl = client.get(data["download_url"])
    res_doc = pymupdf.open("pdf", dl.content)
    assert len(res_doc) == 2
    res_doc.close()

# ----------------- 5. EDIT PDF TESTS -----------------

def test_edit_pdf():
    pdf = create_sample_pdf("to_edit.pdf", 2, "Edit Page")
    edits = [
        {"type": "text", "page": 1, "text": "Added Text Through Editor", "x": 100, "y": 200, "fontSize": 16, "color": "#0000FF"},
        {"type": "shape", "shape_type": "rect", "page": 1, "x0": 50, "y0": 250, "x1": 200, "y1": 300, "strokeColor": "#FF0000", "strokeWidth": 2.0},
        {"type": "annotation", "annot_type": "highlight", "page": 1, "x0": 70, "y0": 70, "x1": 200, "y1": 95, "color": "#FFFF00"},
        {"type": "rotate", "page": 2, "angle": 90}
    ]
    with open(pdf, "rb") as f:
        response = client.post(
            "/api/edit/apply-edits",
            files={"file": ("to_edit.pdf", f, "application/pdf")},
            data={"edits": json.dumps(edits)}
        )
    assert response.status_code == 200
    data = response.json()
    dl = client.get(data["download_url"])
    res_doc = pymupdf.open("pdf", dl.content)
    assert "Added Text Through Editor" in res_doc[0].get_text()
    assert res_doc[1].rotation == 90
    res_doc.close()

# ----------------- 6. SECURITY TESTS -----------------

def test_protect_and_unlock_pdf():
    pdf = create_sample_pdf("security_test.pdf", 2, "Secret Content")
    
    # 1. Protect
    with open(pdf, "rb") as f:
        p_res = client.post(
            "/api/security/protect",
            files={"file": ("security_test.pdf", f, "application/pdf")},
            data={"password": "MySuperSecretPassword123!"}
        )
    assert p_res.status_code == 200
    p_data = p_res.json()
    dl = client.get(p_data["download_url"])
    protected_bytes = dl.content

    # Verify protected PDF is encrypted
    prot_doc = pymupdf.open("pdf", protected_bytes)
    assert prot_doc.is_encrypted is True
    assert prot_doc.authenticate("WrongPassword") == 0
    assert prot_doc.authenticate("MySuperSecretPassword123!") > 0
    prot_doc.close()

    # 2. Unlock with wrong password -> should fail
    bad_unlock = client.post(
        "/api/security/unlock",
        files={"file": ("protected.pdf", io.BytesIO(protected_bytes), "application/pdf")},
        data={"password": "IncorrectPassword"}
    )
    assert bad_unlock.status_code == 400

    # 3. Unlock with correct password -> should succeed
    good_unlock = client.post(
        "/api/security/unlock",
        files={"file": ("protected.pdf", io.BytesIO(protected_bytes), "application/pdf")},
        data={"password": "MySuperSecretPassword123!"}
    )
    assert good_unlock.status_code == 200
    u_data = good_unlock.json()
    unlocked_dl = client.get(u_data["download_url"])
    unlocked_doc = pymupdf.open("pdf", unlocked_dl.content)
    assert unlocked_doc.is_encrypted is False
    assert "Secret Content" in unlocked_doc[0].get_text()
    unlocked_doc.close()

def test_sign_pdf():
    pdf = create_sample_pdf("to_sign.pdf", 2, "Contract Page")
    sig_img = create_sample_image("sig.png", "John Doe Signature")
    with open(pdf, "rb") as f_pdf, open(sig_img, "rb") as f_sig:
        response = client.post(
            "/api/security/sign",
            files={
                "file": ("to_sign.pdf", f_pdf, "application/pdf"),
                "signature_image": ("sig.png", f_sig, "image/png")
            },
            data={"page": 1, "x": 100, "y": 400, "width": 150, "height": 60}
        )
    assert response.status_code == 200
    data = response.json()
    dl = client.get(data["download_url"])
    res_doc = pymupdf.open("pdf", dl.content)
    # verify page has an image now
    assert len(res_doc[0].get_images()) >= 1
    res_doc.close()

def test_redact_pdf():
    # PDF with sensitive social security number / secret
    pdf = TMP_DIR / "to_redact.pdf"
    doc = pymupdf.open()
    p = doc.new_page(width=612, height=792)
    p.insert_text((72, 100), "Confidential Secret: SSN 999-99-9999 is private.", fontsize=14)
    doc.save(pdf)
    doc.close()

    # Redact coordinates covering the SSN
    redactions = [
        {"page": 1, "x0": 200, "y0": 85, "x1": 350, "y1": 115, "fillColor": "#000000"}
    ]
    with open(pdf, "rb") as f:
        response = client.post(
            "/api/security/redact",
            files={"file": ("to_redact.pdf", f, "application/pdf")},
            data={"redactions": json.dumps(redactions)}
        )
    assert response.status_code == 200
    data = response.json()
    dl = client.get(data["download_url"])
    res_doc = pymupdf.open("pdf", dl.content)
    text_after = res_doc[0].get_text()
    # The SSN must be completely gone!
    assert "999-99-9999" not in text_after
    res_doc.close()

# ----------------- 7. PREVIEW & THUMBNAILS TESTS -----------------

def test_preview_info_and_thumbnails():
    pdf = create_sample_pdf("preview_test.pdf", 3, "Thumbnail Page")
    with open(pdf, "rb") as f:
        info_res = client.post(
            "/api/preview/info",
            files={"file": ("preview_test.pdf", f, "application/pdf")}
        )
    assert info_res.status_code == 200
    info_data = info_res.json()
    assert info_data["page_count"] == 3
    assert len(info_data["pages"]) == 3

    with open(pdf, "rb") as f:
        thumb_res = client.post(
            "/api/preview/thumbnails",
            files={"file": ("preview_test.pdf", f, "application/pdf")},
            data={"max_pages": 3, "dpi": 50}
        )
    assert thumb_res.status_code == 200
    thumb_data = thumb_res.json()
    assert len(thumb_data["thumbnails"]) == 3
    assert thumb_data["thumbnails"][0]["thumbnail_data"].startswith("data:image/jpeg;base64,")

