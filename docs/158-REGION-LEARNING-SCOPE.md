# #158 — Region Learning 1MB Scope (Coach C108)

**Author:** Sam Wize (Coach)
**Type:** Pre-design scoping trace — read-only, no code changes
**Date:** 2026-06-29
**Status:** Ready for Jon review → Detailed Plan
**Tip:** master `fdad5f36`

---

## Executive Summary

`config/region_learning` is a **single Firestore document** holding up to 30 region
examples in one `{examples:[...]}` array. Each entry carries an **inline base64 JPEG
thumbnail** (30–130 KB encoded). At 30 entries the doc routinely approaches or exceeds
Firestore's 1,048,576-byte hard limit. Company `XODxZ8xJc0dQXGZI7jbo` is already
frozen at 1,114,178–1,179,954 bytes — every write silently fails. The fix is a
**subcollection restructure** (one doc per entry) plus a **one-time migration** to
unfreeze the oversized doc. Five read sites and three write sites need refactoring.

---

## 1. STRUCTURE — Root Cause Confirmed

### Document location

```
companies/{companyId}/config/region_learning      (team accounts)
users/{uid}/config/region_learning                 (solo accounts — fallback)
```

Path built by `_rlPath(uid)` at `src/app.jsx:13311`:
```js
function _rlPath(uid){return (_appCtx.configPath||`users/${uid}/config`)+"/region_learning";}
```

### Document shape

```js
{
  examples: [                        // flat array, up to 30 entries
    {
      id:               number,      // Date.now() + Math.random() — unique per entry
      label:            string,      // region type short name
      type:             string,      // "bom" | "schematic" | "enclosure" | etc.
      note:             string,      // user free-text
      pageTypeContext:   string|null, // page type when captured (e.g., "bom")
      thumbnail:        string,      // *** THE PROBLEM *** — full base64 data URL
      regionBox:        {x,y,w,h},   // normalized 0-1 coordinates
      sourceCustomer:   string|null,
      sourcePageName:   string|null,
      contributedBy:    string|null,  // uid of contributor (Phase 1f)
      inputTierClass:   string,      // "pdf" | "image"
      savedAt:          number,      // Date.now() epoch ms
      updatedAt:        number|null, // set on updates
      aiAnalysis: {                  // added by background Haiku call (~1-2 KB)
        columnHeaders:     string[],
        rowCount:          number,
        structuralSummary: string,
        signaturePhrase:   string,
        columnLayoutType:  string
      }
    },
    // ... up to 30 entries
  ]
}
```

### Growth dimension: **thumbnail size**, not entry count

The sliding window at `saveRegionLearningEntry` (line 13322-13323) caps entries at 30:
```js
while(examples.length>30)examples.shift();
```

The original code comment (line 13320-13321) assumed "thumbnails at ≤100KB give
headroom." **This assumption is wrong.** The math:

- `cropRegionToBase64` (line 13339) renders at `maxWidth=800`, uncapped height, JPEG
  quality 0.7. A tall BOM region (800×1200+) produces 40–100 KB raw JPEG.
- Base64 encoding inflates by ~33% → 53–133 KB per thumbnail string.
- **30 entries × ~37 KB average = ~1.1 MB** — which matches the observed 1,114,178 bytes.
- Plus metadata per entry (~1-2 KB) and aiAnalysis (~1 KB) = total well over 1 MB.

The **30-entry window was correctly sized for count** but **incorrectly sized for byte
budget**. Even with a reduced window (e.g., 15), a few large thumbnails would still
breach 1 MB. The fundamental problem is **inline blob storage in a single doc**.

### Write paths (3 functions + 1 capture trigger)

| # | Function | Line | Operation | Silent catch |
|---|----------|------|-----------|--------------|
| W1 | `saveRegionLearningEntry` | 13318 | `.set({examples})` — appends + prunes to 30 | `.catch(e=>console.warn(...))` at **line 13325** |
| W2 | `deleteRegionLearningEntry` | 13328 | `.set({examples})` — filters out by id | `.catch(e=>console.warn(...))` at **line 13331** |
| W3 | `updateRegionLearningEntry` | 13333 | `.set({examples})` — map/patch by id | `.catch(e=>console.warn(...))` at **line 13336** |
| W4 | `_captureRegionForLearning` | 21330 | Calls W1 or W3 (save or update) + background W3 for aiAnalysis | Outer `try/catch` at **line 21373** — `console.warn` |

