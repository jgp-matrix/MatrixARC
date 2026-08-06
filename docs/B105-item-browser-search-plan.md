# B105 — BC Item Browser manual search is dash / special-char sensitive

**Author:** Sam Wize (Coach) · **Date:** 2026-08-05 · **Prod baseline:** v1.24.97
**Status:** BUILD-READY SCOPE (no code written) · **Cross-ref:** F082, B098, B092/B094/B095
**Owner to build:** Marc · **File:** `src/app.jsx` (client-only; no Cloud Function change)

---

## Problem

Searching the BC **Item Browser** for a part whose separators differ from BC's stored
value returns **"No items found"**, even though (a) the item exists in BC and (b) B098's
AUTO surrogate resolver now matches it. Intake examples:

- `6ES7511-1AL03-0AB0` (dash-rich Siemens PN)
- `1492EBL3` (Allen-Bradley PN typed without the dash BC stores)

Jon's rule: *"the Item Browser should search without prejudice (without special characters
too)."* The manual search must find what the auto-resolver finds.

This is the KNOWN **F082 / `bcSearchItems`-parity** follow-up Coach flagged inside the B098
scope — the auto path (`bcFuzzyLookup`, `_bcResolveSurrogateExact`) got the dash-agnostic
treatment; the manual browser path (`bcSearchItems` `field:"both"`) did not.

---

## Root (code-confirmed)

**`bcSearchItems(query,{field,top,skip})` — `src/app.jsx:5719-5816`.** The Item Browser uses
`field:"both"` (caller at `:25790`). That branch (`:5753-5807`) does:

1. Tokenize the query on **whitespace/comma only** — `query.trim().split(/[\s,]+/)` (`:5728`).
   A part number like `6ES7511-1AL03-0AB0` is **one token** — dashes are *not* split.
2. Pick the longest token as `primary` (`:5770-5771`).
3. Fire a 7-field parallel ItemCard fan-out with the token passed **verbatim** into
   `contains()` — `ITEM_CARD_FIELDS.map(f=>_bcFetchItemsViaItemCard(\`contains(${f},'${...primary...}')\`,...))`
   (`:5774-5778`), fields = `No, Description, Description_2, Search_Description,
   Vendor_Item_No, Common_Item_No, Manufacturer_Code`. Number fields are only **uppercased**
   (B063, `:5749-5750`, `:5777`) — never separator-normalized.
4. Union candidates, client-side filter remaining tokens by raw `haystack.includes(tok)`
   (`:5788-5800`), sort by `No`, slice to `top` (`:5804-5807`).

