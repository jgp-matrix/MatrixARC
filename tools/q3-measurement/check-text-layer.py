import fitz  # PyMuPDF
import json
import sys
import os

pdfs = [
    {"prj": "PRJ402092", "bomPage": 9, "name": "Ball Mill Equipment Wiring"},
    {"prj": "PRJ402100", "bomPage": 2, "name": "Abbeville Clarifier"},
    {"prj": "PRJ402101", "bomPage": 10, "name": "Redmond Wetlands"},
    {"prj": "PRJ402113", "bomPage": 9, "name": "Berry Ken systems"},
]

pdf_dir = os.path.join(os.path.dirname(__file__), "pdfs")

results = []
for entry in pdfs:
    pdf_path = os.path.join(pdf_dir, f"{entry['prj']}.pdf")
    page_num = entry["bomPage"] - 1  # 0-indexed in PyMuPDF

    try:
        doc = fitz.open(pdf_path)
        total_pages = len(doc)

        if page_num >= total_pages:
            results.append({
                "prj": entry["prj"],
                "name": entry["name"],
                "bomPage": entry["bomPage"],
                "error": f"Page {entry['bomPage']} out of range (doc has {total_pages} pages)"
            })
            continue

        page = doc[page_num]
        text = page.get_text("text")
        text_len = len(text.strip())

        # Also get text as dict to see structure
        blocks = page.get_text("dict")["blocks"]
        text_blocks = [b for b in blocks if b["type"] == 0]  # type 0 = text
        image_blocks = [b for b in blocks if b["type"] == 1]  # type 1 = image

        # Count non-empty text lines
        lines = [l.strip() for l in text.split("\n") if l.strip()]

        results.append({
            "prj": entry["prj"],
            "name": entry["name"],
            "bomPage": entry["bomPage"],
            "totalPdfPages": total_pages,
            "textLength": text_len,
            "textBlocks": len(text_blocks),
            "imageBlocks": len(image_blocks),
            "nonEmptyLines": len(lines),
            "viable": text_len > 100,
            "first10lines": lines[:10],
            "last5lines": lines[-5:] if len(lines) > 5 else lines
        })

        doc.close()
    except Exception as e:
        results.append({
            "prj": entry["prj"],
            "name": entry["name"],
            "error": str(e)
        })

print(json.dumps(results, indent=2))