**All three `.catch()` handlers at lines 13325, 13331, 13336 are the silent-failure
sites.** They log to `console.warn` but provide zero user indication. The Firestore
400 error (doc exceeds 1MB) is caught here and swallowed.

### Write trigger flow

1. User draws a region on a drawing page → `finishRegion()` (line 21412) calls
   `_captureRegionForLearning(region)` (fire-and-forget)
2. User edits a region note → `saveEditRegion()` (line 21428) calls
   `_captureRegionForLearning(merged, {update:true})`
3. User changes a region type → `changeRegionType()` (line 21437) calls
   `_captureRegionForLearning(merged, {update:true})`
4. `_captureRegionForLearning` crops the region thumbnail at 800px wide, builds the
   entry object, then calls W1 (new) or W3 (existing), then fires a background Haiku
   AI analysis that calls W3 again with `{aiAnalysis: ...}`.

Each capture = **2 Firestore writes** (initial save + aiAnalysis update).

---

## 2. READERS — Complete Enumeration

### R1. `loadRegionLearning(uid)` — core loader

**Line 13312.** Reads the single doc, returns `d.data().examples || []`. Result cached
in module-scope `_regionLearningCache` (line 13310).

**Shape assumption:** `d.data().examples` is an array. If doc doesn't exist, returns
`[]`. If doc exists but `examples` is missing/falsy, returns `[]`.

### R2. BOM extraction — client-side `extractBomPage`

**Line 12340:**
```js
const _rlEx = await loadRegionLearning(_rlUid);
_regionParts = buildRegionLearningContext(_rlEx, {maxExamples:3});
```

Loads the full array via R1, then `buildRegionLearningContext` (line 13404) picks up to
3 examples by priority (pageTypeContext match first, then recency), builds multimodal
content parts (thumbnail images + text captions). These parts are passed to:
- `extractBomPageViaServer()` — sent to Cloud Function as `regionLearningParts` payload
- Direct Anthropic API calls in the client-side fallback chain

**Path coverage:** Called for ALL extraction paths through `extractBomPage` (line 12325):
H5 tile path (line 12354), PDF-native server path (line 12375), crop fallback (line
12384), uncropped fallback (line 12398).

**NOT called:** `extractBomBatchViaServer` (line 12297) does NOT load or pass region
learning. The batch CF (functions/index.js:2631) has no `regionLearningParts` parameter.
**This is a pre-existing gap** — batch extraction skips region learning context entirely.

### R3. Page type detection — `detectPageTypes`

**Line 15268:**
```js
const examples = await loadRegionLearning(uid);
regionParts = buildRegionLearningContext(examples, {maxExamples:3});
```

Same pattern as R2. Region thumbnails spliced into the Sonnet page-classification prompt
as multimodal context. Non-blocking (`try/catch` at line 15265).

### R4. Settings UI — admin display

**Line 17714-17718:**
```js
useEffect(()=>{
  loadRegionLearning(uid).then(list=>{
    if(!cancelled) setRegionLearning(list||[]);
  });
},[uid]);
```

Loads into React state for the Region Learning panel in Settings. Renders thumbnails,
labels, notes, AI analysis. Admin can prune entries via `pruneRegionLearning` → calls
`deleteRegionLearningEntry` (W2).

**Shape assumption:** Iterates the array with `.slice().reverse().map()` (line 18091).
Accesses `e.id`, `e.thumbnail`, `e.label`, `e.type`, `e.pageTypeContext`,
`e.sourceCustomer`, `e.savedAt`, `e.note`, `e.aiAnalysis`.

### R5. Capture check — `_captureRegionForLearning`

