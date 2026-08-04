# F088 — Per-User Settings Store (move "Pin to Top" off the shared project doc)

> Author: Coach (Sam Wize) lane, via Freddy · 2026-08-04 · prod v1.24.85
> Status: SCOPED — awaiting Jon decisions (§6) before build. Display/prefs feature (NOT money-path). **One security-sensitive piece: a Firestore rules change on the member doc.**

## 0. Critical correction to the premise (read first)

The assumption "Firestore rules already allow a user to self-edit their OWN member doc" is **FALSE as written.** The entire member-doc `allow update` is gated behind `isAdminMember()`:

```
firestore.rules:414-417
allow update: if isAdminMember() && (
  memberId != request.auth.uid ||
  request.resource.data.diff(resource.data).affectedKeys()
     .hasOnly(['permissions','updatedAt','bcUserCode','bcSalespersonCode','displayName'])
);
```
`isAdminMember()` = `isMember() && memberRole()=='admin'` (rules:213-215). So today a **non-admin edit/view member cannot write to their own member doc at all** — the `hasOnly(...)` whitelist only applies to admins editing themselves. Read is open to any member (rules:393).

**Consequence:** F088 needs a **new, separate any-member self-edit branch** scoped to `prefs`/`updatedAt` on the user's OWN doc — NOT an extension of the existing admin whitelist. This is the single most important design point (drives §3, §5).

## 1. Storage shape + read path

**Doc + field**
- Team: `companies/{companyId}/members/{uid}` → new map `prefs`, with `prefs.pinnedProjects = { [projectId]: pinnedAtMillis }`.
- Solo (no companyId): `users/{uid}/config/prefs` doc, same shape. (Solo boot at src/app.jsx:54179-54181 sets only `projectsPath`; `configPath` is unset for solo today → build must derive `users/{uid}/config` for the solo prefs path.)

**Current-user member doc load** — `runBoot()`: one-shot get at src/app.jsx:54124-54126 (`_appCtx.permissions`); live `onSnapshot` at 54128-54139 re-syncing permissions/role. **Add `prefs` capture to that snapshot handler** → `_appCtx.prefs=d.prefs||{}` + push `d.prefs?.pinnedProjects||{}` into a new React state `myPins` so pins propagate live (mirrors permissions live-update).

**`memberMap` is the WRONG carrier** (state at 53361; built 54189-54198; passed to Dashboard 49900 + ProjectTile 50339/50394/50417/51642). It's a company-wide `uid→{email,firstName}` map for EVERY member — don't bloat it with prefs. Use a dedicated `myPins` prop so each client reads only its own pins.

**Board read points:** sort at src/app.jsx:50284 (`_priorityPinCompare` at 49564 reads `project.priorityPinnedAt`) → change to read the current user's set: make it `sort(_pinCompare(myPins))` where `_pinCompare(pins)=(a,b)=>(pins[b.id]||0)-(pins[a.id]||0)`. Tile 📌 at 51683 (`{p.priorityPinnedAt&&…}`) → `{myPins[p.id]&&…}` via a `pinned` boolean prop on ProjectTile.

## 2. Write path

Replace the checkbox handler at src/app.jsx:39884-39906 (currently writes the PROJECT doc via `_pinRef.update`, serialized under `_panelSaveLocks[project.id]`). New handler writes the user's OWN doc:
- Team: `fbDb.doc('companies/'+_appCtx.companyId+'/members/'+_appCtx.uid)`; Solo: `fbDb.doc('users/'+_appCtx.uid+'/config/prefs')`.
- Pin: `.set({prefs:{pinnedProjects:{[project.id]:Date.now()}},updatedAt:Date.now()},{merge:true})` or field-path `update('prefs.pinnedProjects.'+project.id, Date.now())`.
- Unpin: `update({['prefs.pinnedProjects.'+project.id]:FieldValue.delete(),updatedAt:Date.now()})` — grep existing `FieldValue.delete`/`fbDeleteField` binding before building.

**B084 `_panelSaveLocks` machinery can be DROPPED — confirmed.** The clobber-race (10793-10802, 11147-11153) existed only because the pin lived on the PROJECT doc, which has a whole-doc background `set()` path (saveProjectPanel) that read-stale/wrote-back the pin. The member doc has NO such whole-doc background writer (only admin permission/BC-mapping updates at 21361/21396/21466, disjoint fields, admin-triggered). So the lock + both save-guard blocks become dead code for pins → remove them in the same change.

