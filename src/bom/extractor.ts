// ─── BOM Extraction ──────────────────────────────────────────────────────────
// Extract BOM items from drawing page images using the Anthropic API.

import { ANTHROPIC_API_URL, ANTHROPIC_VERSION } from '@/core/constants';
import { getApiKey } from '@/services/anthropic/client';
import { apiCall } from '@/services/anthropic/client';
import { resizeImage } from '@/scanning/pdfExtractor';

// ─── BOM Extraction Prompt ──────────────────────────────────────────────────

const BOM_PROMPT = `You are an expert at reading UL508A industrial electrical control panel drawings.

TASK: Extract every line item from the BOM table on this drawing page.

STEP 1 — ANALYZE THE TABLE STRUCTURE FIRST:
Before extracting anything, carefully examine:
• All column headers exactly as printed
• Total number of data rows in the table (count them)
• Any multi-line cells, merged cells, or continuation rows
• Whether rows continue from a previous page (no header row visible)

STEP 2 — MAP COLUMNS:
• itemNo      → ITEM, Item #, Item No., LINE, Line #, No., or leftmost sequential number column
• qty         → QTY, Quantity, Qty., EA, Each
• partNumber  → "MFG/PART NO.", "Part No.", "Part #", "Cat. No.", "Catalog No.", "Model No.",
                "Order No.", "Product No.", "Stock No." — values are alphanumeric catalog codes
• manufacturer → Manufacturer, MFG, Brand, Make
• notes       → TAG, Tag No., Ref, Reference, Device ID — contains ref designators (CB1, M2, OL1…)
• description → Description, Item Description, Function, Material Description

STEP 3 — EXTRACT EVERY ROW (no skipping):
• Multi-line cells: if text wraps to the next printed line, it is ONE row — keep it as one item
• itemNo: copy exact value printed. Use "" if no item number column exists
• NEVER invent or use sequential row counts (1,2,3…) as partNumber values
• Blank / "—" / "N/A" in part number column → partNumber: ""
• Manufacturer prefix in part number cell: split it
  e.g. "SAGINAW SCE-24EL20X10SSLP" → manufacturer:"SAGINAW", partNumber:"SCE-24EL20X10SSLP"
  e.g. "ABB AF09-30-10-13" → manufacturer:"ABB", partNumber:"AF09-30-10-13"
• Multiple catalog codes in ONE cell (comma- or slash-separated): output a SEPARATE row for each
  e.g. "ABB KXTBRHEBFP, OXP10X225, OH865L10B" → three rows, each with same qty/manufacturer/notes
  First row: original description unchanged
  Each extra row: append " (sub-part)" to description
• Reference designators (CB1, M1, OL2, PB3, SS1…) → notes field only, never partNumber
• Include ALL data rows even when some fields are blank — only skip: column header row, totals rows, title block text, revision block rows

STEP 4 — CHARACTER ACCURACY (most critical step):
Industrial part numbers are alpha-numeric codes where a SINGLE wrong character makes the part unfindable. You MUST verify each character individually by examining its actual glyph shape — do NOT rely on context or guessing.

LETTER vs DIGIT confusion matrix — examine stroke shape carefully:
• O vs D: O is a closed oval, symmetric left-right. D has a flat vertical stroke on the LEFT side. If the left side is straight/flat → it is D. If both sides are curved → it is O.
• O vs 0 (zero): In engineering drawings, 0 often has a slash through it or is narrower. O is a smooth wider oval. When a character appears in an otherwise all-digit sequence, it is likely 0. When in an all-letter sequence, likely O.
• B vs 8: B has flat vertical stroke on the LEFT side (like D). 8 is fully rounded on both sides with no flat edge. If left side is straight → B. If symmetric curves → 8.
• S vs 5: S has two curves flowing into each other. 5 has a sharp horizontal top stroke and angular middle. Look for the flat horizontal bar at top → 5.
• I vs 1 vs l (lowercase-L): 1 often has a flag/serif at top and/or a base serif. I may have serifs top and bottom. In part numbers, prefer 1 in numeric context and I/L in alpha context.
• 2 vs Z: 2 has a curved top; Z has a straight diagonal with flat horizontal bars top and bottom.
• 6 vs G: 6 curves inward at center; G has a horizontal bar protruding inward at right-center.
• U vs V: U has a curved bottom; V comes to a sharp point.
• C vs G: C is open on the right; G has a horizontal bar at mid-right.
• Q vs O: Q has a small tail or crossbar at bottom-right; O does not.

ADDITIONAL ACCURACY RULES:
• Hyphens matter: "100-C09D10" is different from "1OOC09D10" — note how O/0 confusion changes meaning
• When a part number contains a mix of letters and digits, use the surrounding pattern to disambiguate: e.g. in "ABB AF09-30-10-13", the "AF" section is clearly letters, "09" is digits
• Manufacturer names provide format clues — e.g. Allen-Bradley (Rockwell) uses patterns like "100-C09D10", "1489-M1C050"; Hoffman uses "A-12N12ALP"; ABB uses "AF09-30-10-13"
• If two adjacent characters could be read as "OD" or "0D" or "OO" or "00", zoom in mentally on each glyph and check for the flat left edge (D) vs curved (O/0)
• NEVER assume or autocomplete a part number — if a character is genuinely unreadable, transcribe your best interpretation based on glyph shape alone
TRANSCRIBE EXACTLY what is printed — do NOT autocomplete, normalize, or guess part numbers

DUPLICATE PART NUMBERS: If the same part number appears on multiple rows in the BOM table, combine them into ONE item with the total quantity summed. For example, if "QD100X300HW" appears 3 times each with qty 1, return ONE item with qty 3. Do NOT return separate rows for the same part number.

QUANTITY "A/R" or "AR": If a BOM row shows quantity as "A/R", "AR", "As Required", or "As Req'd", this means the panel shop uses whatever length/amount is needed. Set qty to 1 for these items.

RETURN FORMAT:
Output ONLY a valid JSON object — no markdown, no explanation. Format:
{"items":[...],"questions":[...]}

Each item in the "items" array must have exactly:
{"itemNo":"","qty":1,"partNumber":"","description":"","manufacturer":"","notes":"","y_top":0.0,"y_bottom":0.0,"x_left":0.0,"x_right":1.0}

y_top and y_bottom are the top and bottom edges of this row as fractions of the total image height (0.0=top, 1.0=bottom). Be precise.
x_left and x_right are the left and right edges of the entire BOM TABLE (all columns) as fractions of the total image width. Exclude any schematic diagram, layout drawing, or whitespace to the left of the table — crop to where the BOM table columns begin and end. All rows on the same page share the same x_left/x_right values.

QUESTIONS — You MUST include questions in the "questions" array (up to 5 per page) for ANY of these situations:
1. Any character in a part number that could be two different characters (O/D, O/0, B/8, S/5, etc.)
2. Abbreviations or shortened manufacturer names you're not 100% sure about
3. Rows where it's unclear if something is a BOM line item or a note/header/subtotal
4. Part numbers that seem unusual or don't match typical patterns for the stated manufacturer
5. Quantities that seem unusually high or low for the type of component
6. Any cell where text is partially obscured, cut off, or hard to read

Each question: {"rowRef":"item # or part number","question":"What is unclear","options":["possible answer A","possible answer B"]}

Examples:
• {"rowRef":"Item 5","question":"Part number reads as 'E5CS-R1KJX-52O' — is the last character the letter O or the digit 0 (zero)?","options":["Letter O (E5CS-R1KJX-52O)","Digit 0 (E5CS-R1KJX-520)"]}
• {"rowRef":"100-C09D10","question":"Character 8 could be letter D or digit 0 — which is correct?","options":["100-C09D10 (letter D)","100-C09010 (digit zero)"]}
• {"rowRef":"Row 12","question":"This row has no part number but references 'WIRE 14AWG'. Is this a BOM item to include or a general note?","options":["Include as BOM item","It's a note, skip it"]}
• {"rowRef":"Item 8","question":"Manufacturer cell shows 'SQD' — is this Square D (Schneider Electric)?","options":["Yes, Square D","No, different manufacturer"]}

It is BETTER to ask too many questions than too few. If you made your best guess on an ambiguous character, STILL ask the user to confirm.
You MUST return AT LEAST 3 questions per page. Even if you are fairly confident, pick the 3 most ambiguous items and ask about them. Return fewer than 3 ONLY if the page has fewer than 3 BOM rows total.

IMPORTANT: You MUST return the wrapper object format: {"items":[...],"questions":[...]}
Do NOT return a bare JSON array. Always wrap in the object with both keys.

FINAL REMINDER — QUESTIONS ARE MANDATORY:
The "questions" array MUST contain at least 3 entries (unless the page has fewer than 3 BOM rows). For each question, ask about any character ambiguity, unusual abbreviation, or suspicious value. If you cannot find 3 genuinely ambiguous items, pick the 3 items you are LEAST confident about and ask a confirmation question. An empty questions array when 3+ BOM rows exist is WRONG.

If no BOM table exists on this page, return {"items":[],"questions":[]}.`;

