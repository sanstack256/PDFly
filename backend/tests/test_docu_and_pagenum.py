import os
import sys
import json
from pathlib import Path
import pytest
import pymupdf
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).parent.parent))
from main import app
from services.organize import add_page_numbers
from services.docu import extract_doc_content, generate_docu_manual, convert_documentation_to_pdf

client = TestClient(app)
TMP_DIR = Path("/tmp/pdfly_docu_tests")
TMP_DIR.mkdir(parents=True, exist_ok=True)

def test_add_page_numbers_bottom_right():
    base_pdf = TMP_DIR / "test_pg_num.pdf"
    doc = pymupdf.open()
    p = doc.new_page(width=595.32, height=841.92)
    doc.save(base_pdf)
    doc.close()

    out_pdf = TMP_DIR / "test_pg_num_out.pdf"
    add_page_numbers(base_pdf, position="bottom-right", format_type="page_of_total", output_path=out_pdf)

    doc_out = pymupdf.open(out_pdf)
    text = doc_out[0].get_text()
    blocks = doc_out[0].get_text("blocks")
    doc_out.close()

    assert "Page 1 of 1" in text
    # Verify placement is in the bottom-right quadrant: x > 300, y > 750
    b = next(b for b in blocks if "Page 1 of 1" in b[4])
    assert b[0] > 300, f"Expected x > 300 for bottom-right, got {b[0]}"
    assert b[1] > 750, f"Expected y > 750 for bottom-right, got {b[1]}"

def test_add_page_numbers_rotated_page():
    rot_pdf = TMP_DIR / "test_rot_page.pdf"
    doc = pymupdf.open()
    p = doc.new_page(width=595.32, height=841.92)
    p.set_rotation(90)
    doc.save(rot_pdf)
    doc.close()

    out_pdf = TMP_DIR / "test_rot_out.pdf"
    add_page_numbers(rot_pdf, position="bottom-right", output_path=out_pdf)

    doc_out = pymupdf.open(out_pdf)
    text = doc_out[0].get_text()
    doc_out.close()
    assert "Page 1 of 1" in text

def test_docu_extract_and_generate_manual():
    sample_html = """
    <!DOCTYPE html>
    <html>
    <head><title>Antigravity SDK Documentation</title></head>
    <body>
      <nav><a href="/">Home</a><a href="/docs">Docs</a></nav>
      <main>
        <h1>Antigravity Developer Guide</h1>
        <p>This manual covers essential concepts, tools, and custom subagents.</p>
        <div class="callout-note">
          <p>Note: Always keep access control intact and check test suites before pushing.</p>
        </div>
        <h2>Quickstart Example</h2>
        <pre><code class="language-python">from antigravity import Agent

agent = Agent("PDFly")
agent.run()
</code></pre>
        <h2>Feature Matrix</h2>
        <table>
          <tr><th>Feature</th><th>Status</th></tr>
          <tr><td>Docu Engine</td><td>Complete</td></tr>
          <tr><td>Drag Reorder</td><td>Complete</td></tr>
        </table>
        <ul>
          <li>100% Vector PDF Output</li>
          <li>Clickable Table of Contents</li>
        </ul>
      </main>
      <footer>Footer content to strip</footer>
    </body>
    </html>
    """

    extracted = extract_doc_content(sample_html, "https://docs.antigravity.dev/guide")
    assert extracted["title"] == "Antigravity Developer Guide"
    assert len(extracted["blocks"]) >= 5

    has_code = any(b["type"] == "code" and "Agent" in b["code"] for b in extracted["blocks"])
    has_callout = any(b["type"] == "callout" for b in extracted["blocks"])
    has_table = any(b["type"] == "table" for b in extracted["blocks"])
    assert has_code, "Code block must be extracted"
    assert has_callout, "Callout note must be extracted"
    assert has_table, "Table must be extracted"

    out_manual = TMP_DIR / "antigravity_manual.pdf"
    res = generate_docu_manual(
        site_title="Antigravity Docs",
        source_url="https://docs.antigravity.dev/guide",
        pages_data=[extracted],
        document_title="Antigravity Reference Manual",
        output_path=out_manual
    )

    assert out_manual.exists()
    assert res["page_count"] >= 3 # Cover + TOC + Content
    doc = pymupdf.open(out_manual)
    toc = doc.get_toc()
    doc.close()

    assert len(toc) >= 2, "PDF must have table of contents / outlines"

def test_docu_api_endpoint():
    html_file = TMP_DIR / "sample_doc.html"
    html_file.write_text("<html><body><h1>API Reference</h1><p>Docu conversion test.</p></body></html>", encoding="utf-8")

    with open(html_file, "rb") as f:
        res = client.post(
            "/api/convert/docu-to-pdf",
            files={"file": ("sample_doc.html", f, "text/html")},
            data={"document_title": "API Manual"}
        )

    assert res.status_code == 200
    data = res.json()
    assert data["success"] is True
    assert "documentation_manual.pdf" in data["filename"]
    assert data["download_url"].startswith("/api/download/")