## 3. Firestore rules change (security-sensitive)

Add a NEW self-edit branch to `match /members/{memberId}` (rules:392-418) — do NOT fold `prefs` into the admin `hasOnly` at 416 (that path is admin-only).

**After (add a second `allow update`; Firestore ORs allow rules):**
```
// F088: any member may self-edit ONLY their own prefs (per-user settings store).
allow update: if isMember()
  && memberId == request.auth.uid
  && request.resource.data.diff(resource.data).affectedKeys()
       .hasOnly(['prefs','updatedAt']);
```
Effect: a non-admin can change ONLY `prefs`+`updatedAt` on their OWN doc; any diff touching role/email/permissions/bcUserCode/bcSalespersonCode/displayName fails this branch (and the admin branch) → rejected. Cross-user edits fail on `memberId==request.auth.uid`. Admin branch unchanged.

**Solo path:** verify the `users/{uid}/config/**` subtree already grants the owner write (it does for `config/alternates` etc.) — likely no change, confirm before building.

**Security note:** this widens member-doc writes from admin-only to any-member (scoped to `prefs`). The `hasOnly(['prefs','updatedAt'])` IS the entire guarantee — must be exact. Coach review of the final rules diff + a negative test (non-admin writes `permissions` → denied) required.

## 4. Migration / retirement of the global pin — CLEAR, don't migrate

- Stop reading `project.priorityPinnedAt` for sort (50284/49564) + tile (51683) → switch both to `myPins`. This alone makes old global pins invisible. No migration code.
- Project-doc fields `priorityPinnedAt/By`: per Data Retention ("never remove fields; stop writing"), **leave orphaned — do NOT null-sweep** (extra write traffic across the whole collection for zero benefit; never read again).
- Rules: the 5 `priorityPinned*` whitelist entries (rules:264,295-296,305,320,377) + `isOnlyPriorityPinUpdate()` (294-296) become dead-but-harmless → **defer removal to a cosmetic PR** (editing 5 security carve-outs now adds risk for no gain).
- **Consumer audit (grep clean):** only src/app.jsx (the sites above) + the 5 rules whitelist entries. **Zero `functions/**` references.** Retirement fully contained to app.jsx + firestore.rules.

## 5. Who can pin

Current gate at src/app.jsx:39879: `if(li===0&&(isManager()||isAdmin()))`. The manager/admin gate existed because the pin was a shared team-wide list. Now that pins are private to each user's own view, that rationale is gone → **recommend allow ANY member to pin** (drop the gate, keep `li===0`). View-only users benefit from organizing their own board.

## 6. DECISIONS FOR JON

| # | Decision | Coach recommendation |
|---|----------|----------------------|
| D1 | Who can pin now it's private? | **Any member** — drop the manager/admin gate (39879). |
| D2 | Old project-doc pin fields — null-sweep or leave orphaned? | **Leave orphaned** — stop writing, no migration (Data Retention). |
| D3 | Carrier for current-user pins to the board? | **Dedicated `myPins` prop** — don't bloat company-wide `memberMap`. |
| D4 | Live vs one-shot pin read? | **Live** via existing member `onSnapshot` (54128) — reflects across the user's tabs instantly. |
| D5 | Rules cleanup of the 5 dead `priorityPinned*` whitelist entries? | **Defer** to a separate cosmetic PR — harmless now. |

**Effort: M.** Mechanically small (one handler rewrite, comparator/tile swap, one boot-listener line, one new rules branch), but spans a security-sensitive rules change + live-propagation wiring → warrants Coach review of the rules diff + a negative-auth test.

**Build order:** (1) rules branch + negative test → (2) boot listener captures `prefs.pinnedProjects`→`myPins` → (3) checkbox writes member/solo doc, drop `_panelSaveLocks` + the 2 save-guards → (4) comparator + tile read `myPins` → (5) drop the manager/admin gate (pending D1). Deploy: `firebase deploy --only firestore:rules` (separate from hosting) + hosting — both Jon-gated.
