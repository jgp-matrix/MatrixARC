import fitz
import os

pdf_dir = os.path.join(os.path.dirname(__file__), "pdfs")

# Check PRJ402113 page 5 (3468 chars, 348 lines) - possible parts schedule
doc = fitz.open(os.path.join(pdf_dir, "PRJ402113.pdf"))
page = doc[4]  # 0-indexed = page 5
text = page.get_text("text")
lines = [l.strip() for l in text.split("\n") if l.strip()]
print("="*60)
print("PRJ402113 Page 5 (348 lines) — full text content:")
print("="*60)
for i, line in enumerate(lines):
    print(f"  {i+1:3d}: {line}")

# Also check PRJ402113 page 2 (2432 chars) and PRJ402101 page 2 (2491 chars)
print("\n" + "="*60)
print("PRJ402113 Page 2 (2432 chars) — first 30 lines:")
print("="*60)
page2 = doc[1]
text2 = page2.get_text("text")
lines2 = [l.strip() for l in text2.split("\n") if l.strip()]
for i, line in enumerate(lines2[:30]):
    print(f"  {i+1:3d}: {line}")

doc.close()

doc2 = fitz.open(os.path.join(pdf_dir, "PRJ402101.pdf"))
print("\n" + "="*60)
print("PRJ402101 Page 2 (2491 chars) — first 30 lines:")
print("="*60)
page2b = doc2[1]
text2b = page2b.get_text("text")
lines2b = [l.strip() for l in text2b.split("\n") if l.strip()]
for i, line in enumerate(lines2b[:30]):
    print(f"  {i+1:3d}: {line}")
doc2.close()
