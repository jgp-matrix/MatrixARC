# Owner Priority Mode — Design Spec

**Status:** Approved for implementation
**Date:** 2026-04-23
**Related:** Extends the existing Hard Project Lock (v1.19.616) and Project Presence (v1.19.599) systems.

## Problem

Today's concurrency model has two states:
1. **Someone is running an extraction/pricing/validation task** → non-owners get the full "🔒 Project In Use" lockout screen
2. **Nobody is running a task** → everyone can edit everything freely

This misses the middle case: the **owner is present and working** but not currently running a task. A non-owner (even admin) could:
- Start a re-extraction and rewrite the owner's freshly-manually-edited BOM
- Send the quote before the owner has finished reviewing
- Delete a panel the owner is mid-edit on

The owner needs a way to signal "I'm driving this project right now — back off" without needing to continuously run a task just to hold the lock.

## Solution: Owner Priority Mode

When the project owner's `projectPresence` doc is active, non-owners automatically enter **Owner Priority Mode** — a soft lockout where view-and-review stays fully allowed but destructive/state-changing actions are disabled.

## Trigger conditions

**Enters Owner Priority Mode when:**
- A `projectPresence` doc exists for the current project with `uid === project.createdBy` AND `lastSeen` within 90 seconds, AND
- The current user's `uid !== project.createdBy` (i.e. I am a non-owner)

**Exits when:**
- Owner's `lastSeen` goes stale (>90s with no heartbeat — e.g. tab closed, network drop, laptop sleep), OR
- Owner explicitly leaves the project view (deletes their presence doc on unmount)

**Override: Owner's "Lock while away" checkbox**
- New UI element on the project view, visible to the owner only
- When checked: owner's presence persists regardless of heartbeat staleness — no 90s timeout. Effectively lets the owner step away (overnight, meeting, etc.) without losing priority.
- When unchecked (default): 90s stale timeout applies as normal.
- Stored as `project.ownerLockActive: boolean` in Firestore. Presence doc includes `lockActive: true` copy so listeners don't need the whole project doc.

## Notification to non-owner

**On owner entry (transition off → on):**
1. One-time toast at top of screen:
   > 👑 **Jon (owner) just joined — they now have priority.** Your destructive actions are disabled.
2. Subtle chime (single tone, 250ms). Configurable in user settings (default ON).
3. Persistent banner appears at top of the project view:
   > 👑 **Owner is working this project.** You can keep reviewing, but destructive and state-changing actions are disabled until they leave.

**Banner stays visible** the entire time owner priority is active. Disappears when owner leaves / goes stale (and lock checkbox unchecked).

## Locked actions (hard lock)

Buttons disabled with `cursor:not-allowed`, opacity 0.45, tooltip explains. Clicking still triggers a one-line alert:
> This action is disabled while the owner is working this project. Wait until they leave, or ask an admin to Take Over.

| # | Action | Where |
|---|---|---|
| 1 | Re-extract BOM | PanelCard re-extract button |
| 2 | Re-extract with feedback | AI feedback modal submit |
| 3 | Run / Re-run Validation | Validate button |
| 4 | Run / Refresh Pricing (normal + force-fresh) | Pricing buttons |
| 5 | Apply Supplier Portal prices | PortalSubmissionsModal apply |
| 6 | Delete panel | Panel card delete |
| 7 | Delete drawings | Drawing thumbnail ✕ |
| 8 | Send Quote | QuoteSendModal send |
| 9 | Send / Print RFQs | RFQ button |
| 10 | Record PO Received | PoReceived modal submit |
| 11 | Approve pre-review / post-review | Review banners |
| 12 | Unlock sent quote | Unlock button in QUOTE LOCKED bar |
| 13 | Push BOM to BC / sync planning lines | BC sync buttons |
| 14 | Transfer / Copy project | Dashboard project tile |

## Allowed actions (non-owner keeps full access)

All of the following stay enabled under Owner Priority Mode:

- Viewing BOM, quote, drawings, panels, questions
- Opening drawing lightbox + scrolling/zooming
- Adding review notes (append-only, non-destructive)
- Answering engineering questions (per-question state)
- BC Item Browser lookups (read-only)
- Editing BOM rows (qty, price, PN, description) — no warnings per user decision
- Editing title block fields (drawingNo, drawingDesc, drawingRev)
- Editing quote fields (customer, address, terms, etc.)
- Adding manual BOM rows
- "Just Print" quote (review copy, no email)
- Dashboard navigation / panel open-close

## Admin Take Over

**Requirement:** An admin needs to push a quote or make a state change while the owner is unreachable (traveling, sick, etc.).

**UI:** When Owner Priority Mode is active AND current user is admin (`_appCtx.role === "admin"`), a button appears in the banner:

> 👑 Owner is working... **[ 🛡 Admin Take Over ]**

**Take Over flow:**
1. Click button → modal prompts: *"Reason for taking over priority from {ownerName}?"* with textarea
2. On confirm:
   - Write audit entry to `companies/{companyId}/ownerTakeovers/{projectId}_{timestamp}`:
     ```js
     { projectId, takeoverBy: uid, takeoverByName, originalOwnerUid, reason,
       takeoverAt: Date.now() }
     ```
   - Add entry to `project.ownerTakeoverLog: []` (array on project doc) with same fields
   - Set `project.ownerTakeoverActive: { byUid, atMs }` — disables Owner Priority Mode for this session across all clients via Firestore listener
   - Banner on admin side flips to: *"🛡 Admin Take Over active — all actions enabled. Reason: <reason>"*
   - Banner on owner side (if still present) flips to: *"🛡 {admin name} has taken over priority. Reason: <reason>. Refresh to yield control or continue working at your own risk."*
