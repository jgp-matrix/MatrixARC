# #158 Detailed Plan — Region Learning Subcollection Restructure

**Author:** Sam Wize (Coach) — C108 Rev 2
**Date:** 2026-06-29
**Status:** Jon-approved → Marc build
**Base:** master `fdad5f36` (v1.21.0)
**Scope doc:** `docs/158-REGION-LEARNING-SCOPE.md` (C108)

---

## Retargeting Note (runtime data vs. C108 scope)

Marc's prod pull showed the frozen doc has **9 entries** (not 30) at **1,044,357 bytes**.
Thumbnails average ~115K chars each (range 58K–203K), not the ~37K the scope assumed.
The root driver is **uncapped thumbnail height** in `cropRegionToBase64`, not entry
count. The 30-entry sliding window is irrelevant to the failure — 9 entries blew the
limit. This plan addresses the payload-per-entry problem (Phase 1) alongside the
single-doc architecture (Phase 2).

---

## Rollout Sequence (CRITICAL)

The frozen company (`XODxZ8xJc0dQXGZI7jbo`) cannot accept writes to the old doc path.
The migration (Phase 4) must run AFTER the code deploy (Phases 1–3) so the new
subcollection write path is live. But the dual-path read (Phase 2) ensures the frozen
doc's data is still READABLE before and after migration. Sequence:

```
Phase 1: Thumbnail cap (cropRegionToBase64)         — code change
Phase 2: Subcollection restructure (read + write)   — code change
Phase 3: Loud failures + Firestore rules            — code change + rules deploy
  ─── deploy.sh + firebase deploy --only firestore ───
Phase 4: Migration (admin-triggered, per-company)    — Marc executes post-deploy
Phase 5: Verify                                      — functional test
```

Phases 1–3 ship together in a single deploy. **Phase 4 runs IMMEDIATELY after the
Phase 1–3 deploy, same session, before any new region captures** — this shrinks the
transition window to ~zero for the frozen company.

Phase 5 is the gate before closing the item.

### Accepted limitation: transition-window write holes

Between deploy and migration, the merged read (P2.2) returns entries from BOTH the
subcollection (new captures) and the old single doc (pre-migration entries). Writes,
however, target the subcollection only. This creates two non-destructive edge cases
for old-doc-only entries during the window:

- **`.update()` on an old-doc-only entry throws.** Firestore `.update()` requires the
  target doc to exist; pre-migration entries live in the old doc, not the subcollection.
  This includes the background Haiku `aiAnalysis` write (line 21370) if it lands on a
  pre-migration entry's ID. The throw is caught by `_captureRegionForLearning`'s
  try/catch (line 21373) — non-blocking, non-destructive.

- **`.delete()` of an old-doc-only entry no-ops.** Firestore `.delete()` on a
  nonexistent doc succeeds silently. The entry disappears from the cache but resurrects
  on the next merged read (old doc still has it). Self-clears once migration deletes
  the old doc.

Both holes are **non-destructive** (no data loss, no user-facing error beyond the
debug log) and **self-clear at migration**. The mitigation is process: run Phase 4
immediately after deploy. **Do NOT gold-plate the write path to handle this transient
state.**

---

## Phase 1 — Thumbnail Cap

**Goal:** Bound per-thumbnail size so no single entry can approach the 1 MB per-doc
limit, and future entries stay well under the ~250K char budget.

### P1.1 — `cropRegionToBase64` size cap

**File:** `src/app.jsx`
**Function:** `cropRegionToBase64` (line 13339)
**Current:** `maxWidth=800`, uncapped height, JPEG quality 0.7, single render pass.

**Change:** After the initial render (line 13357), measure the base64 output length. If
it exceeds a ceiling, step down: reduce dimensions by 25% and re-render, repeating until
under ceiling or a floor is hit.

**Constants:**
- `RL_THUMB_MAX_CHARS = 250000` — ceiling for the base64 data URL string (250K chars
  ≈ ~183 KB decoded, ~5.5x headroom within a 1 MB doc per entry)