// ─── Types ──────────────────────────────────────────────────────────────────

interface BomExtractItem {
  itemNo: string;
  qty: number;
  partNumber: string;
  description: string;
  manufacturer: string;
  notes: string;
  y_top?: number;
  y_bottom?: number;
  x_left?: number;
  x_right?: number;
}

interface BomQuestion {
  rowRef: string;
  question: string;
  options: string[];
  pageName?: string;
}

interface ExtractionResult {
  items: BomExtractItem[];
  questions: BomQuestion[];
}

interface ExtractionUnit {
  dataUrl: string;
  regionNote: string | null;
}

interface PageRegion {
  type: string;
  label?: string;
  note?: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

// ─── Crop Region From Image ─────────────────────────────────────────────────

/**
 * Crop a region from an image using normalized coordinates (0-1).
 */
export function cropRegionFromImage(dataUrl: string, region: PageRegion): Promise<string | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const W = img.naturalWidth;
      const H = img.naturalHeight;
      const sx = Math.round(region.x * W);
      const sy = Math.round(region.y * H);
      const sw = Math.round(region.w * W);
      const sh = Math.round(region.h * H);
      if (sw < 10 || sh < 10) { resolve(null); return; }
      const canvas = document.createElement('canvas');
      canvas.width = sw;
      canvas.height = sh;
      canvas.getContext('2d')!.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
      resolve(canvas.toDataURL('image/jpeg', 0.92));
    };
    img.onerror = () => resolve(null);
    img.src = dataUrl;
  });
}

