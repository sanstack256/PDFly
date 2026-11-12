import os
import re
import ipaddress
import urllib.parse
from pathlib import Path
from typing import List, Dict, Any, Optional, Set
import httpx
import bs4
from bs4 import BeautifulSoup, Tag
import pymupdf

# ----------------- SECURITY & URL NORMALIZATION -----------------

IGNORED_EXTENSIONS = {
    ".png", ".jpg", ".jpeg", ".gif", ".svg", ".webp", ".ico", ".avif", ".bmp",
    ".pdf", ".zip", ".tar", ".gz", ".tgz", ".bz2", ".xz", ".7z", ".rar",
    ".exe", ".dmg", ".pkg", ".deb", ".rpm", ".msi", ".iso", ".bin",
    ".mp4", ".mp3", ".webm", ".avi", ".mov", ".wav", ".ogg",
    ".css", ".js", ".mjs", ".cjs", ".map", ".json", ".xml", ".rss", ".atom",
    ".woff", ".woff2", ".ttf", ".eot", ".otf"
}

TRACKING_PARAMS = {
    "utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content",
    "ref", "source", "fbclid", "gclid", "_ga", "_gl", "mc_cid", "mc_eid", "token"
}

NAV_CONTAINER_SELECTORS = [
    "nav", "aside", "[role='navigation']", ".sidebar", ".docs-sidebar",
    ".doc-sidebar", ".vp-sidebar", ".md-sidebar", ".toctree-wrapper",
    ".bd-sidebar", ".menu", ".nav-list", "#sidebar"
]

STRIP_SELECTORS = [
    "script", "style", "noscript", "iframe", "svg", "nav", "header", "footer", "aside",
    ".sidebar", ".navigation", ".menu", ".nav", ".site-nav", ".sub-nav",
    ".cookie-banner", ".cookie-notice", ".cookie-consent", ".gdpr",
    ".advertisement", ".ad", ".banner", ".sponsored", ".sponsor",
    ".social-share", ".share-buttons", ".share-bar", ".share-links",
    ".toc", ".table-of-contents", ".page-toc", ".toctree-wrapper",
    ".comments", "#comments", ".comment-list", ".disqus",
    ".newsletter", ".subscribe", ".newsletter-signup",
    "button", "form", "input", "select", "textarea"
]

CANDIDATE_CONTAINERS = [
    "main", "article", "[role='main']", ".entry-content", ".post-content",
    ".article-content", ".article-body", ".prose", ".markdown-body",
    ".theme-doc-markdown", ".vp-doc", ".nextra-content", ".sl-markdown-content",
    ".md-content__inner", ".rst-content", ".document", ".documentation-content",
    ".docs-content", ".doc-content", ".content-main", "#content", "#main-content", ".content"
]

def normalize_url(url: str) -> str:
    parsed = urllib.parse.urlsplit(url)
    # Strip hash
    query_params = urllib.parse.parse_qsl(parsed.query)
    filtered_query = [
        (k, v) for k, v in query_params
        if k.lower() not in TRACKING_PARAMS and not k.lower().startswith("utm_")
    ]
    new_query = urllib.parse.urlencode(filtered_query)
    clean = urllib.parse.urlunsplit((parsed.scheme.lower(), parsed.netloc.lower(), parsed.path, new_query, ""))
    return clean

def is_safe_url(url: str) -> bool:
    try:
        parsed = urllib.parse.urlparse(url)
        if parsed.scheme not in ("http", "https"):
            return False
        hostname = parsed.hostname
        if not hostname or hostname in ("localhost", "127.0.0.1", "::1"):
            return False
        # Prevent IP address direct loopback/private range
        try:
            ip = ipaddress.ip_address(hostname)
            if ip.is_private or ip.is_loopback or ip.is_link_local:
                return False
        except ValueError:
            pass
        return True
    except Exception:
        return False

# ----------------- CRAWLER & DISCOVERY -----------------

