# MatrixARC Concurrency & Multi-User Safety Analysis

**Date**: 2026-05-01
**Version analyzed**: v1.19.954 (master branch tip; some code on `claude/trusting-jackson-749610` worktree)
**Scope**: Internal ARC users editing the same project simultaneously, supplier-portal uploaders, customer-review-portal users, and Firestore/Cloud-Function/FCM scaling under concurrent load.

---

## Executive Summary

MatrixARC has a clear concurrency mental model — owner-priority + presence + soft-applied snapshots — but several places defeat it in practice. The single largest risk is the **interaction between `saveProjectPanel`'s mutex and `saveProject`'s read-modify-write**: the per-panel lock is project-level, but `saveProject` (the whole-project save path used by every `safeSave` call) does NOT take that lock, so a `saveProject` and a `saveProjectPanel` can interleave and one will silently overwrite the other's panel-level changes. The high-water marks are in-memory per-tab, so they protect against a single browser's stale state but provide **zero protection against User-A and User-B saving the same project within milliseconds of each other** — that path is pure last-write-wins with no Firestore transaction.

The supplier portal's batched Anthropic calls (20 pages each, sequential per supplier) plus the per-user API key model means **two suppliers uploading 60-page PDFs against the same ARC user account will share that user's Anthropic rate-limit bucket**, and the Cloud Function has no concurrency control. At Tier-1 (1000 RPM/40k ITPM input-tokens), a busy day where 5 suppliers all upload hundred-page quotes can hit 529 overloaded responses, and the portal has only a partial-result fallback (it preserves accumulated state, but tells the supplier "fill in manually below" — they will not).

| Severity | Count | Top item |
|---|---|---|
| Will-Break-Production | 2 | `saveProject`/`saveProjectPanel` mutex desync overwrites cross-user edits |
| High | 6 | Anthropic rate-limit collisions across suppliers; quote-counter contention; project-doc 1MB limit on heavy ECO histories |
| Medium | 7 | BC offline queue is per-tab; FCM duplicate notifications across devices; presence heartbeat orphans |
| Low | 4 | Snapshot listener race on first project open; ECO scope drift on snapshot |
| Informational | 3 | Spark vs Blaze quotas; Cloud Function cold start; Firestore free-tier reads |

