# Fix plan — bcFuzzyLookup misses in-BC parts the Item Browser finds

**Status:** OPEN · MED · plan ready for Jon's approval (2026-07-30). Money-path (auto-apply site) — do NOT build cold; needs Jon go.

**Symptom:** parts that ARE in BC (the manual BC Item Browser search finds them) are NOT matched by the automatic `bcFuzzyLookup` during extraction. Real case: `800F-34RE100` → debug log "scanned 0 prefix candidates".

## Root cause (Coach trace, all `src/app.jsx`)

`bcFuzzyLookup` (5740) runs 5 steps, first hit wins:
- Steps 1–4 query only the `/items` REST `number` field (= BC `No`). If the recognizable catalog number lives in `Vendor_Item_No`/`Common_Item_No` (classic Allen-Bradley: `No` is an internal SKU), steps 1–4 are structurally blind to it.
- Step 5 (the only step that reaches Vendor_Item_No/Common_Item_No) derives `prefix = stripped.slice(0,5)` from the **punctuation-stripped** PN, then fires `startswith(field, prefix)` against **raw, punctuation-bearing** BC fields. For `800F-34RE100`, `stripped="800F34RE100"` → `prefix="800F3"`, but BC stores `800F-…` (5th char is `-`) → `startswith(...,'800F3')` can never match → **0 candidates**. Defeats any PN with a separator in the first 5 chars (`800F-`, `1756-`, `440R-`, `700-`, …).

The **Item Browser** succeeds because it uses `bcSearchItems(query,{field:"both"})` — `contains()` (not `startswith`) on the **raw** string across 7 ItemCard fields incl. Vendor_Item_No.

## Recommended fix (ranked)

**Fix 1 (PRIMARY, lowest-risk):** add one step after step 4 that calls the already-trusted `bcSearchItems(pn,{field:"both",top:10})` (the Item Browser's own path). Accept as an **auto-match** ONLY when exactly one result passes the existing exact normalized-equality gate (`localNorm(x)===wantNorm`, 5803–5808) against number/_vendorItemNo/_commonItemNo. If multiple pass or matches are substring-only → return as **suggestions** (held for review at 16887–16888), never auto-applied. Runs only for rows that fell through steps 1–4 (rare). Reuses a production-proven path; no new false-positive auto-apply risk; modest BC cost.

**Fix 2 (SECONDARY, follow-up):** repair step 5's prefix — use the leading alphanumeric run of the raw PN (floored ~3, capped ~4: `800F-34RE100`→`800F`) instead of `slice(0,5)`. Recovers punctuation-*differs* cases. Cost caveat: a 3-char prefix can exceed `$top=200` on a large catalog — raise cap / prefer 4-char run; keep gated to post-step-4 misses (BC throttles hard).

**Money-path guardrail:** never relax the exact-normalized-equality auto-apply gate; ambiguous/substring hits stay review-only suggestions.

**Verify before closing:** with BC connected, `bcFuzzyLookup('800F-34RE100')` returns a single `match`; candidate counts stay bounded (no `800`-family flood); an intentionally ambiguous PN returns held `suggestions`, not an auto-applied price.
