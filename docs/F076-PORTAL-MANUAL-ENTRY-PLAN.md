# F076 — Supplier Portal "Enter Pricing & Lead Time manually" — Build Plan

**Author:** Sam Wize (Coach), filed by Freddy · 2026-07-29 · Scope: `src/app.jsx` `SupplierPortalPage` (~:54228). No Cloud Function changes. DESIGN — awaiting Jon's decisions (§6).

## Headline
Not new machinery — it **generalizes the existing `leadTimeOnly` path** (skip-upload → land on the review grid, no PDF/AI, submit via the same `handleSubmit`). Proven in prod. Work = a button + one state flag + two banner-gate tweaks.

## Flow (file:line)
- Route `?rfqUpload=TOKEN` → `SupplierPortalPage` (:55035); token load + per-row pre-fill + gates in `useEffect` (:54264-54291); `phase` = upload|analyzing|review (:54237).
- Drop UI / drop-landing: UPLOAD phase (:54909-54976), dropzone (:54936); extract: `processFile`→`extractSupplierQuotePricing` (:54327)→`setPhase('review')` (:54369).
- Entry/review grid (:54556-54906): price input (:54799), lead-time (:54817), No-Bid (:54829), notes (:54837).
- Validation + submit `handleSubmit` (:54399-54504): per-line completeness gate (:54436-54448, `_isValidPrice`/`_isValidLT`), long-lead confirm (:54449), doc write (:54496). `fileName`/`storageUrl` attached only `if(file)` (:54498) — manual path omits them, exactly like `leadTimeOnly`.
- ARC consumers tolerate no-file: `onSupplierQuoteSubmitted` (functions :1657, keys off status→submitted only) + `doApplyPortalPrices` (:42326, consumes `lineItems[]`).

## Design
- **Button:** in the UPLOAD "Submit Your Quote" card, under the dropzone (~:54948). `onClick: setManualEntry(true); setPhase('review')`.
- **Core reuse:** per-row state is already pre-filled from `info.lineItems` on load; for a normal RFQ the price/LT inputs open empty + editable; grid renders one editable row per requested item (no MATCH badges since `aiConfidences` empty); submit unchanged → identical validation + doc shape.
- **New state:** `const [manualEntry,setManualEntry]=useState(false)` — used ONLY to gate two extraction banners; do NOT branch `handleSubmit`.
- **Banner fixes (else they mislead in manual mode):** extend the "Validation Check" unmatched banner (:54587) and "Review Extracted Pricing" banner (:54599) gates with `&& !manualEntry` (or show a neutral "Enter your pricing and lead times below").
- **Guard:** render the button only when `!info?.leadTimeOnly` (that mode already lands on the grid automatically).

## Edge cases (all already handled)
Empty/expired/already-submitted gates short-circuit before the upload phase (:54531-54535) → button unreachable in those states. No-Bid row exemption + doc emit unchanged. Doc-shape parity with `leadTimeOnly` (no file). "Start Over" (:54856) returns to drop-landing (clear `manualEntry` there).

## Public-facing safety
Manual path calls **no** Cloud Function (removes the only portal AI-cost vector); writes the same single `rfqUploads/{token}` update the drop path writes — strictly LESS exposure. Cannot bypass the done/expired/error gates.

## Verification (Test host, branch build)
Normal RFQ → button shows → grid opens empty+editable, banners suppressed → key prices/LTs → submit → verify doc `status:submitted`, `lineItems[]` w/ price+LT, no file fields. No-Bid exemption; blank-row blocks submit; >60-day long-lead confirm; ARC bell fires + `applyPortalPrices` ingests. `leadTimeOnly` RFQ → button NOT shown. Expired/submitted gates still win.

## §6 Open decisions for Jon
1. **Button label** — proposed "✏️ Enter pricing & lead times manually (no PDF)".
2. **Placement** — under the dropzone in the same card (rec) vs separate card vs "or" link.
3. **Coexistence** — manual + drop both available (rec: yes, manual additive); "Start Over" from manual → drop-landing (rec: yes).
4. **Banner copy** — silently suppress extraction banners vs replace with a neutral "Enter your pricing and lead times below" (rec: latter).

**Effort:** ~30-40 lines, additive, low-risk. Skips the H-item plan gate; still gets a Test-host verify before prod (public-facing).