3. Take Over expires when:
   - Admin closes the project, OR
   - Owner leaves (goes stale), OR
   - 15 minutes elapse (auto-expire)

The take-over log is visible to both the admin and owner for auditability.

## Owner-side UX

**Chime + toast when a teammate opens the project:**
- Single subtle tone (different from the non-owner's chime), 200ms
- Toast: *"👁 Bob just opened this project (view-only access per your priority)"*
- Configurable — OFF by default; opt-in checkbox in Settings: *"Chime when teammates join my projects"*

**"Lock while away" checkbox:**
- Location: top of project view, next to the panel/dashboard header, visible only to owner
- Label: *"🔒 Hold priority while I'm away (keeps lock active if tab goes idle)"*
- Tooltip: *"Normally your priority lock releases 90 seconds after you close the tab. Check this to keep the lock active even if you step away or lose connection."*
- Saves to `project.ownerLockActive: boolean`
- Copied to presence doc on write so listeners don't need project doc

**Viewers list:**
- Small badge in top bar: *"👁 2 teammates watching"* (clickable → shows names, takeover status)
- Owner sees who else is in the project in real time

## Firestore schema additions

### `project` doc — two new fields

```js
{
  ...existing fields,
  ownerLockActive: boolean,          // owner's "hold priority while away" flag
  ownerTakeoverActive: {             // set by admin takeover; null otherwise
    byUid: string,
    byName: string,
    atMs: number,
    reason: string,
    expiresAt: number                // atMs + 15min
  } | null,
  ownerTakeoverLog: [                // append-only history
    { takeoverBy, takeoverByName, originalOwnerUid, reason, takeoverAt }
  ]
}
```

### `projectPresence` doc — one new field

```js
{
  ...existing fields (uid, projectId, userEmail, userName, isOwner, lastSeen),
  lockActive: boolean                // mirrored from project.ownerLockActive for listeners
}
```

### New collection: `companies/{companyId}/ownerTakeovers`

Audit trail; one doc per takeover event. Same fields as `ownerTakeoverLog` entries + companyId for filtering.

## React state additions (ProjectView)

```js
const [ownerPriorityActive, setOwnerPriorityActive] = useState(false);
const [ownerPresenceUid, setOwnerPresenceUid] = useState(null);
const [takeoverActive, setTakeoverActive] = useState(null);
const [showTakeoverModal, setShowTakeoverModal] = useState(false);
// Computed from existing viewers + project doc:
// - ownerPriorityActive = (ownerInViewers && !iAmOwner && !takeoverActive)
// - iAmOwner = project.createdBy === uid
// - iAmAdmin = _appCtx.role === "admin"
// - canTakeOver = iAmAdmin && !iAmOwner && ownerPriorityActive
```

## Precedence rules (updates to existing)

- **Owner wins**: unchanged — owner always bypasses all locks
- **Active Extractions lock**: unchanged — anyone running a task still locks everyone else
- **Owner Priority Mode** (new): layered between the two:
  - Hard Project Lock (task running) > Owner Priority Mode > Free-for-all
  - Admin Take Over overrides Owner Priority Mode (but NOT Hard Project Lock — a running task always wins)

## Backward compatibility

- Projects created before this feature have no `ownerLockActive` / `ownerTakeoverActive` fields → treated as `false` / `null`
- No schema migration required
- `projectPresence` docs without `lockActive` field → treated as `false`
- Old clients (pre-this-version) will not honor the lockout. Mitigated by: Firestore security rules update that rejects writes to locked projects from non-owner/non-takeover users.

## Testing plan (manual — no automated test suite)

1. **Owner + non-owner same project**: verify toast fires for non-owner; banner shows; all 14 locked actions disabled; all allowed actions still work
2. **Owner leaves (closes tab)**: verify non-owner's lockout lifts within 90 seconds, banner disappears
3. **Owner checks "Hold priority while away" + closes tab**: verify non-owner stays locked; owner can return and resume
4. **Admin Take Over flow**: verify reason prompt, audit log writes, banner flip on both sides
5. **Take Over auto-expires after 15 min**: check banner reverts
6. **Two non-owners (no owner present)**: verify no lockout — they behave as today
7. **Owner + admin scenario**: admin should still see lockout (Owner Priority Mode applies to admins too per user spec)
8. **Edge: running extraction + owner present**: Hard Project Lock wins — full takeover screen, not soft lock

## Scope boundaries

**In scope:**
- New state (ownerLockActive, ownerTakeoverActive, ownerTakeoverLog)
- Banner + toast + chime UI
- Gating 14 action buttons
- Admin Take Over modal + audit log
- "Hold priority while away" checkbox

**Out of scope (future):**
- Granular per-field lockout rules
- Per-project ownership transfer with approval workflow
- Teammate chat/DM when locked out
- Email/push notification when owner joins (may add later if chime isn't sufficient)
- Edit history / diff view (separate todo)
