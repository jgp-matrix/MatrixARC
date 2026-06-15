import fitz
import os
import json

pdf_dir = os.path.join(os.path.dirname(__file__), "pdfs")

projects = [
    {"prj": "PRJ402096", "bomPage": 21, "name": "FLS native",         "expected": "text-layer"},
    {"prj": "PRJ402098", "bomPage": 4,  "name": "Matrix ECAD",        "expected": "text-layer"},
    {"prj": "PRJ402093", "bomPage": 6,  "name": "OVIVO Carterville",  "expected": "text-layer"},
    {"prj": "PRJ402109", "bomPage": 9,  "name": "OVIVO vector-stroke", "expected": "vector-stroke"},
    {"prj": "PRJ402101", "bomPage": 10, "name": "OVIVO bitmap",        "expected": "bitmap"},
    {"prj": "PRJ402113", "bomPage": 9,  "name": "FLS/CSW 1-bit",      "expected": "bitmap"},
    {"prj": "PRJ402100", "bomPage": 2,  "name": "Clearstream raster",  "expected": "bitmap"},
    {"prj": "PRJ402092", "bomPage": 1,  "name": "0-byte test",        "expected": "no-pdf"},
]

def simulate_assess_pdf_page_quality(page):
    """Simulates the server-side assessPdfPageQuality function from functions/index.js:2265"""
    result = {
        "isScanned": False,
        "isMonochrome": False,
        "estimatedDpi": None,
        "imageCount": 0,
        "hasVectorText": False,
        "warningLevel": "none"
    }

    page_width = page.rect.width
    page_height = page.rect.height

    fonts = page.get_fonts()
    if fonts:
        result["hasVectorText"] = True

    for img in page.get_images(full=True):
        xref = img[0]
        width = img[2]
        height = img[3]

        result["imageCount"] += 1

        try:
            img_info = page.parent.extract_image(xref)
            ext = img_info.get("ext", "")
            cs = img_info.get("cs", "")

            pix = fitz.Pixmap(page.parent, xref)
            bpc = pix.n
            pix = None

            xref_str = page.parent.xref_stream_raw(xref)
            filter_raw = page.parent.xref_get_key(xref, "Filter")
            filter_str = str(filter_raw) if filter_raw else ""

            if "CCITTFaxDecode" in filter_str or "CCITTFax" in filter_str:
                result["isScanned"] = True
                result["isMonochrome"] = True
            elif "DCTDecode" in filter_str:
                result["isScanned"] = True
            elif "FlateDecode" in filter_str and width > 1000 and height > 1000:
                result["isScanned"] = True

        except Exception as e:
            filter_raw = page.parent.xref_get_key(xref, "Filter")
            filter_str = str(filter_raw) if filter_raw else ""
            if "CCITTFaxDecode" in filter_str or "CCITTFax" in filter_str:
                result["isScanned"] = True
                result["isMonochrome"] = True
            elif "DCTDecode" in filter_str:
                result["isScanned"] = True
            elif "FlateDecode" in filter_str and width > 1000 and height > 1000:
                result["isScanned"] = True

        if width > 0 and page_width > 0:
            dpi = round(width / (page_width / 72))
            if result["estimatedDpi"] is None or dpi < result["estimatedDpi"]:
                result["estimatedDpi"] = dpi

    if result["isMonochrome"]:
        result["warningLevel"] = "high"
    elif result["isScanned"] and result["estimatedDpi"] and result["estimatedDpi"] < 200:
        result["warningLevel"] = "high"
    elif result["isScanned"]:
        result["warningLevel"] = "medium"

    return result


def count_text_chars(page, bom_region=None):
    """Simulates classifyBomInputTier's text counting via pdf.js getTextContent.
    PyMuPDF's get_text("dict") is the closest equivalent - returns text spans with positions."""
    blocks = page.get_text("dict")["blocks"]
    vp_width = page.rect.width
    vp_height = page.rect.height
    total_chars = 0

    for block in blocks:
        if block["type"] != 0:
            continue
        for line in block.get("lines", []):
            for span in line.get("spans", []):
                text = span.get("text", "")
                if not text or not text.strip():
                    continue
                if bom_region:
                    ix = span["origin"][0]
                    iy = span["origin"][1]
                    rL = bom_region["x"] * vp_width
                    rR = (bom_region["x"] + bom_region["w"]) * vp_width
                    rTop = (1 - bom_region["y"]) * vp_height
                    rBot = (1 - bom_region["y"] - bom_region["h"]) * vp_height
                    if ix >= rL and ix <= rR and iy >= rBot and iy <= rTop:
                        total_chars += len(text)
                else:
                    total_chars += len(text)

    return total_chars


def classify(text_chars, quality, has_region):
    """Simulates classifyBomInputTier logic from app.jsx:14669-14722"""
    threshold = 100 if has_region else 500
    if text_chars > threshold:
        return "text-layer"
    q = quality
    if q:
        if q["isMonochrome"] and text_chars == 0:
            return "scan"
        if q["imageCount"] >= 2:
            return "bitmap"
    return "vector-stroke"