def discover_doc_pages(root_url: str, max_pages: int = 20, max_depth: int = 3) -> Dict[str, Any]:
    norm_root = normalize_url(root_url)
    if not is_safe_url(norm_root):
        raise ValueError(f"URL is invalid or not allowed: {root_url}")

    parsed_root = urllib.parse.urlparse(norm_root)
    root_netloc = parsed_root.netloc
    root_path_prefix = parsed_root.path.rstrip("/")
    if root_path_prefix.endswith(tuple(IGNORED_EXTENSIONS)):
        root_path_prefix = os.path.dirname(root_path_prefix)

    headers = {
        "User-Agent": "Docu-Crawler/1.0 (+https://github.com/sanstack256/Docu; offline-doc-converter)"
    }

    discovered: List[Dict[str, Any]] = []
    visited: Set[str] = set()
    queue = [(norm_root, 0, "Introduction")]

    site_title = "Documentation"

    with httpx.Client(headers=headers, follow_redirects=True, timeout=12.0) as client:
        while queue and len(discovered) < max_pages:
            current_url, depth, parent_section = queue.pop(0)
            if current_url in visited or depth > max_depth:
                continue
            visited.add(current_url)

            try:
                resp = client.get(current_url)
                if resp.status_code != 200:
                    continue
                content_type = resp.headers.get("content-type", "")
                if "text/html" not in content_type and "application/xhtml" not in content_type:
                    continue

                soup = BeautifulSoup(resp.text, "html.parser")

                # Extract page title
                page_title = ""
                if soup.title and soup.title.string:
                    page_title = soup.title.string.strip()
                elif soup.find("h1"):
                    page_title = soup.find("h1").get_text().strip()
                if not page_title:
                    page_title = os.path.basename(urllib.parse.urlparse(current_url).path) or "Documentation"

                # If first page, clean up site title
                if len(discovered) == 0:
                    cleaned_site_title = page_title.split("—")[0].split("-")[0].split("|")[0].strip()
                    if cleaned_site_title:
                        site_title = cleaned_site_title

                discovered.append({
                    "url": current_url,
                    "title": page_title,
                    "path": urllib.parse.urlparse(current_url).path or "/",
                    "section": parent_section,
                    "depth": depth
                })

                if len(discovered) >= max_pages or depth >= max_depth:
                    continue

                # Find subpage links
                # First check nav containers
                candidate_links = []
                for sel in NAV_CONTAINER_SELECTORS:
                    for nav in soup.select(sel):
                        for a in nav.find_all("a", href=True):
                            candidate_links.append(a)

                # Fallback to all links
                if not candidate_links:
                    candidate_links = soup.find_all("a", href=True)

                for link in candidate_links:
                    href = link["href"].strip()
                    if not href or href.startswith(("#", "javascript:", "mailto:", "tel:")):
                        continue

                    abs_url = urllib.parse.urljoin(current_url, href)
                    norm_sub = normalize_url(abs_url)
                    sub_parsed = urllib.parse.urlparse(norm_sub)

                    # Check same domain
                    if sub_parsed.netloc != root_netloc:
                        continue

                    # Check ignored extension
                    ext = os.path.splitext(sub_parsed.path)[1].lower()
                    if ext in IGNORED_EXTENSIONS:
                        continue

                    # Section name from link text or parent heading
                    link_text = link.get_text().strip() or "Subpage"
                    section_name = link_text[:40]

                    if norm_sub not in visited and norm_sub not in [q[0] for q in queue]:
                        queue.append((norm_sub, depth + 1, section_name))

            except Exception as e:
                continue

    return {
        "site_title": site_title,
        "root_url": norm_root,
        "pages": discovered,
        "total_discovered": len(discovered)
    }

# ----------------- CONTENT EXTRACTOR -----------------