**Line 21362:**
```js
const existing = await loadRegionLearning(uid);
if(existing.some(e => e.id === region.id)){
  await updateRegionLearningEntry(uid, region.id, entry);
} else {
  await saveRegionLearningEntry(uid, entry);
}
```

Checks whether a region ID already exists in the array to decide update vs. insert.

### R6. Cloud Function `extractBomPage` — passthrough only

**functions/index.js:2395:**
```js
const regionParts = Array.isArray(regionLearningParts) ? regionLearningParts : [];
```

Does NOT read `region_learning` from Firestore. Receives pre-built content parts from
the client (R2). **No refactoring needed on the CF side.**

### Reader summary

| # | Site | Line | Reads Firestore? | Assumes single doc? | Refactor needed? |
|---|------|------|------------------|---------------------|------------------|
| R1 | `loadRegionLearning` | 13312 | YES — `fbDb.doc(_rlPath(uid)).get()` | YES — `.data().examples` | YES — must become subcollection query |
| R2 | `extractBomPage` (client) | 12340 | Via R1 | Via R1 | NO — consumes R1's return value |
| R3 | `detectPageTypes` | 15268 | Via R1 | Via R1 | NO — consumes R1's return value |
| R4 | Settings UI | 17717 | Via R1 | Via R1 | NO — consumes R1's return value |
| R5 | `_captureRegionForLearning` | 21362 | Via R1 | Via R1 | NO — consumes R1's return value |
| R6 | CF `extractBomPage` | 2395 | NO — client sends payload | N/A | NO |

**The refactor is contained to R1.** Every other reader consumes R1's return value (a
flat array). If R1 reconstructs the same array from a subcollection, all downstream
readers work unchanged. `buildRegionLearningContext` (line 13404) is also untouched —
it takes the array as a parameter.

---

## 3. SHARD STRATEGY — Subcollection Per Entry

### Rejected alternatives

| Strategy | Why rejected |
|----------|--------------|
| **Reduce thumbnail size** (lower maxWidth/quality) | Kicks the can — a few large regions still breach 1MB. Doesn't solve the architecture. |
| **Prune to fewer entries** (e.g., 15 instead of 30) | Same — reduces headroom, doesn't eliminate the limit. Also degrades learning quality. |
| **Thumbnails to Storage, metadata in doc** | Most complex. Requires Storage rules, hydration latency on every read, upload/download plumbing. Over-engineered for 30 entries. |

### Proposed: subcollection `config/region_learning/entries/{entryId}`

**New structure:**

```
companies/{companyId}/config/region_learning              ← manifest doc (optional)
companies/{companyId}/config/region_learning/entries/{id}  ← one doc per example
```

Each entry doc contains the same fields as today's array element (including `thumbnail`).
Individual thumbnails are 50–150 KB — well under the 1 MB per-doc limit with ~10x
headroom.

**Manifest doc** (at the current `config/region_learning` path): optional, holds only
`{entryCount: number, lastUpdatedAt: number}`. Not required for correctness — the
subcollection is self-describing — but useful for quick staleness checks without
reading all entries.

### Refactored functions

**`_rlPath(uid)` → `_rlCollectionPath(uid)`:**
Returns the subcollection path instead of a doc path.

**`loadRegionLearning(uid)` (R1 — the ONLY Firestore-touching refactor):**
```
Before: fbDb.doc(path).get() → d.data().examples
After:  fbDb.collection(path + "/entries").orderBy("savedAt").get() → docs.map(d => d.data())
```
Returns the same flat array. `_regionLearningCache` still works identically.

**`saveRegionLearningEntry(uid, entry)` (W1):**
```
Before: load array, push, shift if >30, .set({examples})
After:  fbDb.collection(path + "/entries").doc(String(entry.id)).set(entry)
        + enforce sliding window: query count, if >30, delete oldest by savedAt
```
The sliding window delete is a subcollection query + batch delete of the oldest entries.

**`deleteRegionLearningEntry(uid, exampleId)` (W2):**
```
Before: load array, filter, .set({examples})
After:  fbDb.collection(path + "/entries").doc(String(exampleId)).delete()
```

