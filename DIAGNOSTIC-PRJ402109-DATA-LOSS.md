# DIAGNOSTIC-PRJ402109-DATA-LOSS.md

**Severity:** CRITICAL — Active data loss in production
**Date:** 2026-06-01
**Author:** Coach (Senior Development Engineer, Architecture)
**Status:** Root cause identified. Fix not yet implemented (per Jon's instruction).

---

## 1. INCIDENT SUMMARY

**Project:** PRJ402109
**Reporter:** Noah (via Jon)
**Symptoms:** ~30 minutes of BOM edits disappeared. Jon and Noah, both viewing the same project simultaneously, observed BOM rows thrashing — edits appearing and then reverting, data flickering between states.

**Introduced in:** v1.20.60 (TODO #65b — bomSyncHash persistence on open-sync)

---

## 2. SNAPSHOT — PRJ402109

Coach session cannot access Firestore directly. CCD or Jon should capture the current Firestore state of PRJ402109 to confirm whether the BOM data reflects Noah's intended edits or the stale mount-time state.

**What to check:**
- Compare current panel BOM data against Noah's expected state
- Check `updatedBy` and `updatedAt` fields to see which user's save "won"
- Check `bomSyncHash` values — if populated, the open-sync write ran

---

## 3. ROOT CAUSE ANALYSIS

### Primary cause: Stale data write in open-sync bomSyncHash persistence

**Location:** `src/app.jsx` lines 34875–34891

**The bug:**

`ProjectView` receives the project as a prop named `init` (line 34079):
```js
function ProjectView({project:init, uid, ...}) {
```

`init` captures the project state at component mount time. It is never updated by user edits — those flow through `projectRef.current` and the `project` state variable.

The open-sync bomSyncHash write (added in #65b) fires 3 seconds after mount via `setTimeout`. It iterates `init.panels` — the STALE mount-time data:

```js
// Line 34880-34891
for(let i=0;i<(init.panels||[]).length;i++){
  const p=init.panels[i];                          // STALE — mount-time panel
  const curHash=computePanelBomHash(p);
  if(curHash===(p.bomSyncHash||"")){continue;}
  try{
    await bcSyncPanelPlanningLines(bcNum,i+1,p,init.name);
    synced++;
    const hashed={...p,bomSyncHash:curHash};        // Spreads STALE panel + new hash
    init.panels[i]=hashed;                          // Mutates the prop (anti-pattern)
    saveProjectPanel(uid,init.id,p.id,hashed,true)  // Writes STALE data to Firestore
      .catch(e=>console.warn(...));
  }catch(e){...}
}
```

**What happens:**
1. User opens project → `init` captures the project state at that moment
2. User begins editing BOM rows → edits flow through `projectRef.current` / `setProject`, saved to Firestore via `saveImmediatePanel` → `saveProjectPanel`
3. 3 seconds after open, the bomSyncHash `setTimeout` fires
4. For each panel with a hash mismatch, it calls `saveProjectPanel` with `{...init.panels[i], bomSyncHash: curHash}` — the mount-time panel data, NOT the current edited data
5. `saveProjectPanel` reads the current Firestore doc, replaces the target panel with the stale data, and writes it back
6. **All BOM edits made since mount are overwritten**

**Timeline for Noah's incident:**
- Noah opens PRJ402109 — `init` captures the BOM state at open time
- Noah edits BOMs for ~30 minutes — edits saved to Firestore normally
- The open-sync ran at T+3s but if BOM hashes hadn't changed at mount time, it may have been a no-op initially. However, if any panel had a stale hash, the sync would fire and write stale data
- Jon opens the same project — Jon's `init` captures whatever state Firestore has at that moment
- Jon's open-sync fires at T+3s from Jon's open, writing Jon's `init` (which may or may not include Noah's latest edits depending on exact timing)
- Each stale write triggers the other user's `onSnapshot`, but the concurrent edit detection fails (see secondary cause below), creating the observed thrashing

### Secondary cause: `saveProjectPanel` does not set `updatedBy`

**Location:** `src/app.jsx` line 8735–8878

`saveProject` (line 8656) sets `updatedBy: uid` on every save:
```js
const stripped={...data, updatedBy:uid, updatedAt:Date.now(), ...};
```

`saveProjectPanel` does NOT set `updatedBy`. It reads the Firestore doc, replaces one panel, and writes back — but the `updatedBy` field retains whatever value it had before.

**Impact on concurrent edit detection:**

The `onSnapshot` handler (line 34476) only soft-applies remote updates when `remote.updatedBy !== uid`:
```js
if(remote.updatedBy && remote.updatedBy !== uid){
  // soft-apply remote update
}
```

Since the open-sync's `saveProjectPanel` call doesn't set `updatedBy`, the field retains the previous value. If the previous `updatedBy` was the same user (because their last full save set it), then `remote.updatedBy === uid` and the soft-apply is SKIPPED. The user's local state diverges from Firestore truth without any notification.

With two users, the thrashing pattern is:
1. Noah's open-sync writes stale data (no `updatedBy` change)
2. Jon's `onSnapshot` sees `updatedBy` unchanged → may skip soft-apply OR may apply (depends on who did the last full save)
3. Jon's open-sync writes different stale data (no `updatedBy` change)
4. Noah's `onSnapshot` fires → same ambiguity
5. Result: unpredictable state oscillation

### Tertiary issue: Prop mutation

Line 34890 (`init.panels[i]=hashed`) directly mutates the component prop. This is a React anti-pattern — props should be immutable. While not the primary data-loss mechanism, it could cause additional subtle rendering bugs if the parent component re-renders with the mutated prop.

---

## 4. WHY THE PRE-PRINT SYNC IS NOT AFFECTED

The pre-print sync (line 36464) uses `projectRef.current` — the live, continuously-updated reference to the project state. This is the correct pattern. The open-sync should use the same reference.

---

## 5. RECOMMENDED FIX

**Scope:** Lines 34880–34891 in `src/app.jsx`

Replace the stale `init.panels[i]` reference with `projectRef.current.panels`:

```js
// FIXED version
for(let i=0;i<(init.panels||[]).length;i++){
  const currentPanel = projectRef.current.panels.find(cp => cp.id === init.panels[i].id);
  if(!currentPanel) continue; // panel was deleted since mount
  const curHash = computePanelBomHash(currentPanel);
  if(curHash === (currentPanel.bomSyncHash || "")) continue;
  try{
    await bcSyncPanelPlanningLines(bcNum, i+1, currentPanel, projectRef.current.name);
    synced++;
    const hashed = {...currentPanel, bomSyncHash: curHash};
    // DO NOT mutate init.panels — write only to Firestore
    saveProjectPanel(uid, init.id, currentPanel.id, hashed, true)
      .catch(e => console.warn("Open BC sync hash save failed panel", i+1, ":", e));
  }catch(e){console.warn("Open BC sync panel",i+1,"failed:",e);}
}
```

**Changes:**
1. Read from `projectRef.current.panels` (live state) instead of `init.panels` (stale mount-time state)
2. Use `.find(cp => cp.id === init.panels[i].id)` to locate the panel by ID — safe even if panels were reordered or deleted since mount
3. Remove the `init.panels[i] = hashed` prop mutation (line 34890)
4. Use `projectRef.current.name` instead of `init.name` for the project name passed to BC sync

**Separate follow-up (not blocking):** Add `updatedBy: uid` to `saveProjectPanel` writes so concurrent edit detection works reliably for panel-level saves. This is a broader change that affects all `saveProjectPanel` callers and should be scoped carefully.

---

## 6. INTERIM MITIGATION

If the fix cannot be deployed immediately, comment out the hash persistence (lines 34889–34891) to stop the stale write:

```js
// INTERIM: Disabled hash write — causes stale data overwrite (DIAGNOSTIC-PRJ402109)
// const hashed={...p,bomSyncHash:curHash};
// init.panels[i]=hashed;
// saveProjectPanel(uid,init.id,p.id,hashed,true).catch(...);
```

**Impact of mitigation:**
- BC planning line sync still runs (line 34885 is untouched) — no BC regression
- `bomSyncHash` is not persisted → next project open will re-sync panels that were already synced
- This is harmless: re-syncing is idempotent and just costs a few extra BC calls on open
- **No data loss risk**

---

## 7. BLAST RADIUS ASSESSMENT

### Who is affected?
Any project opened in v1.20.60+ where:
- The project has BC linkage (bcProjectNo exists)
- At least one panel has a BOM with a stale or missing `bomSyncHash`
- The user edits BOM data before the 3-second open-sync timer fires AND completes

### How likely is data loss in practice?
**Moderate-to-high.** The 3-second timer means most users will have made at most a few clicks before the sync fires. But the sync itself is async — `bcSyncPanelPlanningLines` can take seconds per panel. If a project has many panels, the loop runs sequentially and the last panels are saved well after the user has been actively editing. Noah's 30-minute loss suggests the sync took a long time (many panels) and the stale write landed after significant editing.

### Is any data permanently lost?
Possibly. If no other mechanism captured Noah's edits between saves, the Firestore doc was overwritten with stale data. Firestore does not have built-in versioning. However, if Noah's edits triggered `saveImmediatePanel` calls that completed BEFORE the open-sync overwrote them, those intermediate states existed momentarily in Firestore but are now gone.

**Recovery options:**
- Check if a Firestore backup captured the correct state
- Check Firestore audit logs (if enabled) for the overwritten document
- Noah may need to re-enter the lost edits manually

---

## 8. RELATED RISK — OTHER `init` REFERENCES

The open-sync bomSyncHash write is the most dangerous `init` reference because it writes back to Firestore. A broader audit of all `init.*` references within `ProjectView`'s effects should be done to identify any other cases where stale mount-time data is used in write paths. This is NOT urgent but should be on the backlog.

---

## REVISION HISTORY

- v1.0 (2026-06-01) — Initial diagnostic, root cause identified
