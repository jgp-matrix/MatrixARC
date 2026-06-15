import fitz
import json
import os

pdf_dir = os.path.join(os.path.dirname(__file__), "pdfs")

pdfs = [
    {"prj": "PRJ402096", "bomPage": 21, "name": "Salares Norte Retort (FLSmidth)"},
    {"prj": "PRJ402098", "bomPage": 4, "name": "Buyoff Disconnect Box (Matrix)"},
]

for entry in pdfs:
    pdf_path = os.path.join(pdf_dir, f"{entry['prj']}.pdf")
    page_num = entry["bomPage"] - 1

    doc = fitz.open(pdf_path)
    page = doc[page_num]
    text = page.get_text("text").strip()
    lines = [l.strip() for l in text.split("\n") if l.strip()]
    blocks = page.get_text("dict")["blocks"]
    text_blocks = [b for b in blocks if b["type"] == 0]
    image_blocks = [b for b in blocks if b["type"] == 1]
    paths = len(page.get_drawings())

    print(f"\n{'='*60}")
    print(f"{entry['prj']} — {entry['name']} — Page {entry['bomPage']}")
    print(f"{'='*60}")
    print(f"Text: {len(text)} chars, {len(lines)} lines")
    print(f"Blocks: {len(text_blocks)} text, {len(image_blocks)} image, {paths} paths")
    print(f"Viable text layer: {'YES' if len(text) > 200 else 'NO'}")
    if lines:
        print(f"\nFirst 20 lines:")
        for i, line in enumerate(lines[:20]):
            print(f"  {i+1:3d}: {line}")
        if len(lines) > 20:
            print(f"  ... ({len(lines)} total)")
            print(f"Last 5:")
            for line in lines[-5:]:
                print(f"       {line}")

    doc.close()