def extract_doc_content(html: str, url: str) -> Dict[str, Any]:
    soup = BeautifulSoup(html, "html.parser")

    # Title extraction
    title = ""
    if soup.find("h1"):
        title = soup.find("h1").get_text().strip()
    elif soup.title and soup.title.string:
        title = soup.title.string.strip()
    if not title:
        title = os.path.basename(urllib.parse.urlparse(url).path) or "Untitled Document"

    # Strip noisy elements
    for sel in STRIP_SELECTORS:
        for el in soup.select(sel):
            el.decompose()

    # Find main content container
    content_root = None
    for sel in CANDIDATE_CONTAINERS:
        el = soup.select_one(sel)
        if el and len(el.get_text(strip=True)) > 80:
            content_root = el
            break

    if not content_root:
        content_root = soup.body or soup

    blocks: List[Dict[str, Any]] = []

    # Traverse child elements
    for el in content_root.find_all(["h1", "h2", "h3", "h4", "p", "pre", "ul", "ol", "table", "blockquote", "div"], recursive=True):
        tag_name = el.name.lower()

        if tag_name in ("h1", "h2", "h3", "h4"):
            text = el.get_text().strip()
            level = int(tag_name[1])
            if text and not any(b.get("type") == "heading" and b.get("text") == text for b in blocks[-3:]):
                blocks.append({"type": "heading", "level": level, "text": text})

        elif tag_name == "pre":
            code_el = el.find("code")
            code_text = (code_el or el).get_text()
            if code_text.strip():
                # Detect language from class
                classes = el.get("class", []) + (code_el.get("class", []) if code_el else [])
                lang = "code"
                for cls in classes:
                    if cls.startswith(("language-", "lang-")):
                        lang = cls.split("-")[-1]
                        break
                blocks.append({"type": "code", "code": code_text.strip(), "language": lang})

        elif tag_name == "p":
            text = el.get_text().strip()
            # Check if this paragraph is already in a parent pre or blockquote
            if text and el.parent.name not in ("pre", "blockquote", "li"):
                # Detect if callout/admonition
                classes = " ".join(el.get("class", [])) + " " + " ".join(el.parent.get("class", []))
                if any(k in classes.lower() for k in ("note", "info", "tip", "warn", "caution", "alert")):
                    variant = "warning" if "warn" in classes.lower() else ("tip" if "tip" in classes.lower() else "note")
                    blocks.append({"type": "callout", "variant": variant, "text": text})
                else:
                    blocks.append({"type": "paragraph", "text": text})

        elif tag_name in ("ul", "ol") and el.parent.name not in ("ul", "ol"):
            items = [li.get_text().strip() for li in el.find_all("li", recursive=False) if li.get_text().strip()]
            if items:
                blocks.append({"type": "list", "ordered": tag_name == "ol", "items": items[:25]})

        elif tag_name == "table":
            headers = [th.get_text().strip() for th in el.find_all("th")]
            rows = []
            for tr in el.find_all("tr"):
                cells = [td.get_text().strip() for td in tr.find_all(["td", "th"])]
                if cells and cells != headers:
                    rows.append(cells[:8])
            if rows or headers:
                blocks.append({"type": "table", "headers": headers[:8], "rows": rows[:40]})

        elif tag_name == "blockquote":
            text = el.get_text().strip()
            if text:
                blocks.append({"type": "callout", "variant": "note", "text": text})

    # Word count estimation
    full_text = " ".join(b.get("text", "") or b.get("code", "") for b in blocks)
    word_count = len(full_text.split())

    return {
        "url": url,
        "title": title,
        "blocks": blocks,
        "word_count": word_count
    }

# ----------------- PUBLICATION-GRADE PDF GENERATION -----------------

