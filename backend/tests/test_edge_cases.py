import os
import sys
import io
from pathlib import Path
import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).parent.parent))
from main import app

client = TestClient(app)

def test_empty_merge():
    response = client.post(
        "/api/organize/merge",
        files=[("files", ("empty1.pdf", io.BytesIO(b""), "application/pdf"))]
    )
    # At least 2 files required
    assert response.status_code == 400

def test_invalid_pdf_format():
    response = client.post(
        "/api/preview/info",
        files={"file": ("fake.pdf", io.BytesIO(b"NOT A REAL PDF FILE CONTENTS"), "application/pdf")}
    )
    assert response.status_code == 200
    data = response.json()
    assert "error" in data or data.get("page_count") == 0

def test_bad_password_unlock():
    # Pass arbitrary bytes as PDF
    response = client.post(
        "/api/security/unlock",
        files={"file": ("doc.pdf", io.BytesIO(b"%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF"), "application/pdf")},
        data={"password": "WrongPassword"}
    )
    # Handled cleanly without server crash
    assert response.status_code in (200, 400)

def test_invalid_remove_all_pages():
    import pymupdf
    doc = pymupdf.open()
    doc.new_page(width=100, height=100)
    buf = io.BytesIO(doc.write())
    doc.close()
    
    response = client.post(
        "/api/organize/remove-pages",
        files={"file": ("one_page.pdf", buf, "application/pdf")},
        data={"pages": "1"}
    )
    assert response.status_code == 400
    assert "Cannot remove all pages" in response.json()["detail"]