// ─── Get Extraction Units ───────────────────────────────────────────────────

/**
 * Build extraction units from a page — if BOM regions exist, crop them;
 * otherwise use full page.
 */
export async function getExtractionUnits(pg: any): Promise<ExtractionUnit[]> {
  const regions = (pg.regions || []).filter((r: any) => r.type === 'bom');
  if (!regions.length) return [{ dataUrl: pg.dataUrl, regionNote: null }];
  const units: ExtractionUnit[] = [];
  for (const r of regions) {
    const cropped = await cropRegionFromImage(pg.dataUrl, r);
    if (cropped) units.push({ dataUrl: cropped, regionNote: r.note || null });
  }
  return units.length ? units : [{ dataUrl: pg.dataUrl, regionNote: null }];
}

// ─── Build Region Context ───────────────────────────────────────────────────

/**
 * Build region annotation context string for extraction notes.
 */
export function buildRegionContext(pages: any[]): string {
  const hints: string[] = [];
  for (const pg of pages) {
    if (!pg.regions?.length) continue;
    const descs = pg.regions
      .filter((r: any) => r.note || r.type !== 'bom')
      .map((r: any) => {
        const label = r.label || r.type;
        const pos = `${Math.round(r.x * 100)}%-${Math.round((r.x + r.w) * 100)}% horizontal, ${Math.round(r.y * 100)}%-${Math.round((r.y + r.h) * 100)}% vertical`;
        return `• ${label}${r.note ? ' — ' + r.note : ''} (${pos})`;
      });
    if (descs.length) hints.push(`${pg.name || 'Page'}:\n${descs.join('\n')}`);
  }
  return hints.length ? '\n\nREGION ANNOTATIONS FROM USER:\n' + hints.join('\n') : '';
}