**Why it misses (root):** OData `contains(field,'6ES7511-1AL03-0AB0')` is a *literal substring*
match. BC cannot normalize its own stored value server-side (confirmed by the same
constraint documented at `:5897-5900` and `:5985` — "OData `contains()` can't normalize BC's
side"). When BC stores the part with separators in **different positions** than the typed
token (e.g. BC `6ES75111AL03-0AB0` vs typed `6ES7511-1AL03-0AB0`), or when the user **omits**
a separator BC stores (typed `1492EBL3` vs BC `1492-EBL3`), the verbatim `contains()` never
matches and every one of the 7 fields returns 0 → "No items found." The client-side filter
(`:5799`) is *also* raw (`haystack.includes`), so it cannot rescue the miss either.

The `field:"number"`/`field:"displayName"` branches (`:5809-5814`) have the identical
verbatim-`contains` limitation, but the Item Browser default and Jon's repro are the
`field:"both"` path, which is what this plan fixes.

---

## The B098 technique to reuse (do NOT reinvent)

Shipped in `_bcResolveSurrogateExact` (`src/app.jsx:5991-6029`) and mirrored in
`bcFuzzyLookup` steps 4b/5 (`:5876-5956`). Two reusable primitives:

1. **Separator normalizer (SSOT candidate).** Byte-identical at two sites today:
   - `localNorm` — `:5830`: `(s||"").replace(/[-\s\/\\.#_]+/g,"").toUpperCase()`
   - `_norm` — `:5996`: same expression exactly.
   Strips `- \ / . # _` + whitespace, upper-cases.

2. **Alphanumeric-run anchors + client-side normalized compare** — `_bcResolveSurrogateExact`
   `:6000-6015`:
   - Step 1: raw `contains` fast path — `bcSearchItems(raw,{field:"both",top:25})` (`:6001`).
   - Step 2 (fallback): `const anchors=[...raw.matchAll(/[A-Za-z0-9]+/g)].map(m=>m[0])
     .filter(a=>a.length>=4).sort((a,b)=>b.length-a.length).slice(0,3)` (`:6008`). Each
     maximal alphanumeric run is **separator-free**, so it survives as a contiguous
     `contains()` substring even when BC's dashes sit elsewhere. Longest first, union
     candidates, **early-exit** the moment the normalized gate passes (`:6009-6013`).
   - Gate: `_norm(it.number)===want || _norm(it._vendorItemNo)===want || _norm(it._commonItemNo)===want`
     (`exactsNow()`, `:5999`).

   `bcFuzzyLookup` uses the same idea plus a `startswith(prefix)` candidate pass on the
   first-5 stripped chars (`:5911-5932`) and the same normalized-equality client filter
   (`:5927-5929`).

**Key adaptation for B105:** the auto path gates on normalized **EQUALITY** (one deterministic
answer to auto-bind). The Item Browser is a **discovery** surface — it must gate on normalized
**CONTAINS** so partial PN searches (`6ES7511`) keep working and a full PN returns the item.
Normalized-contains is a strict superset of both today's verbatim `contains` *and* the auto
path's normalized-equality, so it can only *add* recall.

---

## Fix (build to this)

Client-only change in `src/app.jsx`. Three parts.

### 1. Factor the normalizer into one module-level helper (SSOT)

Per CLAUDE.md "factor the rule, not the inputs," add near the other BC helpers:

```js
// SSOT separator-normalizer for BC part# matching (was duplicated as localNorm @5830 / _norm @5996).
function _bcNormPn(s){return (s||"").toString().replace(/[-\s\/\\.#_]+/g,"").toUpperCase();}
```

Repoint `localNorm` (`:5830`) and `_norm` (`:5996`) at `_bcNormPn` (keep the local `const`
aliases if that minimizes diff churn; the expression must not drift). This is a no-behavior-
change refactor and is the SSOT the B105 pass will call.

### 2. Add an OPT-IN normalized fallback to `bcSearchItems` `field:"both"`

Add an option so ONLY the manual surfaces get the new recall and the AUTO money-path is
untouched:

```js
async function bcSearchItems(query,{field="both",top=25,skip=0,normalizeSeparators=false}={}){
```

Inside the `field==="both"` branch, **after** `merged` is built (`:5804`), before the
`return` (`:5807`), add a fallback that fires **only when the verbatim path found nothing**
and the query is a **single PN-like token**:

```js
// B105: separator-agnostic recall for manual PN searches. Only when the verbatim contains()
// path returned nothing AND the query is a single part-number-like token (no spaces, has a
// digit) — so description / multi-token searches are 100% unchanged. Reuses the B098 anchor
// technique (_bcResolveSurrogateExact:6000-6015) but gates on normalized CONTAINS (discovery),
// not equality (auto-bind).
if(normalizeSeparators && merged.length===0 && rawTokens.length===1 && /\d/.test(rawTokens[0])){
  const raw=rawTokens[0];
  const wantNorm=_bcNormPn(raw);
  if(wantNorm.length>=4){
    // Anchors: maximal alnum runs of the raw token, PLUS each run split at digit<->letter
    // transitions (covers BOTH directions: user has separators BC lacks, and BC has a
    // separator the user omitted). len>=4, longest first, top 4, de-duped.
    const runs=[...raw.matchAll(/[A-Za-z0-9]+/g)].map(m=>m[0]);
    const typeSplits=runs.flatMap(r=>r.match(/[A-Za-z]+|[0-9]+/g)||[]);
    const anchors=[...new Set([...runs,...typeSplits])]
      .filter(a=>a.length>=4).sort((a,b)=>b.length-a.length).slice(0,4);
    const NORM_FIELDS=["number","_vendorItemNo","_commonItemNo","_mfrCode"];
    const cand=new Map();
    for(const a of anchors){
      const per=await Promise.all(
        ITEM_CARD_FIELDS.map(f=>_bcFetchItemsViaItemCard(
          `contains(${f},'${(_isBcNumberField(f)?a.toUpperCase():a).replace(/'/g,"''")}')`,1000,0))
      );
      for(const items of per){ if(items) for(const it of items){ if(it.number&&!cand.has(it.number))cand.set(it.number,it); } }
      // early-exit once we have at least one normalized-contains hit (bounds BC fan-out)
      if([...cand.values()].some(it=>NORM_FIELDS.some(f=>_bcNormPn(it[f]).includes(wantNorm))))break;
    }
    const normHits=[...cand.values()].filter(it=>NORM_FIELDS.some(f=>_bcNormPn(it[f]).includes(wantNorm)));
    normHits.sort((a,b)=>(a.number||"").localeCompare(b.number||""));
    if(normHits.length){
      console.log(`bcSearchItems[B105]: ${normHits.length} normalized-separator hit(s) for "${raw}" (${anchors.length} anchors)`);
      return{items:normHits.slice(0,top),hasMore:normHits.length>top};
    }
  }
}
```

Notes:
- `ITEM_CARD_FIELDS`, `_isBcNumberField`, `_bcFetchItemsViaItemCard` already exist in scope
  (`:5742`, `:5774`, `:5597`) — reuse them, do not duplicate.
- Return ALL normalized-contains hits (no MFR collision-breaker — see below).
- The `merged.length===0` guard means **every currently-working search returns before this
  runs** → zero regression to existing recall/ordering.

### 3. Opt the MANUAL surfaces in (leave AUTO surfaces alone)

- **Item Browser modal** (`:25790`) → add `normalizeSeparators:true`. **(primary fix)**
- **Supplier-quote Link panel** (`:36464`, manual "Link" search) → add `normalizeSeparators:true`
  (same user-driven PN lookup; consistent behavior).
- **Live BC search dropdown `doBcSearch`** (`:20943`) → add `normalizeSeparators:true`
  (manual, PN-capable). Low risk; recommended for parity.
- **Do NOT** touch: `bcFuzzyLookup` 4b (`:5877`), `_bcResolveSurrogateExact` (`:6001`,`:6010`),
  and the supplier-quote **background** fuzzy suggest (`:36435`) — these are AUTO paths and
  already have their own normalized gates (see decision below).

### Manufacturer-secondary consideration

`_bcResolveSurrogateExact` uses an MFR collision-breaker (`:6016-6027`) because auto-bind needs
**exactly one** answer. The Item Browser SHOWS candidates and the user picks — so B105
**intentionally omits** the MFR filter and returns all normalized-contains matches. (No row
`manufacturer` is even available at the browser search site.) Do not port `:6020-6024`.

---

## All call sites of `bcSearchItems`

| Line | Surface | field | Manual/Auto | B105 action |
|------|---------|-------|-------------|-------------|
| `25790` | **BC Item Browser modal** (`BC_BROWSER`, paginated) | var (`both` default) | Manual | **opt-in** `normalizeSeparators:true` |
| `36464` | Supplier-quote **Link panel** search | `both` | Manual | **opt-in** (recommended) |
| `20943` | `doBcSearch` live BC dropdown | `both` (default) | Manual | **opt-in** (recommended) |
| `36435` | Supplier-quote **background** unmatched fuzzy suggest | `both` | Auto | leave as-is |
| `5877` | `bcFuzzyLookup` step 4b cross-field | `both` | Auto (money-path) | leave as-is |
| `6001`,`6010` | `_bcResolveSurrogateExact` (B098) | `both` | Auto (money-path) | leave as-is |
| `5833`,`5843`,`5854` | `bcFuzzyLookup` steps 2/3/4 | `number` | Auto | untouched (not `both`) |

Because the new logic is **opt-in via a defaulted-`false` option**, every non-opted caller is
byte-for-byte unchanged — the auto money-path cannot be perturbed by this change.

---

## Should `bcFuzzyLookup` also change? (B098 "Decision 2" parity)

**Recommendation: NO — scope B105 to `bcSearchItems` (manual surfaces) only.** Rationale:

1. **`bcFuzzyLookup` already has the dash-agnostic machinery** — cross-field normalized-
   equality at 4b (`:5876-5894`) and normalized-`startswith` at step 5 (`:5911-5956`), shipped
   across B092/B094/B095/B098. It is not the gap B105 reports.
2. **Different gate by design.** Auto paths gate on normalized **equality** (one safe auto-
   apply answer, guarded by `_isDefinitiveBcMatch`, `:5970`). The Item Browser needs normalized
   **contains** (discovery). Merging the two would either over-recall the auto path or under-
   recall the browser. Keep them separate — this is the SSOT "factor the rule, not the inputs"
   distinction: they share the **normalizer** (`_bcNormPn`) but keep their own **gate**.
3. **Blast radius.** `bcFuzzyLookup` drives auto-pricing (`runPricingOnPanel`/`Background`).
   Changing its recall risks the money-path; B105 is read-only discovery and must not.

**Follow-up flag (not B105):** the shared `_bcNormPn` SSOT refactor, plus a `matchAll`+type-split
anchor helper, could later let `_bcResolveSurrogateExact` close any residual "user omitted a
separator BC stores" (direction-2) gap in its own anchor set (`:6008` currently splits on
existing separators only). Track as a separate item; do not bundle into B105.

---

## Data-safety / money-path

- **Read-only.** `bcSearchItems` only fetches + returns candidates. It performs no write and
  touches no `partNumber`. The **CARDINAL RULE** (BC surrogate `No`/`bcNo` is the internal link;
  Vendor Part# is front-facing; never overwrite `partNumber`) lives in the *callers* that bind
  a picked result (`addBcItem`, `acceptFuzzyMatch` `:36442-36454`, which set `bcItemId`/`bcNo`
  and preserve `partNumber`). B105 changes only **which candidates surface**, not binding — so
  no `partNumber` overwrite risk is introduced.
- **BC throttle / query fan-out.** BC throttles hard on sustained *writes*; these are *reads*.
  The fallback adds up to `4 anchors × 7 fields` ItemCard GETs, but **only** when the cheap
  verbatim path already returned 0 rows, only for single PN-like tokens, one user-initiated
  search at a time, and with an **early-exit** the moment a normalized hit appears. All calls
  route through `bcGatedFetch`'s 6-slot semaphore (`:5601-5604`), so the fan-out is throttled/
  serialized already. Per-search cost is comparable to what `_bcResolveSurrogateExact` already
  incurs per unresolved row during pricing, and far less frequent. Acceptable.

---

## Regression checks (must still pass)

1. **Description search** ("switch", "network switch", "DUCT COVER") — multi-token, returns as
   today. (Fallback is gated to `rawTokens.length===1` + `/\d/` → never fires for these.)
2. **Already-working exact PN** (a PN whose separators match BC) — verbatim path returns it
   first; `merged.length>0` → fallback never runs → identical result & ordering.
3. **Partial PN** ("6ES7511") — verbatim `contains` still returns the family as today.
4. **`field:"number"` / `field:"displayName"` explicit modes** — unchanged (fallback lives only
   in the `both` branch; and only when opted-in).
5. **Auto money-path** (`bcFuzzyLookup`, `_bcResolveSurrogateExact`, background fuzzy suggest) —
   byte-identical (no `normalizeSeparators` passed).
6. **`<3` char / empty query** — early return at `:5720` unchanged.
7. `node validate_jsx.js` clean; `./tools/check-syntax.sh` clean.

---

## Test plan

**Acceptance (the two intake tokens MUST now return the item in the Item Browser):**
- Search `6ES7511-1AL03-0AB0` → returns the Siemens item (verify the same BC `No` that B098's
  auto-resolver binds for this PN).
- Search `1492EBL3` → returns the Allen-Bradley `1492-EBL3` item.

**Live method (Claude-controlled tab, prod or matrix-arc-test):** open the BC Item Browser,
type each token, confirm a result row. Cross-check the returned BC `No` equals the auto-
resolver's (`_bcResolveSurrogateExact`) answer for the same PN so manual == auto.

**Must-still-work:**
- `switch` → same description results & order as before the change.
- A dash-matching PN already found today → unchanged result and position.
- `6ES7511` (partial) → still returns the family.

**Instrumentation:** the `bcSearchItems[B105]:` console line confirms the fallback fired and how
many anchors/hits; its absence on regression cases confirms the fallback stayed dormant.
Watch `companies/{cid}/debugLogs` for any new BC error clusters during the fan-out.

**Fan-out sanity:** confirm the early-exit fires (single anchor usually suffices) — the console
line's anchor count should typically be 1 for a clean PN.

---

## Effort + gate

- **Effort: S–M.** One helper + one gated block in `bcSearchItems` + 3 one-word caller opt-ins.
  ~40-60 lines net, single file, no Cloud Function, no schema/data change.
- **Gate:** trivial-plus. Money-path-adjacent (BC read matching) but read-only and opt-in →
  **Coach review of the diff + live verification of the two acceptance tokens** before deploy.
  No PR-gate required (not an extraction/save/BC-write path change), but Coach sign-off on the
  fan-out bound + regression set is warranted.

---

## Open question for Jon (one)

The plan makes the normalized fallback **fire only when the verbatim search returns 0 results**
(safest — zero regression). Edge case it does *not* cover: a query that returns *some* verbatim
hits but misses the specific separator-variant the user wanted (partial overlap). Accept that
as a known v1 limitation (the reported bug is the "No items found" / zero-result case), or
should the normalized pass **always merge** into results (higher recall, but changes ordering/
contents of currently-working searches — larger blast radius)? Recommend **fallback-on-empty**
for v1.
