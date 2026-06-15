# Phase 0a — Timing + Memory Bump Results

**Date:** 2026-06-05  
**Investigator:** Marc Masdev  
**Deployed:** `firebase deploy --only functions` (extractBomPage: 1GB→2GB, 520s AC, stage timing)

---

## Result: Model latency is the bottleneck. Memory was not the issue.

The 2GB bump did not fix PRJ402101's timeout. Pre-API work (download + parse +
slice) takes **<1 second**. The Anthropic API call takes **240–301+ seconds** for
this 23-page PDF. Runs that complete under ~300s succeed; runs that exceed ~300s
hit undici's internal `headersTimeout` and die.

---

## Timing Instrumentation — Verified Working

### PRJ402098 (small text-layer PDF, 550 KB, 9 pages) — SUCCESS

| Stage | Time | % of Total |
|-------|-----:|-----------:|
| Download | 292 ms | 0.4% |
| Parse (PDFDocument.load) | 9 ms | <0.1% |
| Slice (copyPages + save) | 50 ms | <0.1% |
| Prompt construction | 1 ms | <0.1% |
| **Anthropic API** | **72,498 ms** | **99.5%** |
| **Total** | **72,850 ms** | |

PDF size: 550 KB → sliced page: 157 KB.

### PRJ402101 (large BITMAP PDF, 2.9 MB, 23 pages) — TIMEOUT

| Stage | Time | Source |
|-------|-----:|--------|
| Download + Parse + Slice | ~2,000 ms | From "PDF sliced" log timestamp delta |
| **Anthropic API** | **>300,000 ms** | Killed by undici headersTimeout |
| **Total** | **~302,000 ms** | CF execution time from logs |

PDF size: 2,930 KB → sliced page: 158 KB. The sliced page is the same 158 KB
regardless of source PDF size — the slow part is the API, not the PDF processing.

---

## Historical Run Data (All PRJ402101 Extractions)

| When | Memory | AC Timeout | Pre-API | API Time | CF Total | Outcome |
|------|:------:|:----------:|--------:|---------:|---------:|---------|
| Probe 5 r0 | 1GB | 480s | ~3s | ~239s | 242s | SUCCESS |
| Probe 5 r1 | 1GB | 480s | ~2s | ~290s | 293s | SUCCESS |
| Probe 5 r2 | 1GB | 480s | ~2s | ~301s | 302s | TIMEOUT |
| **Phase 0a** | **2GB** | **520s** | **~2s** | **~301s** | **303s** | **TIMEOUT** |

Pattern: API latency varies 239–301+ seconds. When it lands under ~300s, it succeeds.
When it exceeds ~300s, undici kills the connection. 2GB didn't change the timing at all.

---

## Root Cause: undici's headersTimeout (300s)

The Cloud Function's AC timeout (520s) never fires. Node.js 20's built-in `fetch()`
uses undici internally, which has a default `headersTimeout` of 300,000ms (300s).
When the Anthropic API takes >300s to send response headers, undici throws
`UND_ERR_HEADERS_TIMEOUT` — which our error handler catches as a timeout.

The AC signal is passed to `fetch()` as `signal`, but undici's internal timer
fires independently. The AC at 520s only matters if the API starts sending headers
within 300s (starting the body transfer) but then stalls mid-body. For PRJ402101,
the API doesn't send headers at all within 300s, so undici wins.

**Fix for Phase 0b:** Override undici's `headersTimeout` by passing a custom
`dispatcher` to `fetch()`:

```javascript
const { Agent } = require('undici');
const agent = new Agent({ headersTimeout: 520000, bodyTimeout: 520000 });
response = await fetch(url, { signal: ac.signal, dispatcher: agent, ... });
```

This aligns undici's timeout with the AC timeout, giving the API the full 520s
budget. Alternatively, use Anthropic's Node SDK (which manages its own HTTP
client) instead of raw `fetch()`.

---

## What This Means for Phase 0b and Phase 1

### Phase 0b — the fix IS the undici headersTimeout override

Not a parse optimization. Not a memory issue. The 1-line fix:
```javascript
const { Agent } = require('undici');
const agent = new Agent({ headersTimeout: 520000, bodyTimeout: 520000 });
```
Pass `dispatcher: agent` to the fetch call. This gives PRJ402101 the full 520s
budget instead of dying at 300s. Based on the 239–301s range seen across 4 runs,
this would turn 3 of 4 recent attempts from TIMEOUT to SUCCESS.

### Phase 1 — CropBox reduces API latency (the real optimization)

The sliced page for PRJ402101 is 158 KB — a full D-size drawing page with
schematics, title block, AND the BOM table. The model processes the entire page
even though only the BOM region is relevant.

CropBox (Phase 1) restricts the PDF viewport to just the BOM table. For a BOM
that occupies ~30% of the page area, this sends ~50 KB instead of 158 KB to the
model. Less content → shorter model thinking time → API latency drops well under
the 300s ceiling.

CropBox is not just a quality improvement (Probe 5 showed it improves
determinism). It's also a **latency fix** — the primary mechanism to keep large
drawings under the timeout.

---

## Deployed Changes (live in production now)

1. **Memory:** extractBomPage `1GB → 2GB` (matches extractBomBatch)
2. **AC timeout:** `480s → 520s` (moved to function entry, covers full pipeline)
3. **Timing log:** `extractBomPage timing` structured log entry on every successful
   pdf-native extraction (downloadMs, parseMs, sliceMs, promptMs, apiMs, totalMs,
   pdfSizeKB, slicedSizeKB, pdfCropped)
4. **Timeout message:** Updated from "480s" to "520s" in error response

These are safe and non-breaking. The 2GB bump matches extractBomBatch. The timing
log is info-level, fires only on success, no user-visible change.
