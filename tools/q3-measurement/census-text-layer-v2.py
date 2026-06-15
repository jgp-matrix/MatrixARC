import fitz
import json
import os
import re

pdf_dir = os.path.join(os.path.dirname(__file__), "pdfs")

projects = [
    {"prj": "PRJ402096", "bomPage": 21, "customer": "FLSmidth", "name": "Salares Norte Retort", "bomItems": 55},
    {"prj": "PRJ402098", "bomPage": 4, "customer": "Matrix Systems, Inc.", "name": "Buyoff Disconnect Box", "bomItems": 15},
    {"prj": "PRJ402100", "bomPage": 2, "customer": "Clearstream Environmental", "name": "Abbeville Clarifier", "bomItems": 38},
    {"prj": "PRJ402101", "bomPage": 10, "customer": "OVIVO", "name": "Redmond Wetlands", "bomItems": 68},
    {"prj": "PRJ402113", "bomPage": 9, "customer": "FLSmidth", "name": "Berry Ken systems", "bomItems": 88},
    {"prj": "PRJ402094", "bomPage": 3, "customer": "Neumann Construction", "name": "Materion", "bomItems": 19},
    {"prj": "PRJ402093", "bomPage": 6, "customer": "OVIVO", "name": "Carterville", "bomItems": 68},
    {"prj": "PRJ402109", "bomPage": 9, "customer": "OVIVO", "name": "South Florida Trash Rake", "bomItems": 37},
    {"prj": "PRJ402117", "bomPage": 2, "customer": "OVIVO", "name": "Hollywood Detritor CP", "bomItems": 15},
    {"prj": "PRJ402119", "bomPage": 3, "customer": "OVIVO", "name": "Proctors Creek", "bomItems": 19},
    {"prj": "PRJ402111", "bomPage": 2, "customer": "Rebuild-It", "name": "Secret Panel", "bomItems": 43},
    {"prj": "PRJ402118", "bomPage": 1, "customer": "Royal A&C Direct", "name": "Leamington Junction Boxes", "bomItems": 16},
    {"prj": "PRJ402102", "bomPage": 3, "customer": "Sentry Equipment", "name": "Rebuild-It Load Cell Panel", "bomItems": 18},
    {"prj": "PRJ402108", "bomPage": 2, "customer": "Sentry Equipment", "name": "Secret Project", "bomItems": 46},
]

# Known manufacturer PN patterns that indicate real BOM content
MFR_PATTERNS = [
    r'\b\d{3}[A-Z]-[A-Z0-9]',      # Allen-Bradley: 140G-, 100S-, 1489-
    r'\b5069-',                       # AB CompactLogix
    r'\bSCE[-]?\d',                   # Saginaw enclosures
    r'\bA\d+[A-Z]\d+',               # Hoffman A-series
    r'\bTYD\d',                       # Hoffman wire duct
    r'\b\d{7}\b',                     # 7-digit numeric (Phoenix Contact, Wago)
    r'\bKXT\d',                       # ABB rotary
    r'\bAF\d+-\d+',                   # ABB contactors
    r'\bRH\d[A-Z]',                   # Idec relays
    r'\bEL[A-Z0-9]{3,}',             # Hoffman accessories
    r'\bSP[A-Z0-9]{3,}',             # Various
    r'\b\d{4,}-\d{4,}',              # Dash-format part numbers
    r'\b[A-Z]{2,3}\d{3,}[A-Z]',      # Mixed alpha-numeric parts
]

def count_mfr_pns(text):
    """Count lines containing manufacturer-pattern part numbers"""
    pn_lines = set()
    for pattern in MFR_PATTERNS:
        for match in re.finditer(pattern, text):
            # Find which line this match is on
            line_start = text.rfind('\n', 0, match.start()) + 1
            line_end = text.find('\n', match.end())
            if line_end == -1:
                line_end = len(text)
            line = text[line_start:line_end].strip()
            if len(line) >= 4:
                pn_lines.add(line)
    return pn_lines

results = []

for entry in projects:
    pdf_path = os.path.join(pdf_dir, f"{entry['prj']}.pdf")
    if not os.path.exists(pdf_path):
        results.append({**entry, "textLayer": "ERROR", "error": "PDF not found"})
        continue

    try:
        doc = fitz.open(pdf_path)
        page_idx = entry["bomPage"] - 1
        if page_idx >= len(doc):
            results.append({**entry, "textLayer": "ERROR", "error": f"Page out of range"})
            doc.close()
            continue

        page = doc[page_idx]
        text = page.get_text("text").strip()
        text_len = len(text)
        lines = [l.strip() for l in text.split("\n") if l.strip()]

        blocks = page.get_text("dict")["blocks"]
        text_blocks = [b for b in blocks if b["type"] == 0]
        image_blocks = [b for b in blocks if b["type"] == 1]
        n_images = len(image_blocks)
        path_count = len(page.get_drawings())

        # Find actual manufacturer PNs in text
        mfr_pn_lines = count_mfr_pns(text)

        # Classification: text-layer = has >=5 manufacturer-pattern PNs
        has_bom_text = len(mfr_pn_lines) >= 5

        # Root cause for vision-mode
        root_cause = None
        if not has_bom_text:
            if n_images == 0 and path_count > 500:
                root_cause = "VECTOR-STROKE"
            elif n_images >= 2 and text_len < 150:
                root_cause = "BITMAP"
            elif n_images >= 1 and text_len == 0:
                root_cause = "SCAN"
            elif n_images >= 1 and path_count > 1000:
                root_cause = "VECTOR-STROKE"
            elif n_images >= 1 and text_len < 200 and path_count > 200:
                root_cause = "VECTOR-STROKE"
            else:
                root_cause = "MIXED"

        results.append({
            "prj": entry["prj"],
            "customer": entry["customer"],
            "name": entry["name"],
            "bomItems": entry["bomItems"],
            "textChars": text_len,
            "mfrPNcount": len(mfr_pn_lines),
            "textBlocks": len(text_blocks),
            "imageBlocks": n_images,
            "vectorPaths": path_count,
            "textLayer": "YES" if has_bom_text else "NO",
            "rootCause": root_cause,
            "sampleMfrPNs": sorted(list(mfr_pn_lines))[:8],
        })

        doc.close()
    except Exception as e:
        results.append({"prj": entry["prj"], "customer": entry["customer"],
                       "name": entry["name"], "textLayer": "ERROR", "error": str(e)})

# Sort by text-layer status then customer
results.sort(key=lambda r: (r.get("textLayer", "Z"), r.get("customer", "")))

# Print summary
text_yes = [r for r in results if r.get("textLayer") == "YES"]
text_no = [r for r in results if r.get("textLayer") == "NO"]
text_err = [r for r in results if r.get("textLayer") == "ERROR"]

print("=" * 70)
print(f"TEXT-LAYER LANDSCAPE CENSUS: {len(text_yes)} text-layer, {len(text_no)} vision-mode, {len(text_err)} errors")
print("=" * 70)

# Root cause breakdown
rc_counts = {}
for r in text_no:
    rc = r.get("rootCause", "unknown")
    rc_counts[rc] = rc_counts.get(rc, 0) + 1
print(f"\nVision-mode root causes: {json.dumps(rc_counts)}")

print("\n" + "=" * 70)
print("FULL RESULTS")
print("=" * 70)
print(json.dumps(results, indent=2))
