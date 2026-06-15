import fitz
import json
import os

pdf_dir = os.path.join(os.path.dirname(__file__), "pdfs")

pdfs = [
    {"prj": "PRJ402101", "bomPage": 10, "name": "Redmond Wetlands"},
    {"prj": "PRJ402113", "bomPage": 9, "name": "Berry Ken systems"},
]

for entry in pdfs:
    pdf_path = os.path.join(pdf_dir, f"{entry['prj']}.pdf")
    page_num = entry["bomPage"] - 1

    doc = fitz.open(pdf_path)
    page = doc[page_num]

    print(f"\n{'='*60}")
    print(f"{entry['prj']} — {entry['name']} — Page {entry['bomPage']}")
    print(f"{'='*60}")

    # Method 1: Standard text extraction
    text = page.get_text("text")
    print(f"\n--- Method 1: get_text('text') [{len(text)} chars] ---")
    print(text[:500] if text else "(empty)")

    # Method 2: Raw text with layout preservation
    text_layout = page.get_text("text", flags=fitz.TEXT_PRESERVE_WHITESPACE | fitz.TEXT_PRESERVE_LIGATURES)
    print(f"\n--- Method 2: layout-preserved [{len(text_layout)} chars] ---")
    if text_layout != text:
        print(text_layout[:500])
    else:
        print("(same as method 1)")

    # Method 3: HTML extraction (catches more content types)
    html = page.get_text("html")
    print(f"\n--- Method 3: HTML [{len(html)} chars] ---")
    # Count img tags vs text spans
    img_count = html.count("<img")
    span_count = html.count("<span")
    print(f"  <img> tags: {img_count}, <span> tags: {span_count}")

    # Method 4: Dict extraction - detailed block analysis
    blocks = page.get_text("dict")["blocks"]
    text_blocks = [b for b in blocks if b["type"] == 0]
    image_blocks = [b for b in blocks if b["type"] == 1]
    print(f"\n--- Method 4: Block analysis ---")
    print(f"  Text blocks: {len(text_blocks)}, Image blocks: {len(image_blocks)}")

    # Show all text from text blocks
    all_text_items = []
    for tb in text_blocks:
        for line in tb.get("lines", []):
            for span in line.get("spans", []):
                t = span.get("text", "").strip()
                if t:
                    all_text_items.append(t)
    print(f"  Total text spans with content: {len(all_text_items)}")
    print(f"  All text: {all_text_items}")

    # Method 5: Check drawings/paths for text-like content
    paths = page.get_drawings()
    print(f"\n--- Method 5: Vector drawings ---")
    print(f"  Total drawing items (paths): {len(paths)}")

    # Method 6: Check for annotations
    annots = list(page.annots()) if page.annots() else []
    print(f"\n--- Method 6: Annotations: {len(annots)} ---")

    # Check a non-BOM page for comparison
    if len(doc) > 1:
        other_page = doc[0]
        other_text = other_page.get_text("text")
        print(f"\n--- Page 1 comparison: {len(other_text)} chars ---")
        lines = [l.strip() for l in other_text.split("\n") if l.strip()]
        print(f"  Non-empty lines: {len(lines)}")
        if lines:
            print(f"  Sample: {lines[:5]}")

    doc.close()