**`updateRegionLearningEntry(uid, exampleId, patch)` (W3):**
```
Before: load array, map/patch, .set({examples})
After:  fbDb.collection(path + "/entries").doc(String(exampleId)).update(patch)
```
Uses `.update()` not `.set()` — merges the patch (e.g., `{aiAnalysis: ...}`) without
overwriting the full doc.

### Firestore rules

Current coverage: `match /config/{configId}` at firestore.rules:460 covers the doc.
**Need to add:**

```
match /config/region_learning/entries/{entryId} {
  allow read: if isMember();
  allow write: if canWrite();
}
```

This sits alongside the existing `config/{configId}` wildcard. The wildcard covers the
manifest doc; the explicit match covers the subcollection.

### Read-path refactor cost

**Minimal.** Only `loadRegionLearning` changes its Firestore call. All 5 downstream
consumers (R2–R5, plus `buildRegionLearningContext`) receive the same `examples[]`
array and are untouched. The cache (`_regionLearningCache`) works identically.

**Performance:** One `getDocs()` on a 30-doc subcollection vs. one `getDoc()` on a
1 MB doc. The subcollection read is likely **faster** — Firestore charges per doc read,
but network transfer of 30 small docs (~150 KB total) is much less than one 1.1 MB doc.
And writes go from rewriting the entire 1 MB doc on every change to writing a single
~50 KB entry doc.

### Bonus: `extractBomBatch` gap

The batch extraction path (`extractBomBatchViaServer`, line 12297) does not pass region
learning context. This is a pre-existing gap, not introduced by #158. **Not in scope
for #158** — note for future enhancement. The batch CF signature would need a
`regionLearningParts` parameter matching the single-page CF.

---

## 4. MIGRATION — Unfreezing the Oversized Doc

### Constraints

- The existing doc at `companies/XODxZ8xJc0dQXGZI7jbo/config/region_learning` is
  **over 1 MB** (observed 1,114,178 → 1,179,954 bytes).
- **Reads still work** — Firestore's 1 MB limit applies to writes, not reads.
- **Writes are permanently blocked** — the doc cannot be updated, even to shrink it.
- The doc **can be deleted** — Firestore allows deleting oversized docs.
- The doc's entries can be **read once** and split into the new subcollection structure.

### Migration steps

**Step 1: Marc runtime pull (DEPENDENCY)**

