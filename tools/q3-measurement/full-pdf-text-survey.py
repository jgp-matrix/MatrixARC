import fitz
import json
import os

pdf_dir = os.path.join(os.path.dirname(__file__), "pdfs")

pdfs = [
    {"prj": "PRJ402100", "name": "Abbeville Clarifier", "totalPages": 2},
    {"prj": "PRJ402101", "name": "Redmond Wetlands", "totalPages": 23},
    {"prj": "PRJ402113", "name": "Berry Ken systems", "totalPages": 21},
]

for entry in pdfs:
    pdf_path = os.path.join(pdf_dir, f"{entry['prj']}.pdf")
    print(f"\n{'='*60}")
    print(f"{entry['prj']} — {entry['name']}")
    print(f"{'='*60}")

    doc = fitz.open(pdf_path)
    for pg_idx in range(len(doc)):
        page = doc[pg_idx]
        text = page.get_text("text").strip()
        blocks = page.get_text("dict")["blocks"]
        text_blocks = [b for b in blocks if b["type"] == 0]
        image_blocks = [b for b in blocks if b["type"] == 1]
        paths = len(page.get_drawings())

        lines = [l.strip() for l in text.split("\n") if l.strip()]
        has_pn_like = any(len(l) > 5 and any(c.isdigit() for c in l) for l in lines)

        marker = ""
        if len(text) > 200:
            marker = " <-- SUBSTANTIAL TEXT"
        elif len(text) > 50:
            marker = " <-- some text"

        print(f"  p{pg_idx+1:2d}: {len(text):5d} chars, {len(lines):3d} lines, "
              f"{len(text_blocks):2d} txtBlk, {len(image_blocks):2d} imgBlk, "
              f"{paths:5d} paths, hasPNs:{has_pn_like}{marker}")

    doc.close()