- `RL_THUMB_MIN_DIM = 200` — floor: never shrink below 200px on either axis (below
  this, the thumbnail is too small for Haiku's structural analysis to be useful)
- `RL_THUMB_QUALITY = 0.7` — initial JPEG quality (unchanged from today)
- `RL_THUMB_QUALITY_FLOOR = 0.4` — quality floor on retry passes

**Algorithm (inside the `img.onload` handler, replacing the single `toDataURL` at line
13357):**

```
1. Render at current outW × outH, quality 0.7 → measure .length
2. If length ≤ RL_THUMB_MAX_CHARS → done, resolve
3. Else: step down quality to 0.5, re-render → measure
4. If length ≤ RL_THUMB_MAX_CHARS → done, resolve
5. Else: scale dimensions by 0.75 (both axes), quality 0.5, re-render → measure
6. Repeat step 5 (with quality floor 0.4) until either:
   a. length ≤ RL_THUMB_MAX_CHARS → done, resolve
   b. either dimension < RL_THUMB_MIN_DIM → resolve with whatever we have
      (accept the over-ceiling result — it's still under 1 MB per-entry)
```

This loop runs synchronously on the canvas (no async, no extra image loads — just
`ctx.drawImage` at smaller dimensions + `canvas.toDataURL`). Worst case is 3–4
iterations for an extremely tall region.

**Why not just reduce maxWidth globally?** Because width affects ALL thumbnails, even
small square ones that are already well under ceiling. The step-down only fires for
oversized thumbnails, preserving quality for normal-sized regions.

### P1.2 — Existing entries are NOT retroactively resized

The 9 existing entries in the frozen doc keep their original thumbnails. They'll be
migrated as-is to the subcollection (where each entry has its own doc with ~5x headroom).
The cap only applies to NEW captures going forward.

### Phase 1 test criteria

- Draw a BOM region on a tall drawing (full-page BOM). Capture fires. Inspect
  `_regionLearningCache` last entry's `thumbnail.length` — must be ≤ 250,000 chars.
- Draw a small region (title block). Thumbnail should NOT be degraded — verify quality
  is 0.7 and dimensions match the original render (step-down didn't fire).

---

## Phase 2 — Subcollection Restructure

**Goal:** Move from single-doc `{examples:[...]}` to one-doc-per-entry subcollection.
Refactor the ONLY Firestore-touching read function (`loadRegionLearning`) and all three
write functions. Keep all downstream consumers untouched.

### P2.1 — Path helpers

**File:** `src/app.jsx`
**Location:** Lines 13310–13311 (replace `_rlPath`)

**Current:**
```js
let _regionLearningCache=null;
function _rlPath(uid){return (_appCtx.configPath||`users/${uid}/config`)+"/region_learning";}
```

**New:**
```js
let _regionLearningCache=null;
function _rlDocPath(uid){return (_appCtx.configPath||`users/${uid}/config`)+"/region_learning";}
function _rlEntriesPath(uid){return _rlDocPath(uid)+"/entries";}
```

`_rlDocPath` = the old single-doc path (used by the dual-path read fallback and the
manifest write). `_rlEntriesPath` = the new subcollection path.

### P2.2 — `loadRegionLearning` (R1) — dual-path read

**File:** `src/app.jsx`
**Function:** `loadRegionLearning` (line 13312)

**Current (line 13312–13316):**
```js
async function loadRegionLearning(uid){
  if(_regionLearningCache)return _regionLearningCache;
  try{const d=await fbDb.doc(_rlPath(uid)).get();_regionLearningCache=d.exists?(d.data().examples||[]):[];}
  catch(e){_regionLearningCache=[];}
  return _regionLearningCache;
}
```

**New:**
```js
async function loadRegionLearning(uid){
  if(_regionLearningCache)return _regionLearningCache;
  try{
    // Read BOTH sources and merge. During the transition window (after deploy,
    // before migration), new captures land in the subcollection while pre-migration
    // entries remain in the old single doc. Merging ensures no entries are invisible.
    // After migration deletes the old doc, the oldEntries path returns [] — natural no-op.
    const snap=await fbDb.collection(_rlEntriesPath(uid)).get();
    const subEntries=snap.empty?[]:snap.docs.map(d=>d.data());
    const d=await fbDb.doc(_rlDocPath(uid)).get();
    const oldEntries=(d.exists&&Array.isArray(d.data().examples))?d.data().examples:[];
    // If old doc is a slim manifest (post-migration), its examples field is absent — oldEntries=[].
    // Merge: concat, deduplicate by id (subcollection wins on conflict), sort by savedAt.
    const byId=new Map();
    for(const e of oldEntries)byId.set(String(e.id),e);
    for(const e of subEntries)byId.set(String(e.id),e);  // overwrites old-doc entry on collision
    _regionLearningCache=[...byId.values()].sort((a,b)=>(a.savedAt||0)-(b.savedAt||0));
  }catch(e){_regionLearningCache=[];}
  return _regionLearningCache;
}
```

**Key constraints (per Jon's directive):**
- **NO lazy migration / NO write from the read path.** The merge is read-only — it
  concatenates both sources in memory but never writes back. The migration is an
  explicit admin-triggered step (Phase 4).
- **No `.orderBy("savedAt")` on the subcollection query.** A single-field ascending
  index IS auto-created by Firestore (no manual step), but client-side sort is simpler
  and removes all doubt. The merge loop already sorts the combined result set by
  `savedAt` — no server-side ordering needed.

**Downstream consumers unchanged (confirmed from C108 trace):**
- R2 (`extractBomPage` client, line 12340): calls `loadRegionLearning` → gets array → passes to `buildRegionLearningContext`. No change.
- R3 (`detectPageTypes`, line 15268): same pattern. No change.
- R4 (Settings UI, line 17717): calls `loadRegionLearning` → sets React state. No change.
- R5 (`_captureRegionForLearning`, line 21362): calls `loadRegionLearning` → `.some()` check. No change.
- R6 (CF `extractBomPage`, functions/index.js:2395): receives pre-built payload from client. No change.
- `buildRegionLearningContext` (line 13404): takes `examples` array as parameter. No change.

### P2.3 — `saveRegionLearningEntry` (W1) — subcollection write + sliding window

**File:** `src/app.jsx`
**Function:** `saveRegionLearningEntry` (line 13318)

**Current (line 13318–13326):**
```js
async function saveRegionLearningEntry(uid,entry){
  const examples=await loadRegionLearning(uid);
  while(examples.length>30)examples.shift();
  examples.push({...entry,savedAt:Date.now()});
  _regionLearningCache=examples;
  await fbDb.doc(_rlPath(uid)).set({examples}).catch(e=>console.warn("[REGION LEARNING] save failed:",e.message));
  return entry;
}
```

**New:**
```js
async function saveRegionLearningEntry(uid,entry){
  const stamped={...entry,savedAt:Date.now()};
  const entriesRef=fbDb.collection(_rlEntriesPath(uid));
  await entriesRef.doc(String(stamped.id)).set(stamped);
  // Sliding window: if >30 entries, delete oldest by savedAt
  const all=await entriesRef.orderBy("savedAt").get();
  if(all.size>30){
    const toDelete=all.docs.slice(0,all.size-30);
    const batch=fbDb.batch();
    toDelete.forEach(d=>batch.delete(d.ref));
    await batch.commit();
  }
  // Refresh cache from the write (avoid stale reads)
  _regionLearningCache=all.docs.slice(-(Math.min(all.size,30))).map(d=>d.data());
  return stamped;
}
```

**Note on `.orderBy("savedAt")`:** A single-field ascending index is auto-created by
Firestore, so `entriesRef.orderBy("savedAt").get()` works without manual index setup.
Alternatively, use `entriesRef.get()` + client-side `docs.sort(...)` for consistency
with P2.2's approach.

The `.catch` that was here (line 13325) is removed — error handling moves to the caller
(`_captureRegionForLearning` at line 21366) and the loud-failure wrapper (Phase 3). The
function now throws on write failure instead of silently catching.

### P2.4 — `deleteRegionLearningEntry` (W2) — subcollection delete

**File:** `src/app.jsx`
**Function:** `deleteRegionLearningEntry` (line 13328)

**Current (line 13328–13331):**
```js
async function deleteRegionLearningEntry(uid,exampleId){
  const examples=(await loadRegionLearning(uid)).filter(e=>e.id!==exampleId);
  _regionLearningCache=examples;
  await fbDb.doc(_rlPath(uid)).set({examples}).catch(e=>console.warn("[REGION LEARNING] delete failed:",e.message));
}
```

**New:**
```js
async function deleteRegionLearningEntry(uid,exampleId){
  await fbDb.collection(_rlEntriesPath(uid)).doc(String(exampleId)).delete();
  _regionLearningCache=(_regionLearningCache||[]).filter(e=>String(e.id)!==String(exampleId));
}
```

Direct doc delete. Cache updated locally (filter out the deleted entry). No need to
re-read the full subcollection. The `.catch` (line 13331) is removed — throws on
failure; caller handles (Phase 3).

### P2.5 — `updateRegionLearningEntry` (W3) — subcollection update

**File:** `src/app.jsx`
**Function:** `updateRegionLearningEntry` (line 13333)

**Current (line 13333–13336):**
```js
async function updateRegionLearningEntry(uid,exampleId,patch){
  const examples=(await loadRegionLearning(uid)).map(e=>e.id===exampleId?{...e,...patch,updatedAt:Date.now()}:e);
  _regionLearningCache=examples;
  await fbDb.doc(_rlPath(uid)).set({examples}).catch(e=>console.warn("[REGION LEARNING] update failed:",e.message));
}
```

**New:**
```js
async function updateRegionLearningEntry(uid,exampleId,patch){
  const stamped={...patch,updatedAt:Date.now()};
  await fbDb.collection(_rlEntriesPath(uid)).doc(String(exampleId)).update(stamped);
  _regionLearningCache=(_regionLearningCache||[]).map(e=>
    String(e.id)===String(exampleId)?{...e,...stamped}:e
  );
}
```

Uses `.update()` (merge) not `.set()` (overwrite) — the `{aiAnalysis: ...}` patch from
the background Haiku call (line 21370) merges into the existing entry doc without
overwriting the thumbnail and other fields. The `.catch` (line 13336) is removed —
throws on failure; caller handles (Phase 3).

### Phase 2 test criteria

- After deploy (before migration): company with NO prior region learning data can draw
  a region → entry appears in subcollection → Settings UI shows it → delete works.
- After deploy (before migration): the frozen company can STILL READ its old doc via
  the fallback path → Settings UI shows the existing 9 entries.
- After deploy (before migration): the frozen company's NEW captures write to the
  subcollection (old doc is not touched) → both old entries (from fallback read) and
  new entries (from subcollection) appear in the learning context.
- Transition window (subcollection has new entries + old doc still present): merged
  read returns ALL entries, deduped by id (subcollection wins on conflict), none lost.

---

## Phase 3 — Loud Failures + Firestore Rules

### P3.1 — Loud failure surfacing

**Goal:** Write failures reach the user, not just `console.warn`. Three layers:

**(a) `saveRegionLearningEntry` / `deleteRegionLearningEntry` / `updateRegionLearningEntry`
(W1/W2/W3):**

Per P2.3–P2.5, the `.catch()` handlers at lines 13325, 13331, 13336 are removed. The
functions now throw on Firestore errors. Callers are responsible for handling.

**(b) `_captureRegionForLearning` (line 21330) — the fire-and-forget capture path:**

This is inside `DrawingLightbox` (line 21282). The outer `try/catch` at line 21373
currently logs `console.warn("[REGION LEARNING] capture failed:", e.message)`.

**Change:** Keep it non-blocking (don't throw — would break region-drawing UX). Add two
signals:

1. **Debug log entry** — `logDebugEntry` call so the failure appears in admin Debug Logs
   (Settings → Debug Logs):
   ```js
   if(typeof window!=="undefined"&&typeof window.logDebugEntry==="function"){
     window.logDebugEntry({severity:"warn",source:"regionLearning",
       message:"Region learning save failed: "+e.message,
       extra:{regionId:region?.id,regionType:region?.type}});
   }
   ```

2. **Console warning with actionable text:**
   ```js
   console.warn("[REGION LEARNING] save failed — region will not influence future extractions. "+
     "If this persists, contact admin. Error: "+e.message);
   ```

**Why no toast/modal here?** `_captureRegionForLearning` runs inside `DrawingLightbox`,
which has no toast infrastructure (it's a lightweight overlay). Adding a toast system
just for this one signal is over-engineered. The debug log entry (visible to admins
in-app) is the right level — the failure is non-destructive (region still appears on
the drawing, just doesn't persist to learning DB).

**(c) `pruneRegionLearning` (Settings UI, line 17720):**

The admin delete path in Settings already has a confirm dialog. If the delete fails,
surface it via the existing UI state in the Settings panel. Wrap the
`deleteRegionLearningEntry` call:
```js
try{
  await deleteRegionLearningEntry(uid, exampleId);
  setRegionLearning(prev => prev.filter(e => e.id !== exampleId));
}catch(e){
  // Show inline error in the region learning panel
  console.error("[REGION LEARNING] delete failed:", e.message);
  // Optionally: setRegionLearningError("Failed to delete — " + e.message);
}
```

### P3.2 — Firestore rules

**File:** `firestore.rules`
**Location:** After line 463 (inside the `match /companies/{companyId}` block, after the
`match /config/{configId}` rule).

**Add:**
```
match /config/region_learning/entries/{entryId} {
  allow read: if isMember();
  allow write: if canWrite();
}
```

The existing `match /config/{configId}` wildcard at line 460 covers the manifest doc
at `config/region_learning`. The new explicit match covers the `entries` subcollection.

**Deploy:** `firebase deploy --only firestore:rules` — runs separately from hosting
deploy. Must be deployed BEFORE Phase 4 (migration writes to the subcollection).

### P3.3 — Solo-account rules

Solo accounts use `users/{uid}/config/region_learning`. The existing catch-all rule at
`match /users/{uid}/{document=**}` (firestore.rules, early lines) covers both the
manifest doc and the `entries` subcollection via the recursive wildcard. **No additional
rule needed for solo accounts.**

### Phase 3 test criteria

- Draw a region on a drawing. Check Debug Logs (Settings → Debug Logs) — no
  "regionLearning" warn entry should appear (write succeeded).
- Simulate a write failure (e.g., temporarily break the path). Check Debug Logs — a
  "regionLearning" warn entry should appear with the error message.
- In Settings, delete a region example. If it fails, the UI should not silently remove
  the entry from the list.

---

## Phase 4 — Migration (Post-Deploy, Admin-Triggered)

**Goal:** Move the frozen company's 9 entries from the oversized single doc into the new
subcollection, then delete the old doc.

### P4.1 — Migration script

Marc executes this from the browser console (or a one-off admin function) after Phases
1–3 are deployed. Runs for **any company whose old doc still exists**.

**Steps:**

```
1. Read the old doc:
   fbDb.doc("companies/{companyId}/config/region_learning").get()

2. Extract examples array:
   const examples = doc.data().examples || [];
   console.log(`Found ${examples.length} entries, doc size ~${JSON.stringify(doc.data()).length} chars`);

3. Batch write entries to subcollection + overwrite old doc with slim manifest:
   const batch = fbDb.batch();
   for (const entry of examples) {
     const ref = fbDb.doc(`companies/{companyId}/config/region_learning/entries/${String(entry.id)}`);
     batch.set(ref, entry);
   }
   // LOAD-BEARING: this .set() overwrites the oversized 1MB doc with a slim manifest.
   // That's the mechanism that unfreezes the doc path — Firestore .set() replaces the
   // entire document contents regardless of current size. No separate delete needed.
   const manifestRef = fbDb.doc("companies/{companyId}/config/region_learning");
   batch.set(manifestRef, {
     entryCount: examples.length,
     lastUpdatedAt: Date.now(),
     migratedAt: Date.now(),
     migratedFrom: "single-doc",
     originalDocSizeChars: JSON.stringify(doc.data()).length
   });
   await batch.commit();

4. Console log: "Migration complete: {N} entries moved to subcollection"
```

**Op count:** 9 entry writes + 1 manifest overwrite = **10 ops**.
Firestore batch limit is 500. Trivially atomic.

### P4.2 — Frozen-doc read works

Confirmed: Firestore's 1 MB limit applies to writes, not reads. The frozen doc at
1,044,357 bytes is readable. The migration script's Step 1 (`.get()`) will succeed.

### P4.3 — Blast radius

Jon confirmed: blast radius handled via Firebase Console eyeball. **No Admin-SDK
enumeration script** (that's a build/deploy, out of read-only scope). Jon identifies
which companies have old-format docs; Marc runs the migration script per-company.

### P4.4 — Solo-account migration

Solo accounts at `users/{uid}/config/region_learning` follow the same pattern. If any
solo-account doc exists and is over-limit (unlikely — single user's 30 entries), run
the same script with the solo path. If under-limit, the dual-path read handles it
gracefully — no migration required, but migration is still recommended for consistency.

### Phase 4 test criteria

- Post-migration: `fbDb.doc("companies/{companyId}/config/region_learning").get()` returns
  the manifest (slim, `entryCount: 9`), NOT the old oversized doc.
- Post-migration: `fbDb.collection("companies/{companyId}/config/region_learning/entries").get()`
  returns exactly 9 docs.
- Post-migration: each entry doc's `thumbnail` matches the original (byte-for-byte —
  migration preserves existing thumbnails, no re-encoding).

---

## Phase 5 — Functional Verification

Run after Phase 4 migration completes on the frozen company.

### V1 — Settings UI renders all entries

Open Settings → Region Learning on the migrated company account. Verify:
- All 9 entries display with thumbnails, labels, notes, AI analysis.
- The count line reads "9 of 30 examples saved".
- Pruning (✕ button) works — entry count drops, entry disappears from list.

### V2 — New region capture writes successfully

Open any project. Open a drawing in the lightbox. Draw a region, assign a type + note.
Verify:
- No "regionLearning" warn entry in Debug Logs.
- Settings → Region Learning shows the new entry (10 entries after adding 1).
- Console shows `[REGION LEARNING] captured "..." from ...` (existing log line).

### V3 — Extraction uses learning context

Run a BOM extraction on any page. Check console for the region-learning load:
- `loadRegionLearning` should return the subcollection entries (not the old doc
  fallback).
- `buildRegionLearningContext` should produce content parts (verify via console or by
  checking the extraction request payload in Network tab — `regionLearningParts` should
  be a non-empty array).

### V4 — Thumbnail cap (tall region)

Draw a BOM region covering a full-page BOM table (tallest possible region). After
capture, inspect the entry's thumbnail length:
- `_regionLearningCache[_regionLearningCache.length-1].thumbnail.length` should be
  ≤ 250,000 chars.
- The thumbnail should still be visually recognizable in Settings (not degraded to
  unusability).

---

## Change Summary

| File | Lines touched | Nature |
|------|--------------|--------|
| `src/app.jsx` | 13310–13363 | `_rlPath` → `_rlDocPath`/`_rlEntriesPath`; rewrite `loadRegionLearning`, `saveRegionLearningEntry`, `deleteRegionLearningEntry`, `updateRegionLearningEntry`; thumbnail cap in `cropRegionToBase64` |
| `src/app.jsx` | 17720–17723 | `pruneRegionLearning` error handling |
| `src/app.jsx` | 21330–21374 | `_captureRegionForLearning` loud failure (debug log + console) |
| `firestore.rules` | ~464 | Add `entries/{entryId}` match |
| (browser console) | — | Migration script (Phase 4, post-deploy) |

**Estimated:** ~80 lines changed in `src/app.jsx`, ~4 lines in `firestore.rules`.
No Cloud Functions changes. No `APP_SCHEMA_VERSION` bump (config data, not project
data). Single session build.

---

## Out of Scope (Parked)

- **Thumbnails to Firebase Storage:** Rejected — over-engineered vs. the data. Worst
  thumbnail (203K chars) leaves ~4x headroom in a per-entry doc. Storage adds upload/
  download plumbing, Storage rules, hydration latency. Not justified.

- **`extractBomBatch` region-learning gap:** The batch CF (functions/index.js:2631)
  does not accept `regionLearningParts`. Pre-existing gap, not caused by #158. Separate
  finding, separate work item.

- **Admin-SDK company enumeration script:** Jon handles blast radius via Firebase
  Console. No script needed in this scope.