Before finalizing the migration script, Marc needs to read the actual frozen doc and
report:
- **Entry count** (how many entries in the `examples` array)
- **Per-entry thumbnail sizes** (length of each `thumbnail` string in chars)
- **Total doc size** (confirm ~1.15 MB)
- **Entry IDs** (verify they're unique — `Date.now() + Math.random()`)

This confirms the migration script's assumptions about the data shape. Run from the
browser console or a one-off Firestore read — no code change needed.

**Step 2: Migration script (one-time, admin-triggered)**

```
1. Read the oversized doc: fbDb.doc(oldPath).get()
2. Extract examples array: doc.data().examples
3. For each entry:
   a. Write to subcollection: fbDb.doc(oldPath + "/entries/" + String(entry.id)).set(entry)
4. Verify: read subcollection, confirm entry count matches
5. Delete the oversized doc: fbDb.doc(oldPath).delete()
6. Write manifest: fbDb.doc(oldPath).set({entryCount, lastUpdatedAt, migratedAt})
```

The script runs as a **Firestore batch write** — subcollection writes can be batched
(Firestore batch limit is 500 ops; we have ≤30 entries + 1 delete + 1 manifest = ≤32
ops). Atomic: either all entries migrate or none do.

**Step 3: Verify post-migration**

- Settings → Region Learning should display all entries (confirms R4 works)
- Draw a new region on any project (confirms W1 + W4 work — write succeeds)
- Run a BOM extraction (confirms R2 + R3 work — learning context fed to AI)

### Solo-account migration

Solo accounts use `users/{uid}/config/region_learning`. These are per-user, not
per-company, so the doc is likely much smaller (one user's 30 entries vs. a team's
pooled entries). **Check at runtime:** if the solo-path doc is under 1 MB, no migration
needed — the code change alone (subcollection structure) handles it. If over 1 MB, apply
the same migration script with the solo path.

### Backward compatibility

The new `loadRegionLearning` should check **both** the old single-doc path and the new
subcollection path during a transition window:

1. Try subcollection first (`getDocs` on `entries/`). If non-empty, use it.
2. If subcollection is empty, try the old doc (`getDoc` on the parent). If it exists
   and has `examples`, use that (and optionally trigger a lazy migration).
3. If neither exists, return `[]`.

This ensures no data loss for companies that haven't been migrated yet. The lazy
migration (step 2 → auto-split) can run for non-frozen docs. For the frozen doc
(XODxZ8xJc0dQXGZI7jbo), the admin-triggered script in Step 2 is required since the
doc can't be rewritten to shrink it — it can only be read and deleted.

---

## 5. SILENT-FAILURE FIX LOCATIONS

The fix should make write failures **loud** — visible to the user, not just
`console.warn`. Three locations:

| Line | Current | Proposed |
|------|---------|----------|
| 13325 | `.catch(e=>console.warn("[REGION LEARNING] save failed:",e.message))` | Surface via toast/status bar: "Region learning save failed — contact admin" |
| 13331 | `.catch(e=>console.warn("[REGION LEARNING] delete failed:",e.message))` | Same pattern |
| 13336 | `.catch(e=>console.warn("[REGION LEARNING] update failed:",e.message))` | Same pattern |

Additionally, `_captureRegionForLearning` (line 21373) catches all errors with
`console.warn`. This is the fire-and-forget capture path — making it throw would
block the region-drawing UX. **Keep it non-blocking** but add a `logDebugEntry` call
so failures appear in the admin Debug Logs stream.

---

## 6. IMPLEMENTATION ESTIMATE

| Phase | Work | Scope |
|-------|------|-------|
| **A. Subcollection refactor** | Rewrite `_rlPath`, `loadRegionLearning`, `saveRegionLearningEntry`, `deleteRegionLearningEntry`, `updateRegionLearningEntry` | 5 functions, ~60 lines changed in `src/app.jsx` |
| **B. Firestore rules** | Add `entries/{entryId}` match under `config/region_learning` | 4 lines in `firestore.rules` |
| **C. Backward-compat read** | Dual-path read in `loadRegionLearning` (subcollection-first, old-doc fallback) | ~15 lines |
| **D. Migration script** | One-time admin-triggered: read oversized doc → batch write to subcollection → delete old doc | ~30 lines (inline in app or standalone) |
| **E. Loud failures** | Replace `.catch(console.warn)` with user-visible feedback + debug log | 3 sites, ~5 lines each |
| **F. Marc runtime pull** | Read frozen doc, report entry count + thumbnail sizes | Pre-implementation dependency |

**Total:** ~120 lines changed/added in `src/app.jsx`, ~4 lines in `firestore.rules`,
one-time migration. Single session build. No Cloud Functions changes (CF receives
pre-built content parts from client — unchanged). No `APP_SCHEMA_VERSION` bump (this is
config data, not project data).

---

## 7. RISK NOTES

1. **Data loss if migration script fails mid-batch.** Mitigated: Firestore batch writes
   are atomic. Also, the old doc is read-only (reads work), so worst case = old doc
   still exists + partial subcollection. Retry is safe.

2. **Solo-account divergence.** Solo accounts use `users/{uid}/config/` path. The
   refactored `_rlPath` must handle both company and solo paths identically.
   `_appCtx.configPath` already resolves this — just append `/region_learning/entries/`.

3. **Cache invalidation.** `_regionLearningCache` is module-scope and never invalidated
   except by the write functions. No change needed — the cache is populated by
   `loadRegionLearning` regardless of whether it reads a doc or a subcollection.

4. **`extractBomBatch` gap.** Batch extraction does not receive region learning context.
   Pre-existing, not caused by #158. Note for future work — not in this scope.
