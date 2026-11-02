# PDFly — High-Performance iLovePDF Alternative

PDFly is an open, full-featured alternative to [iLovePDF](https://www.ilovepdf.com/), powered by genuine document processing and conversion engines.

Every operation performs actual binary and structural transformations — **zero simulated processing, zero fake extension renames, and zero placeholder features.**

---

## Architecture & Genuine Processing Engines

| Capability | Core Engine / Library | How It Works |
| :--- | :--- | :--- |
| **PDF Core Engine** | [PyMuPDF (MuPDF C-bindings)](https://pymupdf.readthedocs.io/) | High-speed parsing, merging, splitting, page reordering, rotation, page numbering, stream deflation, xref rebuild. |
| **Office to PDF** | [LibreOffice Headless](https://www.libreoffice.org/) (`soffice`) | Isolated headless conversions for DOC, DOCX, PPT, PPTX, XLS, XLSX, and HTML with layout and typography fidelity. |
| **PDF to Word** | `pdf2docx` | Parses layout, fonts, shapes, and tables into genuine Microsoft Word `.docx` documents. |
| **PDF to PowerPoint** | `python-pptx` + PyMuPDF | Reconstructs presentation slides preserving dimensions and crisp visuals. |
| **PDF to Excel** | `pdfplumber` + `openpyxl` | Extracts structured table grids and cell data directly into `.xlsx` spreadsheets. |
| **Archival PDF/A** | [Ghostscript](https://www.ghostscript.com/) (`gs -dPDFA=2`) | Converts standard PDFs to ISO 19005 compliant archival formats with device-independent color profiles. |
| **Optical Character Recognition** | [Tesseract OCR](https://github.com/tesseract-ocr/tesseract) | Scans rasterized pages and generates selectable, searchable text layer PDFs. |
| **Redaction & Privacy** | PyMuPDF Redaction Annotations | Irreversibly deletes underlying text, vector shapes, and erases image pixels within redaction boundaries. |
| **Security & Passwords** | PyMuPDF Standard AES-256 | Military-grade encryption with custom permissions, and instant password unlocking. |
| **Frontend UI** | Next.js 16 + React 19 + Tailwind CSS | Responsive desktop/mobile UI, drag-and-drop uploads, interactive thumbnail previews, signature canvas, and redaction drawers. |

---

## Implemented Tool Catalog

### 1. Organize PDF
- **Merge PDF**: Combine multiple PDFs into a single unified document with custom ordering.
- **Split PDF**: Split PDF by custom page ranges (e.g. `1-3, 5` or `1-2; 3-5`) or extract all pages into a ZIP.
- **Remove PDF Pages**: Select and delete unwanted pages with visual page previews.
- **Extract PDF Pages**: Extract chosen pages into a new PDF or ZIP archive.
- **Organize PDF Pages**: Reorder, rotate, or delete individual sheets with drag/arrow controls.
- **Rotate PDF**: Rotate all or targeted pages by 90°, 180°, or 270°.
- **Add Page Numbers**: Insert customizable page numbers (`Page X of Y`, `Page X`, `- X -`) in 6 positions.
- **Add Watermarks**: Add text or image watermark stamps with rotation angle and opacity control.

### 2. Optimize PDF
- **Compress PDF**: Extreme, Recommended, and Less compression tiers with image downsampling and stream deflation.
- **Repair PDF**: Recover damaged PDFs by rebuilding corrupted cross-reference tables (XREFs) and streams.
- **OCR PDF**: Transform image-based/scanned PDFs into searchable, selectable text documents using Tesseract OCR.

### 3. Convert to PDF
- **JPG to PDF**: Convert single or multiple JPG, PNG, WEBP images with custom orientation and margins.
- **Word to PDF**: Convert DOC and DOCX to PDF using headless LibreOffice.
- **PowerPoint to PDF**: Convert PPT and PPTX presentations to PDF using headless LibreOffice.
- **Excel to PDF**: Convert XLS and XLSX spreadsheets to formatted PDF tables using headless LibreOffice.
- **HTML to PDF**: Convert HTML files and pages to PDF with full CSS styling.

### 4. Convert from PDF
- **PDF to JPG**: Extract all PDF pages into high-resolution JPG images (individual or ZIP).
- **PDF to Word**: Convert PDF to editable Microsoft Word (`.docx`) preserving layout and tables.
- **PDF to PowerPoint**: Convert PDF pages into Microsoft PowerPoint (`.pptx`) slides.
- **PDF to Excel**: Extract tabular data from PDF into Microsoft Excel (`.xlsx`) spreadsheets.
- **PDF to PDF/A**: Convert standard PDFs to ISO 19005 archival standard via Ghostscript.

### 5. Edit PDF
- **Interactive PDF Editor**: Insert text boxes, draw shapes (rectangles, circles, lines), highlight, underline, add watermark, and rotate pages.

### 6. PDF Security
- **Protect PDF**: Encrypt documents with AES-256 passwords and custom permissions.
- **Unlock PDF**: Decrypt password-protected PDFs and permanently strip restrictions.
- **Sign PDF**: Place drawn, typed, or uploaded signature stamps onto specific pages at custom coordinates.
- **Redact PDF**: Permanently blackout and sanitize confidential text and image areas.

---

## Getting Started

### Prerequisites
- Python 3.11+
- Node.js 18+
- LibreOffice (for Office conversions: `brew install --cask libreoffice` on macOS or `apt-get install libreoffice` on Linux)
- Ghostscript (`brew install ghostscript` or `apt-get install ghostscript`)
- Tesseract OCR (`brew install tesseract` or `apt-get install tesseract-ocr`)

### Installation

1. **Clone the repository:**
```bash
git clone https://github.com/sanstack256/PDFly.git
cd PDFly
```

2. **Set up Python Virtual Environment:**
```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r backend/requirements.txt
```

3. **Install Frontend Dependencies:**
```bash
cd frontend
npm install
cd ..
```

### Running the Application

1. **Start the Backend API:**
```bash
npm run dev:backend
# Or directly:
PYTHONPATH=backend ./.venv/bin/uvicorn backend.main:app --reload --port 8000
```

2. **Start the Frontend UI:**
```bash
npm run dev:frontend
```
Open [http://localhost:3000](http://localhost:3000) to access the PDFly workstation.

---

## Running the Automated Test Suite

Every tool is covered by end-to-end integration tests that verify file uploads, processing transformations, output parsing, and usability:

```bash
npm test
# Or:
PYTHONPATH=backend ./.venv/bin/pytest backend/tests -v
```

---

## Production Build

```bash
npm run build
```

---

## Security & Storage Cleanup

- All uploads and processed files are isolated in dedicated job directories under `/tmp/pdfly_storage/<job-id>/`.
- Automatic garbage collection purges jobs older than 1 hour.
- AES-256 standard encryption is used for document protection.
- Redaction physically destroys underlying characters and pixels, preventing forensic recovery.

---

## License

MIT