def generate_docu_manual(
    site_title: str,
    source_url: str,
    pages_data: List[Dict[str, Any]],
    document_title: Optional[str],
    output_path: Path
) -> Dict[str, Any]:
    doc = pymupdf.open()
    doc_title = document_title or f"{site_title} — Documentation Manual"

    # Page dimension: standard A4 (595.32 x 841.92 pt)
    pw, ph = 595.32, 841.92
    margin_l = 54.0
    margin_r = 54.0
    margin_t = 54.0
    margin_b = 54.0
    content_w = pw - margin_l - margin_r

    # Colors
    c_primary = (0.18, 0.25, 0.65)   # Indigo/Navy
    c_text_dark = (0.12, 0.14, 0.18) # Slate 900
    c_text_body = (0.22, 0.25, 0.30) # Slate 700
    c_text_muted = (0.45, 0.48, 0.55)
    c_bg_code = (0.96, 0.97, 0.98)
    c_border_code = (0.85, 0.88, 0.92)

    # ---------------- 1. COVER PAGE ----------------
    cover = doc.new_page(width=pw, height=ph)

    # Decorative Border Frame
    cover.draw_rect(pymupdf.Rect(margin_l - 12, margin_t - 12, pw - margin_r + 12, ph - margin_b + 12), color=(0.88, 0.90, 0.95), width=1)

    # Top Pill Badge
    pill_rect = pymupdf.Rect(margin_l, 110, margin_l + 190, 134)
    cover.draw_rect(pill_rect, color=(0.78, 0.82, 0.96), fill=(0.94, 0.95, 1.0))
    cover.insert_text(pymupdf.Point(margin_l + 12, 126), "OFFLINE DOCUMENTATION MANUAL", fontsize=8, fontname="hebo", color=c_primary)

    # Title
    cover.insert_textbox(
        pymupdf.Rect(margin_l, 160, pw - margin_r, 260),
        doc_title,
        fontsize=24,
        fontname="hebo",
        color=c_text_dark,
        lineheight=1.2
    )

    # Subtitle / Source info
    cover.insert_text(pymupdf.Point(margin_l, 280), f"Compiled from: {source_url}", fontsize=10.5, fontname="helv", color=c_primary)

    # Horizontal Rule
    cover.draw_line(pymupdf.Point(margin_l, 310), pymupdf.Point(pw - margin_r, 310), color=(0.85, 0.87, 0.92), width=1.5)

    # Document Specs Card
    spec_box = pymupdf.Rect(margin_l, 340, pw - margin_r, 460)
    cover.draw_rect(spec_box, color=(0.90, 0.92, 0.95), fill=(0.98, 0.98, 0.99))
    import datetime
    now_str = datetime.datetime.now().strftime("%B %d, %Y")
    spec_lines = [
        f"Site: {site_title}",
        f"Date of Export: {now_str}",
        f"Total Chapters / Pages: {len(pages_data)}",
        f"Engine: PDFly Docu Pipeline (Pure Vector & Searchable Typography)",
        "Includes Clickable Table of Contents & PDF Outlines"
    ]
    cover.insert_textbox(
        pymupdf.Rect(margin_l + 16, 356, pw - margin_r - 16, 444),
        "\n".join(spec_lines),
        fontsize=9.5,
        fontname="helv",
        color=c_text_body,
        lineheight=1.5
    )

    # ---------------- 2. CHAPTER CONTENT & TOC RECORDING ----------------
    toc_data: List[Dict[str, Any]] = []
    chapter_start_pages: List[int] = []

    for idx, page_item in enumerate(pages_data):
        curr_page = doc.new_page(width=pw, height=ph)
        page_idx = len(doc) - 1
        chapter_start_pages.append(page_idx)

        # Record for Table of Contents
        ch_title = page_item.get("title") or f"Chapter {idx + 1}"
        toc_data.append({
            "title": ch_title,
            "page_idx": page_idx,
            "chapter_num": idx + 1,
            "url": page_item.get("url", "")
        })

        y = margin_t + 20

        # Chapter Header Banner
        curr_page.insert_text(pymupdf.Point(margin_l, y), f"CHAPTER {idx + 1}", fontsize=9, fontname="hebo", color=c_primary)
        y += 18
        curr_page.insert_textbox(pymupdf.Rect(margin_l, y, pw - margin_r, y + 40), ch_title, fontsize=18, fontname="hebo", color=c_text_dark)
        y += 34
        curr_page.draw_line(pymupdf.Point(margin_l, y), pymupdf.Point(pw - margin_r, y), color=(0.85, 0.88, 0.92), width=1)
        y += 20

        # Render Content Blocks
        blocks = page_item.get("blocks", [])
        for block in blocks:
            b_type = block.get("type")

            # Check if near bottom of page, create new page
            if y > ph - margin_b - 50:
                curr_page = doc.new_page(width=pw, height=ph)
                y = margin_t + 20

            if b_type == "heading":
                lvl = block.get("level", 2)
                fsize = 14 if lvl == 2 else 12
                htext = block.get("text", "")
                y += 10
                curr_page.insert_text(pymupdf.Point(margin_l, y), htext, fontsize=fsize, fontname="hebo", color=c_text_dark)
                y += fsize + 8

            elif b_type == "paragraph":
                p_text = block.get("text", "")
                p_rect = pymupdf.Rect(margin_l, y, pw - margin_r, y + 180)
                # Auto size
                rc = curr_page.insert_textbox(p_rect, p_text, fontsize=10, fontname="helv", color=c_text_body, lineheight=1.35)
                # Estimate height based on length
                approx_lines = max(1, len(p_text) // 75 + 1)
                consumed_h = approx_lines * 14
                y += min(consumed_h + 10, 190)

            elif b_type == "code":
                code_text = block.get("code", "")
                lang = block.get("language", "code").upper()
                code_lines = code_text.splitlines()[:30]
                box_h = min(len(code_lines) * 13 + 24, 280)

                if y + box_h > ph - margin_b:
                    curr_page = doc.new_page(width=pw, height=ph)
                    y = margin_t + 20

                # Code block box
                c_rect = pymupdf.Rect(margin_l, y, pw - margin_r, y + box_h)
                curr_page.draw_rect(c_rect, color=c_border_code, fill=c_bg_code)

                # Language label
                curr_page.insert_text(pymupdf.Point(pw - margin_r - 40, y + 14), lang, fontsize=7.5, fontname="hebo", color=c_text_muted)

                # Code content
                curr_page.insert_textbox(
                    pymupdf.Rect(margin_l + 10, y + 12, pw - margin_r - 10, y + box_h - 6),
                    "\n".join(code_lines),
                    fontsize=8.5,
                    fontname="cour",
                    color=(0.15, 0.18, 0.24),
                    lineheight=1.25
                )
                y += box_h + 14

            elif b_type == "callout":
                variant = block.get("variant", "note")
                text = block.get("text", "")
                box_color = (0.2, 0.5, 0.8) if variant == "note" else ((0.1, 0.65, 0.3) if variant == "tip" else (0.85, 0.45, 0.1))
                bg_color = (0.95, 0.98, 1.0) if variant == "note" else ((0.95, 1.0, 0.95) if variant == "tip" else (1.0, 0.98, 0.93))

                approx_lines = max(1, len(text) // 65 + 1)
                box_h = approx_lines * 14 + 18

                if y + box_h > ph - margin_b:
                    curr_page = doc.new_page(width=pw, height=ph)
                    y = margin_t + 20

                box_rect = pymupdf.Rect(margin_l, y, pw - margin_r, y + box_h)
                curr_page.draw_rect(box_rect, color=(0.88, 0.88, 0.9), fill=bg_color)
                # Left accent border
                curr_page.draw_rect(pymupdf.Rect(margin_l, y, margin_l + 4, y + box_h), color=box_color, fill=box_color)

                curr_page.insert_textbox(
                    pymupdf.Rect(margin_l + 12, y + 8, pw - margin_r - 8, y + box_h - 4),
                    text,
                    fontsize=9.5,
                    fontname="helv",
                    color=c_text_dark,
                    lineheight=1.3
                )
                y += box_h + 12

            elif b_type == "list":
                items = block.get("items", [])
                ordered = block.get("ordered", False)
                for l_idx, item in enumerate(items[:15]):
                    bullet = f"{l_idx + 1}." if ordered else "•"
                    curr_page.insert_text(pymupdf.Point(margin_l + 8, y), bullet, fontsize=9.5, fontname="hebo", color=c_primary)
                    curr_page.insert_textbox(pymupdf.Rect(margin_l + 22, y - 8, pw - margin_r, y + 25), item, fontsize=9.5, fontname="helv", color=c_text_body)
                    y += 16
                y += 8

    # ---------------- 3. INSERT TABLE OF CONTENTS RIGHT AFTER COVER ----------------
    # Create TOC page(s) and insert after cover (page index 1)
    toc_doc = pymupdf.open()
    toc_page = toc_doc.new_page(width=pw, height=ph)
    toc_y = margin_t + 20

    toc_page.insert_text(pymupdf.Point(margin_l, toc_y), "Table of Contents", fontsize=18, fontname="hebo", color=c_text_dark)
    toc_y += 24
    toc_page.draw_line(pymupdf.Point(margin_l, toc_y), pymupdf.Point(pw - margin_r, toc_y), color=(0.85, 0.88, 0.92), width=1)
    toc_y += 24

    for item in toc_data:
        if toc_y > ph - margin_b - 30:
            toc_page = toc_doc.new_page(width=pw, height=ph)
            toc_y = margin_t + 30

        # Chapter num and title
        ch_str = f"{item['chapter_num']}. {item['title']}"
        toc_page.insert_text(pymupdf.Point(margin_l, toc_y), ch_str[:60], fontsize=10, fontname="hebo", color=c_text_dark)

        # Page number (offset by +2 because cover and TOC page are at front)
        target_page_display = item["page_idx"] + 1 + len(toc_doc)
        pg_str = f"Page {target_page_display}"
        toc_page.insert_text(pymupdf.Point(pw - margin_r - 45, toc_y), pg_str, fontsize=10, fontname="helv", color=c_primary)

        # Dot leaders
        toc_page.insert_text(pymupdf.Point(margin_l + 240, toc_y), ". . . . . . . . . . . . . . . . . . . .", fontsize=8, fontname="helv", color=(0.7, 0.7, 0.75))

        toc_y += 22

    # Insert TOC document pages at index 1 in main doc
    doc.insert_pdf(toc_doc, start_at=1)
    toc_pages_count = len(toc_doc)
    toc_doc.close()

    # ---------------- 4. RUNNING HEADERS, FOOTERS & BOOKMARKS ----------------
    total_pages = len(doc)
    pdf_outline = [
        [1, doc_title, 1],
        [1, "Table of Contents", 2]
    ]

    for p_idx in range(total_pages):
        page = doc[p_idx]
        if p_idx == 0:  # Skip cover
            continue

        # Header (pages after cover & TOC)
        if p_idx > toc_pages_count:
            page.insert_text(pymupdf.Point(margin_l, margin_t - 16), doc_title[:45], fontsize=8, fontname="helv", color=c_text_muted)
            page.draw_line(pymupdf.Point(margin_l, margin_t - 10), pymupdf.Point(pw - margin_r, margin_t - 10), color=(0.9, 0.92, 0.95), width=0.5)

        # Footer
        footer_text = f"Page {p_idx + 1} of {total_pages}"
        page.draw_line(pymupdf.Point(margin_l, ph - margin_b + 12), pymupdf.Point(pw - margin_r, ph - margin_b + 12), color=(0.9, 0.92, 0.95), width=0.5)
        page.insert_text(pymupdf.Point(pw - margin_r - 55, ph - margin_b + 24), footer_text, fontsize=8, fontname="helv", color=c_text_muted)
        page.insert_text(pymupdf.Point(margin_l, ph - margin_b + 24), "PDFly Docu Engine", fontsize=8, fontname="helv", color=(0.6, 0.65, 0.7))

    # Add chapters to outline
    for item in toc_data:
        target_dest = item["page_idx"] + toc_pages_count + 1
        if target_dest <= total_pages:
            pdf_outline.append([1, f"{item['chapter_num']}. {item['title']}", target_dest])

    doc.set_toc(pdf_outline)
    doc.save(output_path, garbage=3, deflate=True)
    doc.close()

    return {
        "success": True,
        "page_count": total_pages,
        "file_size": os.path.getsize(output_path),
        "site_title": site_title,
        "toc_entries": len(toc_data)
    }

# ----------------- MAIN PIPELINE ENTRYPOINT -----------------

def convert_documentation_to_pdf(
    url: Optional[str] = None,
    files: List[Path] = [],
    selected_urls: Optional[List[str]] = None,
    document_title: Optional[str] = None,
    max_pages: int = 20,
    max_depth: int = 3,
    output_path: Optional[Path] = None
) -> Dict[str, Any]:
    if not output_path:
        raise ValueError("output_path must be provided.")

    pages_data: List[Dict[str, Any]] = []
    site_title = document_title or "Documentation Manual"
    source_url = url or "Uploaded Documentation Files"

    # Case 1: Online Documentation URL
    if url and url.strip():
        norm = normalize_url(url.strip())
        # If user provided selected URLs from a discovery step, crawl those
        target_urls = selected_urls if (selected_urls and len(selected_urls) > 0) else None

        if not target_urls:
            discovery = discover_doc_pages(norm, max_pages=max_pages, max_depth=max_depth)
            site_title = discovery.get("site_title", site_title)
            target_urls = [p["url"] for p in discovery.get("pages", [])]

        if not target_urls:
            target_urls = [norm]

        headers = {
            "User-Agent": "Docu-Crawler/1.0 (+https://github.com/sanstack256/Docu; offline-doc-converter)"
        }
        with httpx.Client(headers=headers, follow_redirects=True, timeout=14.0) as client:
            for page_url in target_urls[:max_pages]:
                try:
                    res = client.get(page_url)
                    if res.status_code == 200:
                        extracted = extract_doc_content(res.text, page_url)
                        pages_data.append(extracted)
                except Exception:
                    continue

    # Case 2: Uploaded Documentation HTML / Text files
    elif files and len(files) > 0:
        for fpath in files:
            try:
                content = fpath.read_text(encoding="utf-8", errors="ignore")
                extracted = extract_doc_content(content, fpath.name)
                pages_data.append(extracted)
            except Exception:
                continue

    if not pages_data:
        raise ValueError("Could not extract any documentation content from the provided source.")

    return generate_docu_manual(
        site_title=site_title,
        source_url=source_url,
        pages_data=pages_data,
        document_title=document_title,
        output_path=output_path
    )

