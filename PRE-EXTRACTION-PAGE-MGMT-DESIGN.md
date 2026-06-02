# Pre-Extraction Page Management — Design (v3)

**Author:** Sam Wize (Coach)
**Date:** 2026-06-02
**Status:** DRAFT v3 — revised per Jon's clarification on intended flow
**Covers:** TODO #77 (BUG, HIGH) + TODO #78 (FEATURE, MEDIUM)

---

## Intended Flow (per Jon)

1. User drops PDFs into extraction window
2. ARC scans, shows page images
3. **User deletes unwanted pages** (hard-delete from pending list)
4. User confirms page types/regions (existing `awaitingConfirm` UI — no new scope)
5. User clicks "Proceed with Extraction" on the remaining pages

---

## Problem

### #77 — Page delete renders broken state (BUG)

When a user drops a PDF and then clicks the red X to delete a page BEFORE clicking "Proceed with Extraction," the delete either has no visible effect (page reappears) or causes all page images to go black.

**Severity:** HIGH — active blocker for Noah's workflow.

### #78 — Pre-extraction page deletion (FEATURE)

The X button should cleanly remove pages from the pending list before extraction. Today it calls `removePage` which writes to `panel.pages` and Firestore — wrong targets for uncommitted pre-extraction state. #78 is the correct behavior that #77's fix enables.

---

## 1. Root Cause Analysis (#77)

### The dual-source display pattern

The page thumbnail strip at line 26137 renders from `pages`, which is derived at line 22785-22787:

```js
const savedPages=(panel.pages||[]).filter(p=>!p.ecoId);    // line 22785
const _pendingBase=pendingPages.filter(p=>!p.ecoId);        // line 22786
const pages=_pendingBase.length>0?_pendingBase:savedPages;   // line 22787
```

In pre-extraction state, `pendingPages` is populated by `addFiles` (line 22947/22964/22996) with page objects that have `dataUrl` (rendered from the dropped PDF). The display uses `_pendingBase` (from `pendingPages`) when non-empty.

### What `removePage` does wrong

`removePage` (line 23698-23721) always writes to `panel.pages` and never touches `pendingPages`:

```js
function removePage(id){
    const remaining=pages.filter(p=>p.id!==id);      // filters from pendingPages-derived list
    let updated={...panel,pages:remaining};            // writes to panel.pages
    // ... (clear-all logic if remaining.length===0)
    onUpdate(updated);                                 // updates React state
    try{onSaveImmediate(updated);}catch(e){}           // saves to Firestore (strips dataUrl!)
}
```

**Problem 1 — Delete has no visible effect:** After `onUpdate`, `panel.pages` has the remaining pages, but `pendingPages` is unchanged. On re-render, `_pendingBase.length > 0` is still true, so `pages = _pendingBase` — the deleted page reappears.

**Problem 2 — Images go black:** `onSaveImmediate` writes `panel.pages` to Firestore, which strips `dataUrl` (line 8917). If any subsequent event causes `pendingPages` to clear (component remount from navigation, React key change, etc.), the display falls back to `savedPages` from `panel.pages`. Those pages have NO `dataUrl` (stripped by Firestore) and NO `storageUrl` (never uploaded — that happens during extraction). With `src={pg.dataUrl||pg.storageUrl}` resolving to `undefined`, the `<img>` renders its dark `#080810` background — appearing "black." The absolutely-positioned delete buttons (line 26143-26146) remain visible because they don't depend on image content.

**Problem 3 — Premature Firestore write:** Pages in pre-extraction state haven't been "confirmed" yet. Writing them to Firestore via `onSaveImmediate` is wrong — it persists uncommitted user intent and creates the `dataUrl`-stripping that enables Problem 2.

---

## 2. Fix Design

### Strategy