// ─── Extract BOM Page ───────────────────────────────────────────────────────

/**
 * Extract BOM items from a single drawing page image.
 * Calls the Anthropic API with extended thinking for structured BOM extraction.
 */
export async function extractBomPage(
  dataUrl: string,
  feedback = '',
  userNotes = ''
): Promise<ExtractionResult> {
  const small = await resizeImage(dataUrl, 2400); // BOM needs higher res for small text
  const b64 = small && small.split(',')[1];
  if (!b64) {
    console.warn('extractBomPage: skipping — empty or invalid dataUrl');
    return { items: [], questions: [] };
  }

  const feedbackSection = feedback
    ? `\n\nCORRECTION INSTRUCTIONS FROM USER:\n${feedback}\nApply these corrections carefully and exactly as described.`
    : '';
  const notesSection = userNotes
    ? `\n\nUSER NOTES ABOUT THESE DRAWINGS:\n${userNotes}\nKeep these notes in mind while extracting. They describe specific characteristics of this drawing set.`
    : '';

  const key = getApiKey();
  if (!key) throw new Error('No Anthropic API key set');

  // Use extended thinking so Claude reasons through the table structure before extracting
  const resp = await fetch(ANTHROPIC_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': key,
      'anthropic-version': ANTHROPIC_VERSION,
      'anthropic-beta': 'interleaved-thinking-2025-05-14',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 16000,
      thinking: { type: 'enabled', budget_tokens: 4000 },
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: b64 } },
          { type: 'text', text: BOM_PROMPT + feedbackSection + notesSection },
        ],
      }],
    }),
  });

  const d = await resp.json();
  if (!resp.ok) throw new Error(d.error?.message || 'API error');
  if (d.stop_reason === 'max_tokens') {
    console.warn('BOM extraction: response TRUNCATED (hit max_tokens limit) — some items may be lost');
  }

  // Find the text block (thinking blocks come first)
  const raw = (d.content || []).find((b: any) => b.type === 'text')?.text || '';
  console.log('BOM extraction response:', raw.length, 'chars, stop_reason:', d.stop_reason);

  try {
    const cleaned = raw.replace(/```json|```/gi, '').trim();
    let items: any[] = [];
    let questions: any[] = [];

    // Strategy 1: Try direct JSON.parse (works when AI returns clean JSON)
    try {
      const direct = JSON.parse(cleaned);
      if (direct && Array.isArray(direct.items)) {
        items = direct.items;
        questions = direct.questions || [];
        console.log('BOM extraction: direct parse OK,', items.length, 'items,', questions.length, 'questions');
      } else if (Array.isArray(direct)) {
        items = direct;
        console.log('BOM extraction: direct parse bare array,', items.length, 'items');
      }
    } catch { /* not clean JSON, try extraction */ }

    // Strategy 2: Find wrapper object {"items":[...],"questions":[...]}
    if (!items.length) {
      const wStart = cleaned.indexOf('{"items"');
      if (wStart !== -1) {
        let depth = 0;
        let endIdx = -1;
        for (let i = wStart; i < cleaned.length; i++) {
          if (cleaned[i] === '{') depth++;
          if (cleaned[i] === '}') { depth--; if (depth === 0) { endIdx = i; break; } }
        }
        if (endIdx > wStart) {
          try {
            const parsed = JSON.parse(cleaned.slice(wStart, endIdx + 1));
            items = parsed.items || [];
            questions = parsed.questions || [];
            console.log('BOM extraction: wrapper parse OK,', items.length, 'items,', questions.length, 'questions');
          } catch (e2: any) { console.warn('Wrapper parse failed:', e2.message); }
        }
      }
    }

    // Strategy 3: Bare array fallback
    if (!items.length) {
      const arrMatch = cleaned.match(/\[[\s\S]*\]/);
      if (arrMatch) {
        try { items = JSON.parse(arrMatch[0]); } catch (e3: any) { console.warn('Array parse failed:', e3.message); }
        const qMatch = cleaned.match(/"questions"\s*:\s*(\[[\s\S]*?\])/);
        if (qMatch) { try { questions = JSON.parse(qMatch[1]); } catch { } }
        console.log('BOM extraction: array fallback,', items.length, 'items,', questions.length, 'questions');
      } else {
        // Strategy 4: Truncated JSON — extract individual complete item objects
        const itemMatches = [...cleaned.matchAll(/\{"itemNo"[^}]*\}/g)];
        if (itemMatches.length) {
          for (const m of itemMatches) { try { items.push(JSON.parse(m[0])); } catch { } }
          console.log('BOM extraction: salvaged', items.length, 'items from truncated response');
        } else {
          console.warn('No JSON found in response. Raw:', cleaned.slice(0, 200));
          return { items: [], questions: [] };
        }
      }
    }

    if (!questions.length && items.length >= 3) {
      console.warn('BOM extraction: 0 questions returned but', items.length, 'items found — AI should have asked at least 3 questions');
    }

    // Post-process: split any rows where partNumber still contains multiple values
    const expanded: any[] = [];
    for (const item of items) {
      const pn = (item.partNumber || '').trim();
      const segments = pn.split(/\s*\/\s*|\s*,\s*/).map((s: string) => s.trim()).filter((s: string) => s && /[A-Z0-9]{3,}/i.test(s));
      if (segments.length > 1) {
        for (let si = 0; si < segments.length; si++) {
          const base = item.description || '';
          const alreadyLabeled = base.includes('(sub-part from above)');
          const desc = si === 0 ? base : (alreadyLabeled ? base : base + ' (sub-part from above)');
          expanded.push({ ...item, partNumber: segments[si], description: desc });
        }
      } else {
        expanded.push(item);
      }
    }

    // Normalize "A/R" / "AR" / "As Required" quantities to 1
    for (const item of expanded) {
      const q = String(item.qty || '').trim().toUpperCase();
      if (q === 'A/R' || q === 'AR' || q === 'AS REQUIRED' || q === "AS REQ'D" || q === 'A.R.' || q === 'A\\R') {
        item.qty = 1;
      }
    }

    return { items: expanded, questions: questions.slice(0, 5) };
  } catch (e) {
    console.error('JSON parse error:', e, raw);
    return { items: [], questions: [] };
  }
}