**Top 3 priorities**:
1. **Fix the `saveProject` ↔ `saveProjectPanel` lock asymmetry** (Will-Break finding #1). Either run both through the same per-project mutex or switch the whole-project save to a Firestore transaction.
2. **Add per-user concurrency throttling on `extractSupplierQuotePricing`** (High finding #1) so two suppliers uploading at once don't blow through the user's Anthropic rate budget; queue the second upload and surface a "your quote is being processed — large queue" message.
3. **Move the 1MB project doc to a panels subcollection or `bom`-shard** (High finding #3) before a long-running project with 50 ECOs and full audit histories silently starts losing saves.

---

## Will-Break-Production findings

### WBP-1: `saveProject` does not honor `saveProjectPanel`'s mutex — interleaved saves drop changes

**Severity**: Will-Break-Production
**Scenario**: User-A is mid-extraction on Panel-1 (background `saveProjectPanel(uid, projectId, p1.id, latestPanel)` is running). Simultaneously User-A clicks "Send Quote" or any UI control that invokes `safeSave(uid, projectRef.current)` → which calls `saveProject(uid, project)`. Or: User-B saves a quote field at the same moment User-A's extraction finishes.
**What happens**: `saveProjectPanel` (line 7022) acquires `_panelSaveLocks[projectId]`, fetches Firestore, merges the target panel, writes back. `saveProject` (line 6812) does not check that lock at all — it does its own `ref.get()` (line 6853) and `ref.set(toSave)` (line 6966) on the entire project doc. If `saveProject` reads after `saveProjectPanel`'s `.get()` but writes before `saveProjectPanel`'s `.set()`, the panel write will land last and overwrite the project-level fields (`quoteRev`, `lastQuoteHash`, `quote.*`, `ecoSummary`, etc.) that `saveProject` just persisted. Conversely, if the order flips, the panel update gets clobbered. The in-memory `_saveHighWater` only catches "panels disappear or shrink to zero" — it does **not** catch field-level regressions for non-empty panels.
**Location**: `src/app.jsx:6812-6967` (`saveProject`), `src/app.jsx:7021-7160` (`saveProjectPanel`), `_panelSaveLocks` defined line 7021 only used by the latter.
**Recommended fix**: Make `saveProject` also acquire `_panelSaveLocks[project.id]`. Better yet, route the entire project-save path through a Firestore transaction that compares `updatedAt`/`updatedBy` to the read snapshot and retries on mismatch (this is the textbook fix for last-write-wins).

### WBP-2: `_saveHighWater` is per-tab — concurrent users get zero protection against each other

**Severity**: Will-Break-Production
**Scenario**: User-A opens PRJ402083 and edits BOM rows. User-B opens the same project in another browser. The `onSnapshot` listener (line 29196) soft-applies User-A's writes into User-B's React state. User-B then clicks "Apply Cross" or any control that mutates state and triggers a save — User-B's tab has its OWN empty `_saveHighWater` (it's just an in-memory object on `window`, line 6811). User-B's save reads Firestore, sees User-A's recent writes, but `_saveHighWater` doesn't know about them at all. If User-B's React state is missing any panel because of timing (e.g. soft-apply didn't land yet), the high-water guard at line 6822 fires only against User-B's own first-save baseline, not against User-A's actual reality.
**What happens**: A new user opening a project right after another user dropped a panel will see `hw.panelCount === 0` (or undefined), so any save passes the guard. Combined with the soft-apply gap window, this is a concrete way for User-B to overwrite User-A's panel adds.
**Location**: `src/app.jsx:6811` (`_saveHighWater={}` declared as global module state, never persisted).
**Recommended fix**: Read the high-water from Firestore at save time — or better, use the read inside a Firestore transaction that aborts on `updatedAt` regression (server-authoritative). The current per-tab in-memory marker is a partial defense and should not be relied on for cross-user safety.

---

## High findings

### H-1: Anthropic rate limits collide across simultaneous supplier uploads

**Severity**: High
**Scenario**: Three suppliers receive RFQ emails on the same day. Each opens their portal upload page and drops a 60-page PDF. Cloud Function `extractSupplierQuotePricing` runs three times, each with `pageImages.slice(0, 20)` per call (`functions/index.js:692`), each sending a single Sonnet 4 request with 20 base64 images.
**What happens**: All three suppliers' uploads hit the SAME Anthropic API key (`users/{uid}/config/api`, fetched line 681) — that's ARC user Jon's key. Three concurrent ~20-image Sonnet calls sum roughly 60-120k input tokens in flight. Anthropic Tier-1 limits are ~40k input tokens/min and ~50 RPM for Sonnet; Tier-2 is 80k ITPM. Multi-batch PDFs (90+ pages = 5 sequential batches each) easily push three concurrent suppliers into 429/529. The portal's catch block (`src/app.jsx:38319`) does preserve partial state, but tells the supplier "manual entry below" — that's a poor experience and will result in suppliers giving up or sending price emails out-of-band, defeating the whole portal automation.
**Location**: `functions/index.js:665-817` (no concurrency guard, no per-user queue, no retry/backoff). `src/app.jsx:38256-38299` (sequential per-supplier batches, but no cross-supplier coordination).
**Recommended fix**: Add a per-uid mutex/semaphore on the Cloud Function (Firestore-based or Redis-on-Memorystore). Process one supplier extraction at a time per uid; queue subsequent uploads with a "your quote is being processed, est. wait time…" UI in the portal. Also implement explicit retry with exponential backoff on 429/529 responses.

### H-2: Quote counter transaction is fine, but UI doesn't gate concurrent prints

**Severity**: High
**Scenario**: User-A and User-B both open the same project, both click "Print Client Quote" within the same second. `getNextQuoteNumber` (line 1714) uses `runTransaction`, so the COUNTER is safe — but each user gets a different quote number on their PDF. Both saves hit the project doc with `lastQuotePrintedAt` and `quoteRev`-related fields; one overwrites the other, but the actual sent quote PDFs are mismatched.
**What happens**: Customer receives two quotes with different numbers (e.g. MTX-Q205000 and MTX-Q205001), both purportedly the latest revision, contents may differ if the BOM was being edited mid-print. The transaction guarantees uniqueness of the counter but does NOT guarantee single-print semantics.
**Location**: `src/app.jsx:1714-1725` (counter), `src/app.jsx:29647-29651` (auto-print useEffect).
**Recommended fix**: Add a presence-based "someone else is printing" lock similar to Owner Priority Mode but for the print path specifically. Or set `quotePrintLockedBy/At` in Firestore at the start of print; refuse a second print within ~30 seconds.

### H-3: Project doc 1MB limit can be hit by heavy ECO/audit histories

**Severity**: High
**Scenario**: A long-running project accumulates 30 ECOs (each with their own BOMs in `ecoSummary` + per-row deltas), 100+ engineeringQuestions, 50+ extractionFeedbackLog entries, 5000+ BOM rows split across 10 panels, all `reviewNotes`/`reviewShapes` from multiple review rounds, and BC supplier metadata stamped on every row.
**What happens**: Firestore has a hard 1MB-per-document ceiling. A 5000-row BOM with full row metadata (~200 bytes/row) is already 1MB on its own. The `dataUrl` is stripped, but `bcFuzzySuggestions`, `extractionFeedbackLog`, `reviewNotes` arrays, ECO `bomDelta` rows, and `cannotSupply` records all contribute. When the doc hits 1MB, `ref.set(toSave)` will throw `INVALID_ARGUMENT: Document size exceeds maximum`. `safeSave` retries 2 more times, then surfaces the "Save failed — changes may not be persisted" banner. The CLAUDE.md rule "never lose user data" is violated because subsequent saves from any user on that project all fail silently after the banner is dismissed.
**Location**: `src/app.jsx:6964-6967` (single set on whole doc); CLAUDE.md "Firestore Data Locations" implicitly admits everything is in one doc.
**Recommended fix**: Move panels into a subcollection `users/{uid}/projects/{id}/panels/{panelId}` (each panel is bounded). The project doc keeps only `panelOrder`, `quote`, `ecoSummary` (just labels + status), and project-level metadata. Pre-existing projects can be migrated lazily. Failing that, monitor doc size in `saveProject` and warn at 750KB.

### H-4: Firestore 1-write-per-second soft cap on project doc

**Severity**: High
**Scenario**: User is rapidly editing BOM rows during a multi-edit session (each keystroke fires per-row code paths that may eventually call `saveProjectPanel`). Two users do this on the same project simultaneously. Background extraction is running, calling `saveProjectPanel` every stage. BC sync fires `safeSave`. Five `setProject`-driven flushes per second is plausible.
**What happens**: Firestore enforces a soft limit of ~1 sustained write per document per second; bursts are tolerated, but sustained higher rates start returning `RESOURCE_EXHAUSTED` or get throttled with elevated latency. Combined with `onSnapshot` rebroadcast (every write fires snapshots back to every listener, which on `ProjectView` triggers React re-renders that may trigger more saves via auto-effects), a thrash spiral becomes possible.
**Location**: All `safeSave`/`saveProject`/`saveProjectPanel` call sites; especially the BOM cell-level edits in `PanelCard`.
**Recommended fix**: Add a true debounce to `saveProjectPanel` callers (e.g. `_pendingPanelSaves[panelId]`, batched 500ms). Many call sites already use `update()` then `safeSave()`, but they don't coordinate across cells. Also: review `useEffect`s that auto-save on every state change.

### H-5: Concurrent ECO drafts on the same project — no enforcement of "one draft at a time"

**Severity**: High
**Scenario**: User-A clicks "+ New ECO" on PRJ402083. Optimistic local state flips `activeScope` to the new ECO before Firestore confirms (acknowledged at line 29291-29304 in the comments). User-B, on a different machine, also clicks "+ New ECO" at the same moment.
**What happens**: Two different ECOs get created with different `ecoId`s but possibly the same number (the `ecoCounter` increment is in `update` paths but not transactional in all of them). Even when numbers are unique, two simultaneous "active drafts" violate the state-machine assumption that exactly one ECO is editable. The carve-out at line 6922 / 7138 (`_hasActiveEcoSP`) suppresses quote-rev bumps based on "any draft exists" — fine — but the editor UI assumes the single most-recent draft is THE draft.
**Location**: `src/app.jsx:11740` (delete cascade assumes single active), ECO scope detection at line 28867-28874 (picks the `slice(-1)[0]` draft, which is non-deterministic if two are created concurrently).
**Recommended fix**: Wrap "+ New ECO" creation in a Firestore transaction that asserts no `status:"draft"` ECO exists before creating. UI-level disabling on optimistic state isn't enough.

### H-6: `onSnapshot` soft-apply can clobber in-flight local edits

**Severity**: High
**Scenario**: User-A is typing into a BOM row's description field. The local React state is mid-update (un-saved). User-B saves the same project from another machine. Firestore fires `onSnapshot` to User-A's tab (line 29196). User-A's listener detects `remote.updatedBy !== uid`, calls `setProject(migrated)` and overwrites the local in-flight edit (line 29208-29213).
**What happens**: User-A loses the half-typed description. The comment on line 29183 acknowledges this: *"if they do exist and conflict, the user's next auto-save will win (Firestore has no merge, last-write-wins is the existing semantics)"* — but that's only true if the user's next save fires AFTER the soft-apply. If the soft-apply lands during the typing pause, the field has already been replaced before they finish.
**Location**: `src/app.jsx:29188-29225` (concurrent edit listener).
**Recommended fix**: Track focus state on critical input fields; defer the soft-apply if any of them have focus. Or: do a deep-merge that preserves local field-level edits where the remote field is unchanged. Or surface a "remote edit available — refresh?" banner instead of auto-applying when local edits are in-flight.

---

## Medium findings

### M-1: BC offline queue is per-tab — duplicate operations across users

**Severity**: Medium
**Scenario**: BC is offline. User-A enqueues `attachPdf` for PRJ402083 (queued in their browser's `localStorage._arc_bc_queue`). User-B does the same operation on the same project from their browser.
**What happens**: Each user has their own queue. When BC comes back online, both queues drain — BC receives two `attachPdf` calls for the same job, possibly attaching the SAME PDF twice (fileNames are `[QUOTED] CustomerDWG#-MTX-Q######.pdf` so they share a name; `bcCheckAttachmentExists` checks for any PDF, not the exact filename). For `createPurchaseQuote`, two RFQ purchase quotes will be created in BC — one per user.
**Location**: `src/app.jsx:4624-4655` (`localStorage`-backed queue); processing fires on connect (line 37095, 37280).
**Recommended fix**: Move the BC queue to a Firestore subcollection (`companies/{cid}/bcQueue/{id}`), so all users see the same pending ops. Use `runTransaction` to claim each item before executing.

### M-2: FCM duplicate notifications across devices

**Severity**: Medium
**Scenario**: A user signs in to ARC on their work desktop, laptop, and phone. Each registers an FCM token at `users/{uid}/fcmTokens/{tokenHash}` (`public/index.html:428`). A supplier submits a quote.
**What happens**: `sendPushToUser` (functions/index.js:49) iterates all tokens and sends to each — three identical notifications fire. This is presumably intentional (you want any device to get notified), but combined with the `requireInteraction:true` flag (the persistent push notification pattern noted in CLAUDE.md), the user has to dismiss three notifications. There's no `tag`-based deduplication beyond the per-message tag (`tag: quote_${token}` in line 365), and `webpush.fcmOptions.link` doesn't dedupe across devices.
**Location**: `functions/index.js:49-107`.
**Recommended fix**: Use FCM's `topic` subscription with a single per-user topic, and let FCM's own dedupe logic handle device fanout. Alternatively, on web push, set `tag` and the same-tag rule replaces an earlier notification — currently `tag` IS set, so on a single device the second push replaces the first — but across devices (desktop vs phone) you still get distinct notifications. This is mostly a UX issue, not data-loss.

### M-3: Stale tokens accumulate if device is offline > 90 days

**Severity**: Medium
**Scenario**: Old browser session token never re-issued. Push fails silently for that token.
**What happens**: `sendPushToUser` does clean up tokens with `messaging/registration-token-not-registered` (line 85-89), so this is mostly self-healing. But if the user's last active session is on a PWA install that's now uninstalled, the token doc lingers until the next push attempt. Low impact.
**Location**: `functions/index.js:54-103`.
**Recommended fix**: Periodic cleanup job; not urgent.

### M-4: Presence heartbeat orphans flag projects as "in use" by no-one

**Severity**: Medium
**Scenario**: User opens project, browser crashes / closes laptop lid before `beforeunload` fires (laptop lid + Battery Saver suppresses the event), `projectPresence` doc never deleted.
**What happens**: 30-second heartbeat (line 28938) keeps the doc fresh as long as the tab is alive. On unclean shutdown, the doc lingers up to 90 seconds (`stale window`, line 28952) before viewer-list filtering hides it. During that window, Owner Priority Mode may be wrongly active for other users. Mostly self-healing, but on iOS Safari (mobile) the suppression of `beforeunload` is harder to fix.
**Location**: `src/app.jsx:28922-28964`.
**Recommended fix**: Already mostly OK with the 90-second filter. Could shorten to 60s to match the typical heartbeat-loss-detection window. The `lockActive` mirror flag at line 28934 is a clever fix for a related problem.

### M-5: ECO scope drift — two users open ECO 02 in different scopes

**Severity**: Medium
**Scenario**: User-A creates ECO 02 (active scope). User-B has stale state, still seeing BASE scope, edits a BOM row.
**What happens**: User-B's edit lands on BASE rows, but BASE is read-only when ECOs exist (line 29305 `_baseScopeReadOnly`). The UI does block this client-side, but if User-B's snapshot delivery is slow, there's a race window where the edit is allowed locally before the readOnly state catches up. The `onSnapshot` will then soft-apply and overwrite User-B's edits with the remote ECO state.
**Location**: `src/app.jsx:29279-29312` (scope-aware readOnly).
**Recommended fix**: Have ECO creation set `lastEcoActivityAt` which the snapshot listener uses to immediately invalidate any in-flight local ECO-touching mutations.

### M-6: `activeExtractions` doc cleanup — stale ghosts re-flag panels

**Severity**: Medium
**Scenario**: User starts an extraction, kills the tab mid-run. The extraction doc is "running" with a heartbeat that's now frozen.
**What happens**: 30-second stale cutoff filters it out client-side (line 28899). But the startup sweep at line 36867 is per-user — if I'm the only user logging in, the sweep cleans up MY ghosts. If User-B has a ghost from an earlier session, only User-B's next login sweeps it. The doc remains visible (filtered) and counts toward the snapshot listener's read budget.
**Location**: `src/app.jsx:36867-36886`.
**Recommended fix**: Cloud Function scheduled cleanup (e.g. every hour, delete `activeExtractions` docs with `heartbeatAt < now-300s`).

### M-7: Schema-version migration on load can fire silent saves (CLAUDE.md alludes to this)

**Severity**: Medium
**Scenario**: A project loaded via `migrateProjectShape` (line 7173) gets a `_quoteRevManualResetApplied` write or quoteRev normalization (line 7256). Comments at line 29439-29455 acknowledge the v1.19.954 fix that REMOVED a prior auto-save effect.
**What happens**: With the auto-save effect removed, the in-memory normalization is fine — but if any read path saves the project back without re-reading first, the same hash-mismatch could fire bumps. Audit needed.
**Location**: `src/app.jsx:7173-7262` (migrateProjectShape), 29439-29455 (deleted effect comment).
**Recommended fix**: Add a unit-test invariant: "loading a project and saving with no edits should not bump quoteRev." This appears to be a known concern that has been partially addressed.

---

## Low findings

### L-1: First-snapshot apply overwrites dashboard cache (intentional, but watch for regressions)

**Severity**: Low
**Scenario**: User-A drops a panel on PRJ402083, switches to dashboard. User-B opens PRJ402083 — the dashboard's cached project list might be stale.
**What happens**: Comment at line 29191-29194 acknowledges this and the fix: ALWAYS apply the first snapshot from Firestore, overwriting whatever stale cache the dashboard had. This is good. Watch if any future change re-introduces the "skip first load" pattern.
**Location**: `src/app.jsx:29195-29207`.
**Recommended fix**: Existing fix is correct. Add a regression test.

### L-2: `safeSave` retry-on-error swallows specific failure modes

**Severity**: Low
**Scenario**: Save fails with `permission-denied` (e.g. Owner Priority Mode active for non-owner).
**What happens**: `safeSave` retries 2x with 2-second wait, then surfaces the banner (line 6976). Permission-denied is not transient — should not be retried.
**Location**: `src/app.jsx:6972-6983`.
**Recommended fix**: Inspect `e.code`; bail out immediately on `permission-denied`, `failed-precondition`, or other non-transient codes.

### L-3: `_panelSaveLocks` lock per-project key is a JS Promise, not a Firestore mutex — single-tab only

**Severity**: Low
**Scenario**: Two tabs of the same user (or two users on different machines) call `saveProjectPanel` simultaneously.
**What happens**: The mutex is a JS variable on `window` (`const _panelSaveLocks={}`), so it only serializes within a single tab. Cross-tab/cross-user concurrent panel saves still race. Combined with the per-tab nature of `_saveHighWater`, this is the main reason WBP-1/WBP-2 are real.
**Location**: `src/app.jsx:7021-7160`.
**Recommended fix**: Same as WBP-1 — replace with a Firestore transaction.

### L-4: `quote.lineNotes` debounce + auto-refresh fires `update()` on lead-time changes

**Severity**: Low
**Scenario**: User edits a BOM lead-time. `_leadDriversRefreshTimer` (line 29522) fires 500ms later, calls `update()` which sets state and chains to `onChange`. Multiple rapid edits queue multiple timers.
**What happens**: The `clearTimeout` on every keystroke drops the prior timer, so only the trailing 500ms fires — fine. Just noting it as a path that re-renders.
**Location**: `src/app.jsx:29520-29541`.
**Recommended fix**: Already debounced correctly. No action.

---

## Informational

### I-1: Firebase plan capacity (Blaze)

The app is on Blaze (functions are deployed). Blaze quotas relevant here:
- Cloud Functions: 540s max execution, 8GB memory cap (we use 512MB for `extractSupplierQuotePricing` — fine).
- Firestore: 1MB per doc (relevant for H-3), 1 sustained write/sec/doc (relevant for H-4), 50k document reads / day free, then $0.06 per 100k reads. With ~10 concurrent ARC users x onSnapshot on projects + presence + activeExtractions, daily reads can approach 100k.
- Firebase Storage: 5GB free, then $0.026/GB. The supplier upload PDFs (max 25MB each) and pageImages (~200KB-2MB each) should be fine.
- FCM: free, no quota.

### I-2: Cloud Function cold starts

Functions are gen-1 (`functions.https.onCall`). First invocation after idle (~15min) takes 2-5s for the JS runtime + admin SDK init. The supplier portal first-page load fires `extractSupplierQuotePricing` immediately on PDF drop — first supplier of the day waits ~5s extra. Subsequent calls are warm. Could move to gen-2 (faster cold start) or set `minInstances:1` (~$5/month per function to keep one warm).

### I-3: Anthropic tier — what you're on now

Cannot determine from code alone. Tier-1 is 1000 RPM / 40k ITPM Sonnet. Tier-2 (after $40 spent) doubles. Tier-3 is 4000 RPM / 200k ITPM. The project's monthly Claude bill from BOM extraction + supplier portals is likely Tier-2 or Tier-3 by now — but the per-key budget is per-ARC-user, not per-supplier, so multi-supplier concurrent uploads still share one bucket.

---

## Stress-test plan (10 specific scenarios)

These are runnable on `staging` or with a second authenticated test account.

1. **Concurrent BOM edit on the same project**
   - Open PRJ-test in two browsers (different uids).
   - User-A: rapidly edit row 1 description (keystrokes).
   - User-B: simultaneously edit row 5 unit price.
   - Wait 5 seconds. Refresh both. Verify both edits survived.
   - **Expected failure**: One user's edit is overwritten by the other's last-write. Verifies WBP-1/WBP-2/H-6.

2. **Concurrent panel-add and quote-print**
   - User-A opens project, drops a new PDF (extraction starts in background).
   - User-B clicks "Print Client Quote" before User-A's extraction completes.
   - **Expected failure**: User-A's panel might appear in User-B's printed PDF half-extracted, OR the panel disappears from the saved doc because User-B's `safeSave` overwrites the panel-save in flight.

3. **Triple supplier portal upload**
   - Send three RFQs to three test supplier addresses (all yours).
   - Upload three different 60-page PDFs simultaneously (open in three incognito windows).
   - **Expected failure**: One or more uploads return 429/529 from Anthropic; the affected supplier sees "extraction failed — partial results" and hits the manual-fill path. Verifies H-1.

4. **Two users print quotes on same project simultaneously**
   - Open PRJ-test in two browsers.
   - Both click "Print Client Quote" within the same second.
   - Compare the two PDFs — they should have different `MTX-Q######` numbers.
   - Check the Firestore `users/{uid}/config/quoteCounter.next` — should be incremented exactly twice.
   - Check `lastQuotePrintedAt` and `quoteRev` on the project — verifies whether one save overwrote the other. Verifies H-2.

5. **Project-doc size stress**
   - Take a real production project. Inflate `engineeringQuestions` to 200 entries with 1KB notes each. Save. Add 50 ECOs in `ecoSummary`. Save. Add `extractionFeedbackLog` with 50 entries.
   - Watch console for `INVALID_ARGUMENT: Document size exceeds maximum`.
   - **Expected failure**: At ~800KB the save banner appears; at ~1MB the save errors out. Verifies H-3.

6. **Burst write rate against same project**
   - Script: 30 BOM-row edits at 100ms intervals (`safeSave` per edit).
   - Open the project in another tab, watch `onSnapshot` deliveries.
   - **Expected failure**: Latency climbs; some saves return RESOURCE_EXHAUSTED after ~10 sustained writes. Verifies H-4.

7. **Two-user ECO race**
   - User-A and User-B both open PRJ-test.
   - Both click "+ New ECO" within 200ms.
   - Refresh both. Look at Firestore — count the ECOs in the subcollection.
   - **Expected failure**: Two ECOs created, possibly with same `number`, both `status:"draft"`. Verifies H-5.

8. **BC offline queue dual-user duplication**
   - Disconnect BC (e.g. invalidate token).
   - User-A enqueues `attachPdf` on PRJ-test (clicks "Save Quote to BC").
   - User-B, on different browser, also enqueues `attachPdf` on PRJ-test.
   - Re-acquire BC token. Both queues drain.
   - Check BC for the project — should have ONE PDF attached, not two.
   - **Expected failure**: BC has duplicate PDFs (or duplicate purchase quotes if you used `createPurchaseQuote`). Verifies M-1.

9. **Extraction-during-soft-apply**
   - User-A starts a heavy extraction on Panel-1 (background, 30+ seconds).
   - User-B opens same project, edits Panel-2 BOM row, saves.
   - User-A's soft-apply listener fires from User-B's save.
   - User-A's extraction's final consolidated save (line 10647) lands.
   - Verify Panel-2's edit from User-B survived.
   - **Expected failure**: User-B's Panel-2 edit is overwritten by User-A's extraction's "I'm saving the whole project" final write. Verifies WBP-1.

10. **FCM multi-device flood**
    - Sign in to one account on phone, laptop, desktop.
    - Have a supplier submit a quote via the portal.
    - Count notifications received: should see one per device, all with `requireInteraction:true`.
    - **Expected outcome**: 3 sticky notifications. UX test for M-2.

---

## Summary table — fix priorities

| ID | Fix | Effort | Impact |
|---|---|---|---|
| WBP-1 | Run `saveProject` through the same per-project mutex as `saveProjectPanel`, OR convert both to a Firestore transaction | Medium (~1 day) | Eliminates the largest data-loss race |
| WBP-2 | Replace `_saveHighWater` with a Firestore-transaction `updatedAt` compare-and-swap | Medium (~1-2 days) | Closes per-tab loophole |
| H-1 | Per-uid mutex in `extractSupplierQuotePricing` Cloud Function + retry/backoff on 429/529 | Medium (~1 day) | Stops supplier-portal degradation |
| H-3 | Migrate panels to subcollection | High (~3-5 days, with migration) | Removes 1MB ceiling permanently |
| H-2 | Quote print lock — set `quotePrintLockedBy/At` at start of print, refuse second within 30s | Low (~2 hours) | Stops dual-quote-number to customer |
| H-5 | ECO creation in Firestore transaction asserting no-active-draft | Low (~2 hours) | One-draft-at-a-time invariant |
| H-4 | True debounce on `saveProjectPanel`-emitting paths (500ms batch) | Medium (~half day) | Reduces write thrash |
| H-6 | Defer soft-apply when input field has focus | Low (~2 hours) | Prevents typing-loss |
| M-1 | Move BC offline queue to Firestore subcollection | Medium (~1 day) | Eliminates dual-user duplication |
| Others | Mostly self-healing / UX polish | Low | Nice-to-have |

---

## Closing notes

The codebase clearly has a sophisticated concurrency model that's been built up incrementally — `_saveHighWater`, the per-panel mutex, `migrateProjectShape`'s self-healing, the soft-apply listener, presence + Owner Priority Mode + Won/Lost lock + Pre-/Post-Review lock + ECO scope locks. Each layer has a justified `DECISION(v1.19.xxx)` comment explaining its origin. The challenge is that these layers compose — and the composition is where the gaps live.

The single most leverage-able change is **moving authoritative concurrency control out of in-memory JS state and into Firestore transactions**. The `_panelSaveLocks` and `_saveHighWater` patterns are good intent but defend only against single-tab issues. Cross-user safety needs the server-side guarantee.

Storage and rate-limit concerns (H-1, H-3, H-4) are growth-curve risks — the app works fine for the current scale (one ARC user, occasional supplier uploads), but as the team grows past ~5 concurrent users or supplier uploads become routine, these will start firing. Worth addressing on a "fix before they bite" basis rather than waiting for the production failure.