Make `removePage` pre-extraction-aware. When `pendingPages.length > 0`:
1. Update `pendingPages` directly (not `panel.pages`)
2. Update `pendingNewItemsRef` (track which items are new)
3. Update `_pendingPagesCache` (survives in-app navigation)
4. Do NOT call `onUpdate` or `onSaveImmediate` (pages aren't persisted yet)
5. If all pages removed: clear pre-extraction UI state entirely

When `pendingPages.length === 0` (post-extraction): current behavior unchanged.

### "Proceed with Extraction" button enhancement

Show a live page count so the user sees the effect of their deletions, and disable when the list is empty:

- Default: "Proceed with Extraction" (no count)
- After deletions: "Proceed with Extraction (5 pages)" (count shown when < original total)
- All deleted: Button disabled, tooltip "Drop drawing pages to begin"

---

## 3. Durability — Explicit State Contract

### What survives what

| State | In-app navigation | Browser refresh / reopen |
|-------|-------------------|--------------------------|
| Pending pages (dropped files) | YES — `_pendingPagesCache` (module-scope) | NO — cache is in-memory only |
| Page type changes | YES — stored in `pendingPages` objects, cached | NO — same cache |
| Extraction notes | YES — React state survives navigation | NO — component unmounts |
| **Pre-extraction page deletes** | **YES — updated in `_pendingPagesCache`** | **NO — same cache** |

### Why this is correct

All pre-extraction state is **uncommitted by definition**. The user hasn't clicked "Proceed with Extraction." Losing uncommitted state on refresh is expected — it's the same behavior as an unsaved form in any web app. The user re-drops their PDF and starts the review again.

### Why this is NOT the #65b pattern

The #65b bug (`init.panels` stale closure) overwrote **committed Firestore data** with stale React state. The damage was:
- Real data in Firestore was silently replaced
- Users didn't know it happened
- Recovery required manual Firestore intervention

This design is the opposite:
- Pre-extraction state is **never written** to Firestore
- Nothing is overwritten on refresh — Firestore is untouched
- The user sees their panel in its last-committed state (whatever was there before the file drop)
- Re-dropping the file is trivial (< 5 seconds)

---

## 4. Implementation Plan for Marc

### Pre-implementation checklist

Before writing code, verify these line numbers match the current v1.20.79 codebase:

| Reference | Expected line | Content to verify |
|-----------|---------------|-------------------|
| `pendingPagesCache` functions | 433-438 | `let _pendingPagesCache={};` |
| `PanelCard` function signature | 22114 | `function PanelCard({panel,idx,uid,...` |
| `awaitingConfirm` state | 22183 | `const [awaitingConfirm,setAwaitingConfirm]=useState(false);` |
| `pendingPages` state | 22451 | `const [pendingPages,setPendingPages]=useState([]);` |
| Cache restore `useEffect` | 22234-22241 | `const cached=pendingPagesGet(panel.id);` |
| `pages` derivation | 22785-22787 | `const pages=_pendingBase.length>0?_pendingBase:savedPages;` |
| `removePage` | 23698-23721 | `function removePage(id){` |
| `confirmAndExtract` | 23083 | `async function confirmAndExtract(){` |
| `livePages` in confirmAndExtract | 23105 | `const livePages=pendingPages.length>0?pendingPages:(panel.pages||[]);` |
| Thumbnail card start | 26140 | `<div key={pg.id} style={{flexShrink:0,width:420,...` |
| Delete button | 26143-26146 | `{!readOnly&&<button data-tip=...>✕</button>}` |
| Proceed button | 26350-26352 | `<button...onClick={confirmAndExtract}...>Proceed with Extraction</button>` |

### Change sites (3 total)

#### Site 1: `removePage` rewrite (line 23698-23721)

**Find (entire function):**
```js
  function removePage(id){
    const remaining=pages.filter(p=>p.id!==id);
    let updated={...panel,pages:remaining};
    if(remaining.length===0){
      // DECISION(v1.19.658): When all drawings are removed, clear EVERYTHING derived from
      // them — including laborData, bomAudit, bomVerification, engineeringQuestions,
      // aiExtractedTitleBlock, extractionReport, and supply voltages. Previously laborData
      // persisted after the drawings that produced it were gone, leaving stale labor hours
      // on an otherwise empty panel.
      updated={...updated,
        drawingNo:"",drawingDesc:"",drawingRev:"",
        bom:[],validation:null,pricing:null,budgetaryQuote:null,
        hazardousLocation:null,status:"draft",
        laborData:null,bomAudit:null,bomVerification:null,
        engineeringQuestions:[],aiQuestions:[],
        aiExtractedTitleBlock:null,extractionReport:null,
        supplyVoltage:"",controlVoltage:"",
        extractionFeedbackLog:[],
      };
      setDraftNo("");setDraftDesc("");setDraftRev("");ep.stop();setErr("");
    }
    onUpdate(updated);
    try{onSaveImmediate(updated);}catch(e){}
  }
```

**Replace with:**
```js
  function removePage(id){
    if(pendingPages.length>0){
      const updatedPending=pendingPages.filter(p=>p.id!==id);
      if(reasonPickerFor===id)setReasonPickerFor(null);
      if(updatedPending.length>0){
        setPendingPages(updatedPending);
        const updatedNewItems=(pendingNewItemsRef.current||[]).filter(it=>it.id!==id);
        pendingNewItemsRef.current=updatedNewItems;
        pendingPagesSet(panel.id,{pages:updatedPending,newItems:updatedNewItems,awaiting:awaitingConfirm});
      }else{
        setPendingPages([]);
        pendingNewItemsRef.current=[];
        pendingPagesClear(panel.id);
        setAwaitingConfirm(false);
        setExtractionNotes("");
        bgDone(panel.id,"All pages removed");
      }
      return;
    }
    const remaining=pages.filter(p=>p.id!==id);
    let updated={...panel,pages:remaining};
    if(remaining.length===0){
      updated={...updated,
        drawingNo:"",drawingDesc:"",drawingRev:"",
        bom:[],validation:null,pricing:null,budgetaryQuote:null,
        hazardousLocation:null,status:"draft",
        laborData:null,bomAudit:null,bomVerification:null,
        engineeringQuestions:[],aiQuestions:[],
        aiExtractedTitleBlock:null,extractionReport:null,
        supplyVoltage:"",controlVoltage:"",
        extractionFeedbackLog:[],
      };
      setDraftNo("");setDraftDesc("");setDraftRev("");ep.stop();setErr("");
    }
    onUpdate(updated);
    try{onSaveImmediate(updated);}catch(e){}
  }
```

**What changed:**
- Pre-extraction branch (top): updates `pendingPages`, `pendingNewItemsRef`, and `_pendingPagesCache`. No Firestore write. No `onUpdate`.
- Post-extraction branch (bottom): unchanged from today.
- All-pages-removed in pre-extraction: clears `pendingPages`, cache, `awaitingConfirm`, extraction notes, signals bgTask done. Panel returns to empty drop-zone state.

#### Site 2: "Proceed with Extraction" button — live count + disable (line 26350-26352)

**Find:**
```
            <button data-tip="Confirm drawing types are correct and begin BOM extraction, validation, and pricing" onClick={confirmAndExtract} style={{flexShrink:0,background:C.accent,color:"#fff",border:"none",borderRadius:7,padding:"9px 22px",fontSize:13,fontWeight:700,cursor:"pointer",whiteSpace:"nowrap"}}>
              Proceed with Extraction
            </button>
```

**Replace with:**
```
            {(()=>{const _n=pages.length;const _origN=(pendingNewItemsRef.current||[]).length+(panel.pages||[]).filter(p=>!p.ecoId).length;const _showCount=_n>0&&_n<_origN;return(
            <button data-tip={_n===0?"Drop drawing pages to begin":"Confirm drawing types are correct and begin BOM extraction, validation, and pricing"} onClick={confirmAndExtract} disabled={_n===0} style={{flexShrink:0,background:_n===0?C.muted:C.accent,color:"#fff",border:"none",borderRadius:7,padding:"9px 22px",fontSize:13,fontWeight:700,cursor:_n===0?"not-allowed":"pointer",whiteSpace:"nowrap",opacity:_n===0?0.5:1}}>
              Proceed with Extraction{_showCount?` (${_n} page${_n!==1?"s":""})`:""}
            </button>);})()}
```

**Behavior:**
- Default (no deletions): "Proceed with Extraction" — no count
- After deletions: "Proceed with Extraction (5 pages)" — count shown when pages were removed
- All deleted: Button disabled, greyed out, tooltip "Drop drawing pages to begin"

**How `_origN` works:** Sum of `pendingNewItemsRef.current.length` (new items from this drop) + `panel.pages` non-ECO count (existing saved pages pulled into `livePages` by `addFiles`). This is the page count at the start of the review session. If `pages.length < _origN`, the user deleted some, so show the count. If they deleted none, no count — clean button text.

#### Site 3: `tagPage` — guard against stale pendingPages references (line 23655-23678)

No code change needed. `tagPage` at line 23678 already uses `setPendingPages(pp=>pp.map(...))` — the functional updater reads the latest state. After a `removePage` call updates `pendingPages`, `tagPage` will correctly operate on the reduced set. Verified safe.

---

## 5. Edge Cases

### User deletes a page, then changes type tags on another page

`tagPage` (line 23678) uses the functional updater `setPendingPages(pp=>pp.map(...))` which reads the latest `pendingPages` state. Since `removePage` (pre-extraction) calls `setPendingPages(updatedPending)`, React guarantees `tagPage` sees the post-deletion state. No stale closure risk.

### User deletes all pages

The pre-extraction branch clears `pendingPages`, `awaitingConfirm`, extraction notes, and the cache. `bgDone` signals the background task as complete. The panel returns to the empty drop-zone state. The user can drop new files.

### User deletes pages then navigates away and back

`removePage` updates `_pendingPagesCache` via `pendingPagesSet`. On return, the cache-restore `useEffect` (line 22234-22241) rehydrates `pendingPages` from the cache — with the deleted page already gone. Images display correctly (dataUrl preserved in pendingPages objects).

### User deletes pages then browser refreshes

Pre-extraction state is lost (`_pendingPagesCache` is memory-only). Panel shows its last Firestore-committed state. User re-drops their PDF. This is correct — see Section 3.

### User deletes a page from a PREVIOUS extraction (existing saved page in pending set)

`addFiles` starts `livePages` from `panel.pages` (existing Firestore pages) + new items. These all end up in `pendingPages`. If the user deletes an existing saved page via the X button, the pre-extraction `removePage` removes it from `pendingPages` only (not Firestore). When `confirmAndExtract` runs, it writes `panel.pages = livePages` (from pendingPages, line 23105-23108), which no longer includes the deleted page. The Firestore save at line 23118 persists this. The page is permanently removed on commit.

### Post-extraction delete unchanged

When `pendingPages.length === 0` (post-extraction), `removePage` follows its existing code path: updates `panel.pages` via `onUpdate`, saves to Firestore via `onSaveImmediate`. No change to this behavior.

### Delete-after-classify backtrack (step 4 → step 3)

If the user tags a page with types/regions, then backtracks and deletes it, three downstream references hold the deleted page ID:

1. **`pageTypeChangesRef.current[id]`** — stale entry. Safe: `confirmAndExtract` (line 23091-23094) does `allPages.find(p=>p.id===pid)` → `undefined` → `if(!pg)continue` skips it.

2. **`reasonPickerFor` state** — if the reason picker modal is open for the deleted page. Cleaned up: the replacement code adds `if(reasonPickerFor===id)setReasonPickerFor(null)`.

3. **`pendingNewItemsRef.current`** — cleaned up: the replacement code filters it: `(pendingNewItemsRef.current||[]).filter(it=>it.id!==id)`.

All three are either cleaned up or safely ignored. The backtrack path is clean.

---

## 6. LOC Estimate

| Site | Change | LOC |
|------|--------|-----|
| Site 1: `removePage` rewrite | Replace 24 lines with 33 lines | +9 |
| Site 2: Proceed button with count + disable | Replace 3 lines with 4 lines | +1 |
| **Total** | | **~10 LOC net** |

---

## 7. Commit message

```
Fix #77 + #78: pre-extraction page delete updates pendingPages

#77: removePage now updates pendingPages directly in pre-extraction state,
skipping the panel.pages/Firestore write that caused pages to reappear or
images to go black (dataUrl stripped by Firestore save path).

#78: Pre-extraction page deletion now works as intended — deleted pages are
removed from the pending list, cache updated for navigation survival. All
pages deleted clears pre-extraction state. "Proceed with Extraction" shows
live page count after deletions and disables when list is empty.

Durability: pre-extraction deletes survive in-app navigation (module-scope
cache) but not browser refresh (cache is memory-only). This matches all
other pre-extraction state and is intentional.
```

---

## 8. Verification Steps

### #77 — Page delete works pre-extraction

1. **Delete one page:** Drop a multi-page PDF. Click X on one page. Verify:
   - The page disappears immediately
   - Remaining pages keep their images (not black)
   - The page doesn't reappear on any subsequent action
   - "Proceed with Extraction" shows page count

2. **Delete all pages:** Drop a PDF. Delete all pages one by one. Verify:
   - Yellow "Review drawing types" banner disappears after last deletion
   - Panel returns to empty drop zone state
   - "Proceed with Extraction" button is disabled (or gone with the banner)
   - No errors in console

3. **Delete then navigate:** Drop a PDF, delete one page, navigate to another panel, navigate back. Verify:
   - The deleted page is still gone (cache preserved correctly)
   - Remaining pages still show images

4. **Delete then extract:** Drop a multi-page PDF, delete one page, click "Proceed with Extraction." Verify:
   - Extraction runs on remaining pages only
   - Deleted page is NOT in `panel.pages` after extraction
   - BOM does not contain data from the deleted page

5. **Post-extraction delete still works:** Extract a panel's BOM. Then delete a page from the extracted panel. Verify:
   - Page is removed and saved to Firestore
   - Images of remaining pages are intact
   - This is the OLD behavior — should be unchanged

### Durability

6. **Navigation survival:** Drop a PDF, delete one page, navigate to dashboard, navigate back to project. Verify deleted page is still gone.

7. **Refresh resets:** Drop a PDF, delete one page, refresh the browser, reopen the project. Verify pre-extraction state is gone — panel shows its last committed state. This is expected.

---

## 9. Dependencies

- No new dependencies, imports, or state variables
- No changes to Firestore schema
- No changes to `saveProjectPanel`, `confirmAndExtract`, or any save path
- No changes to `tagPage` — its functional updater pattern is already safe
- `bgDone` is already available in PanelCard scope (via `useBgTasks`)
- `pendingPagesSet`, `pendingPagesClear` are module-scope (lines 433-438)
- `setExtractionNotes` is already a state setter in PanelCard (line 22184)
