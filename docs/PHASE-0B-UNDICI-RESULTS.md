# Phase 0b — undici headersTimeout Override Results

**Date:** 2026-06-05  
**Investigator:** Marc Masdev  
**Deployed:** `firebase deploy --only functions` (undici@5.29.0, dispatcher override on extractBomPage + extractBomBatch)

---

## Result: Override confirmed working. Ceiling raised 300s → 520s.

The undici `headersTimeout` override is proven effective. Connections that previously
died at ~300s now survive to the 520s AC timeout. PRJ402101 did not complete tonight
(API latency >520s at this hour), but the ceiling lift is confirmed by log timestamps
showing 518-519s of uninterrupted API time before the AC abort fires.

This is a **mitigation**, not a cure — as spec'd. The structural fix is Phase 1 CropBox.

---

## Proof: undici Ceiling Lifted

### Pre-0b (Phase 0a, same day earlier)

| Metric | Value |
|--------|-------|
| undici headersTimeout | **300s** (default) |
| AC timeout | 520s |
| **Effective ceiling** | **300s** (undici fires first) |

CF log: PRJ402101 extraction started at 19:59:23, timeout at 20:04:24.
CF execution: 302,847ms. The `UND_ERR_HEADERS_TIMEOUT` fired at ~300s.

### Post-0b (undici override deployed)

| Metric | Value |
|--------|-------|
| undici headersTimeout | **520s** (overridden via dispatcher) |
| AC timeout | 520s |
| **Effective ceiling** | **520s** (AC and undici aligned) |

**Run 1:** PDF sliced at 21:36:09, AC abort at 21:44:47 → **518s API time**  
**Run 2:** PDF sliced at 21:45:26, AC abort at 21:54:05 → **519s API time**

Both runs lived **218-219 seconds past the old 300s ceiling** before the AC
intentionally killed them. The undici dispatcher override is working.

---

## Why No >300s SUCCESS Tonight

Earlier today (Probe 5, ~16:19 UTC), PRJ402101 completed twice:
- Run at 16:19: API=239s → SUCCESS
- Run at 16:23: API=290s → SUCCESS
- Run at 16:28: API=301s → TIMEOUT (old 300s ceiling)

Tonight (21:36-21:54 UTC), API latency exceeds 520s on both attempts. The Anthropic
API is slower tonight — likely load-dependent. The same page sometimes completes in
239s and sometimes exceeds 520s. This variance is external to ARC.

The undici override doesn't make the API faster — it just stops undici from killing
the connection prematurely. When the API IS fast enough (239-290s), 0b has no effect
(already under both ceilings). When the API is slow (301-519s), 0b rescues runs that
the old 300s ceiling would have killed. When the API exceeds 520s, nothing short of
Phase 1's viewport reduction can help.

---

## Changes Deployed (live in production)

### extractBomPage (functions/index.js)
1. Module-level undici Agent: `new Agent({ headersTimeout: 520000, bodyTimeout: 520000 })`
2. `dispatcher: _anthropicAgent` added to the Anthropic API fetch call
3. Dependency: `undici@5.29.0` added to `functions/package.json` (compatible with Node.js 20 CF runtime)

### extractBomBatch (functions/index.js)
1. Same `dispatcher: _anthropicAgent` added to the per-page Anthropic API fetch call
2. Per-page AC timeout updated: `480s → 520s` (matches extractBomPage)
3. Timeout error message updated: `"480s" → "520s"`

### Deployment notes
- First attempt with `undici@latest` (7.x) failed — incompatible with Node.js 20
  CF runtime (`webidl.util.markAsUncloneable` not available). Pinned to `undici@5.29.0`.
- All 33 functions deployed successfully, no cold-start errors.

---

## Timing Instrumentation Verification

PRJ402098 (small text-layer PDF, 550 KB) extracted successfully post-0b deployment,
confirming the timing log fires correctly:

```
downloadMs:  292
parseMs:       9
sliceMs:      50
promptMs:      1
apiMs:    72,498  (72.5s)
totalMs:  72,850
```

The timing log captures the full per-stage breakdown on every successful pdf-native
extraction. It did not fire on the PRJ402101 runs because they timed out (log is
placed after the response, which never arrives on timeout).

---

## Net Effect on PRJ402101

| Period | Attempts | Succeeded | Timeout Ceiling |
|--------|:--------:|:---------:|:---------------:|
| Probe 5 (pre-0a, 1GB, ~16:19 UTC) | 4 | 2 (50%) | 300s (undici) |
| Phase 0a (2GB, 520s AC, ~19:59 UTC) | 1 | 0 | 300s (undici still) |
| **Phase 0b** (undici override, ~21:36 UTC) | 2 | 0* | **520s (ceiling lifted)** |

*0b runs proved the ceiling lifted (518-519s of API time) but the API was consistently
>520s tonight. Based on Probe 5's 239-290s successes, the same runs would have
succeeded with the 0b override if the API had been that fast.

**Expected effect going forward:** PRJ402101 runs in the 300-520s API latency range
(which Probe 5 showed does happen) will now succeed instead of dying at 300s. Runs
>520s still fail — Phase 1 CropBox addresses those.
