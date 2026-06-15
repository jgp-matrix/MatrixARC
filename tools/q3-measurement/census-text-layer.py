import fitz
import json
import os

pdf_dir = os.path.join(os.path.dirname(__file__), "pdfs")

projects = [
    # Already analyzed (include for completeness)
    {"prj": "PRJ402096", "bomPage": 21, "customer": "FLSmidth", "name": "Salares Norte Retort"},
    {"prj": "PRJ402098", "bomPage": 4, "customer": "Matrix Systems, Inc.", "name": "Buyoff Disconnect Box"},
    {"prj": "PRJ402100", "bomPage": 2, "customer": "Clearstream Environmental", "name": "Abbeville Clarifier"},
    {"prj": "PRJ402101", "bomPage": 10, "customer": "OVIVO", "name": "Redmond Wetlands"},
    {"prj": "PRJ402113", "bomPage": 9, "customer": "FLSmidth", "name": "Berry Ken systems"},
    # New downloads
    {"prj": "PRJ402094", "bomPage": 3, "customer": "Neumann Construction", "name": "Materion"},
    {"prj": "PRJ402093", "bomPage": 6, "customer": "OVIVO", "name": "Carterville"},
    {"prj": "PRJ402109", "bomPage": 9, "customer": "OVIVO", "name": "South Florida Trash Rake"},
    {"prj": "PRJ402117", "bomPage": 2, "customer": "OVIVO", "name": "Hollywood Detritor CP"},
    {"prj": "PRJ402119", "bomPage": 3, "customer": "OVIVO", "name": "Proctors Creek"},
    {"prj": "PRJ402111", "bomPage": 2, "customer": "Rebuild-It", "name": "Secret Panel"},
    {"prj": "PRJ402118", "bomPage": 1, "customer": "Royal A&C Direct", "name": "Leamington Junction Boxes"},
    {"prj": "PRJ402102", "bomPage": 3, "customer": "Sentry Equipment", "name": "Rebuild-It Load Cell Panel"},
    {"prj": "PRJ402108", "bomPage": 2, "customer": "Sentry Equipment", "name": "Secret Project"},
]

results = []

for entry in projects:
    pdf_path = os.path.join(pdf_dir, f"{entry['prj']}.pdf")
    if not os.path.exists(pdf_path):
        results.append({**entry, "error": "PDF not found"})
        continue

    try:
        doc = fitz.open(pdf_path)
        page_idx = entry["bomPage"] - 1
        if page_idx >= len(doc):
            results.append({**entry, "error": f"Page {entry['bomPage']} out of range ({len(doc)} pages)"})
            doc.close()
            continue

        page = doc[page_idx]
        text = page.get_text("text").strip()
        text_len = len(text)
        lines = [l.strip() for l in text.split("\n") if l.strip()]

        blocks = page.get_text("dict")["blocks"]
        text_blocks = [b for b in blocks if b["type"] == 0]
        image_blocks = [b for b in blocks if b["type"] == 1]
        path_count = len(page.get_drawings())

        # Classify: does text contain BOM content (PNs, quantities)?
        # Heuristic: if text has >200 chars AND contains alphanumeric strings
        # that look like part numbers (5+ chars with mixed letters/digits)
        pn_like = []
        for line in lines:
            # Strip common title-block words
            if line.upper() in ['SHEET', 'OF', 'REVISION', 'SIZE', 'DWG', 'NO.', 'BILL OF MATERIALS',
                                'BILL OF MATERIAL', '(DO NOT SCALE PRINTS)', 'D', 'B', 'C', 'A', 'E', 'F']:
                continue
            # Check if line looks like a part number (5+ chars, has digits)
            if len(line) >= 5 and any(c.isdigit() for c in line) and any(c.isalpha() for c in line):
                pn_like.append(line)

        has_text_layer = text_len > 200 and len(pn_like) >= 3

        # Root cause classification for vision-mode
        root_cause = None
        if not has_text_layer:
            if image_blocks >= 2 and text_len < 100:
                # BOM is embedded as image(s) within the PDF
                root_cause = "BITMAP"
            elif image_blocks == 0 and path_count > 500 and text_len < 200:
                # Pure vector paths, no images, minimal text — CAD text as strokes
                root_cause = "VECTOR-STROKE"
            elif image_blocks >= 1 and text_len == 0:
                # Whole page is a scanned raster
                root_cause = "SCAN"
            elif image_blocks >= 1 and path_count > 500:
                # Mixed: some images + lots of vector paths
                root_cause = "BITMAP" if image_blocks >= 2 else "VECTOR-STROKE"
            else:
                root_cause = "UNKNOWN"

        results.append({
            "prj": entry["prj"],
            "customer": entry["customer"],
            "name": entry["name"],
            "bomPage": entry["bomPage"],
            "textChars": text_len,
            "textLines": len(lines),
            "pnLikeLines": len(pn_like),
            "textBlocks": len(text_blocks),
            "imageBlocks": len(image_blocks),
            "vectorPaths": path_count,
            "hasTextLayer": has_text_layer,
            "rootCause": root_cause,
            "samplePNs": pn_like[:5] if pn_like else [],
            "sampleText": lines[:5] if not has_text_layer else []
        })

        doc.close()
    except Exception as e:
        results.append({**entry, "error": str(e)})

# Output
print(json.dumps(results, indent=2))