// ─── Verify Part Numbers ────────────────────────────────────────────────────

/**
 * AI verification of part numbers — checks if they are real, plausible, or suspect.
 */
export async function verifyPartNumbers(bomRows: any[]): Promise<any[]> {
  const toCheck = bomRows
    .filter((r: any) => (r.partNumber || '').trim().length >= 3)
    .slice(0, 60);
  if (!toCheck.length || !getApiKey()) return [];

  const list = toCheck.map((r: any) => ({
    id: String(r.id),
    pn: (r.partNumber || '').trim(),
    mfr: (r.manufacturer || '').trim(),
    desc: (r.description || '').trim().slice(0, 60),
  }));

  const prompt = `You are verifying industrial/electrical part numbers. For each part number below, determine if it is a real, recognized part number from a known manufacturer.

Rate each as:
- "verified" — recognized real part number (you are confident this exists)
- "plausible" — follows a valid manufacturer part number pattern, likely real
- "suspect" — does not match known part number patterns, may be an OCR misread or invalid

Use the manufacturer and description as context clues. Be strict — if you are not confident the exact part number exists, rate it "plausible" not "verified".

Part numbers to check:
${JSON.stringify(list)}

Return ONLY a JSON array: [{"id":"...","status":"verified|plausible|suspect","note":"brief reason"}]`;

  try {
    const raw = await apiCall({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 4000,
      messages: [{ role: 'user', content: prompt }],
    });
    const m = raw.replace(/```json|```/g, '').trim().match(/\[[\s\S]*\]/);
    if (!m) return [];
    return JSON.parse(m[0]);
  } catch (e) {
    console.error('Part verification failed:', e);
    return [];
  }
}