print("=" * 90)
print("PHASE 1b VERIFICATION - classifyBomInputTier vs Q3 Ground Truth")
print("=" * 90)

results = []

for entry in projects:
    pdf_path = os.path.join(pdf_dir, f"{entry['prj']}.pdf")
    prj = entry["prj"]
    expected = entry["expected"]

    print(f"\n{'-' * 90}")
    print(f"{prj} - {entry['name']} (expected: {expected})")
    print(f"{'-' * 90}")

    if not os.path.exists(pdf_path):
        print(f"  PDF NOT FOUND: {pdf_path}")
        results.append({"prj": prj, "expected": expected, "actual": "FILE_MISSING", "pass": False})
        continue

    file_size = os.path.getsize(pdf_path)
    if file_size == 0:
        print(f"  0-byte file ({file_size} bytes)")
        actual = "no-pdf"
        print(f"  Classifier result: {actual}")
        match = actual == expected
        print(f"  {'PASS' if match else 'FAIL'}: expected={expected}, actual={actual}")
        results.append({"prj": prj, "expected": expected, "actual": actual, "pass": match})
        continue

    doc = fitz.open(pdf_path)
    page_idx = entry["bomPage"] - 1

    if page_idx >= len(doc):
        print(f"  Page {entry['bomPage']} out of range (doc has {len(doc)} pages)")
        results.append({"prj": prj, "expected": expected, "actual": "PAGE_ERROR", "pass": False})
        doc.close()
        continue

    page = doc[page_idx]

    quality = simulate_assess_pdf_page_quality(page)
    print(f"  assessPdfPageQuality:")
    print(f"    isScanned:    {quality['isScanned']}")
    print(f"    isMonochrome: {quality['isMonochrome']}")
    print(f"    imageCount:   {quality['imageCount']}")
    print(f"    hasVectorText:{quality['hasVectorText']}")
    print(f"    estimatedDpi: {quality['estimatedDpi']}")
    print(f"    warningLevel: {quality['warningLevel']}")

    whole_page_chars = count_text_chars(page, bom_region=None)
    print(f"  Whole-page text chars: {whole_page_chars}")

    actual = classify(whole_page_chars, quality, has_region=False)
    print(f"  Classifier result (no region): {actual}")
    match = actual == expected
    print(f"  {'PASS' if match else 'FAIL'}: expected={expected}, actual={actual}")

    if not match:
        print(f"  *** MISMATCH ANALYSIS ***")
        if expected == "bitmap" and actual == "scan":
            print(f"    isMonochrome=True caught before imageCount check.")
            print(f"    scan is MORE conservative than bitmap (lower fidelity tier)")
            print(f"    Gate behavior: identical (both vision-mode -> hard block)")
        elif expected != "vector-stroke" and actual == "vector-stroke":
            print(f"    LEAK to vector-stroke - this is a BUG")

    results.append({"prj": prj, "expected": expected, "actual": actual, "pass": match,
                     "quality": quality, "wholePageChars": whole_page_chars})
    doc.close()


print(f"\n\n{'=' * 90}")
print("SUMMARY")
print(f"{'=' * 90}")

pass_count = sum(1 for r in results if r["pass"])
fail_count = len(results) - pass_count
print(f"\nResults: {pass_count} PASS, {fail_count} FAIL out of {len(results)} projects\n")

for r in results:
    status = "PASS" if r["pass"] else "FAIL"
    print(f"  [{status}] {r['prj']}: expected={r['expected']}, actual={r['actual']}")

print(f"\n{'=' * 90}")
print("LOGIC CONCERN ANALYSIS")
print(f"{'=' * 90}")

print("")
print("CONCERN 1: Check-ordering leak (non-monochrome scan -> vector-stroke)")
print("  The classifier checks:")
print("    if (q.isMonochrome && regionTextChars === 0) return 'scan'")
print("    if (q.imageCount >= 2) return 'bitmap'")
print("    default -> 'vector-stroke'")
print("")
print("  A non-monochrome scanned image (DCTDecode, color scan) with imageCount=1 would:")
print("    - Skip 'scan' (not isMonochrome)")
print("    - Skip 'bitmap' (imageCount < 2)")
print("    - Default to 'vector-stroke' <- WRONG")
print("")
print("  The code NEVER checks q.isScanned. Only q.isMonochrome is used for the scan tier.")
print("  Fix: scan check should be (q.isScanned && regionTextChars === 0), not just isMonochrome.")
print("")
print("CONCERN 2: Single-image bitmap (imageCount>=2 threshold)")
print("  If a BOM is ONE large raster image (common for scans), imageCount=1.")
print("  With the >=2 threshold, it falls through to vector-stroke.")
print("  For monochrome images: isMonochrome catches it as 'scan' BEFORE reaching imageCount.")
print("  For non-monochrome single images: LEAKS to vector-stroke (see Concern 1).")
print("  Fix: threshold should be imageCount >= 1, or combine with isScanned check.")
