# Coach Supplement — #144 removeTeamMember Orphaned-Profile Cleanup

**From:** Coach (Sam Wize)  
**To:** Freddy → Jon (approve) → Marc (build)  
**Re:** Brief #144, five open questions  
**Date:** 2026-06-16  
**Companion to:** #143 (boot-failure handling, C87 — supplement delivered, Marc building)

---

## Q1 — Clear vs Neutralize: The Core Fork

**Recommendation: Option B — null the companyId. No additional fixes needed.**

I audited every read of `users/{uid}/config/profile` across the entire codebase. Here is the complete list:

### app.jsx reads (6 sites)

| Line | Function | What it reads | companyId assumption | Safe with null? |
|------|----------|---------------|---------------------|-----------------|
| 11347 | `loadUserProfile` | Returns `d.exists ? d.data() : null` | None — caller checks `profile?.companyId` | YES |
| 40458 | Settings panel `useEffect` | `profileDoc.data().firstName\|\|""` | Ignores companyId entirely | YES |
| 40481 | `saveName` | WRITE — `set({firstName}, {merge:true})` | Ignores companyId | YES |
| 45611 | `runBoot` (was boot IIFE) | `profile?.companyId` | Optional chaining; null → else branch → personal path | YES |
| 45658 | Boot firstName load | `d.data().firstName\|\|""` | Ignores companyId | YES |
| 45663 | Member map builder | Other users' `d.data().firstName\|\|""` | Ignores companyId | YES |

### functions/index.js reads (5 sites)

| Line | Function | What it reads | companyId assumption | Safe with null? |
|------|----------|---------------|---------------------|-----------------|
| 78–79 | `resolveAnthropicKey` | `profileDoc.data().companyId`; `if (companyId) {...}` | Truthiness gate — null skips to user key fallback | YES |
| 138–140 | Token warning email | `profileDoc.data().companyId`; `if (!companyId) return;` | Null → exits early (no email) | YES |
| 197–200 | Model fallback email | Same pattern as above | Null → exits early | YES |
| 259–262 | Generic alert email | Same pattern as above | Null → exits early | YES |
| 1413–1422 | `debugUserAccount` | Diagnostic — reads and reports all fields | No assumptions | YES |

### Verdict

**Zero sites assume "profile exists implies companyId present."** Every companyId consumer uses either optional chaining (`profile?.companyId`) or a truthiness gate (`if (companyId) {...}`). A profile doc with `companyId` absent/null falls cleanly to the personal/solo path in every case.

Option B is safe with no additional code changes beyond `removeTeamMember` itself.

### Why not Option A (delete the profile doc)

Option A would also work — `loadUserProfile` returns null for a missing doc, and the boot path handles null correctly. But it unnecessarily destroys `firstName`, which is user-set data entered in Settings (line 40481). On re-invite, `acceptTeamInvite` uses `{ merge: true }` (line 499–502), so it would create a new profile with companyId and role but the firstName would be gone. Option B preserves it.

---

## Q2 — Atomicity: Batch the Two Writes

**Recommendation: Yes — batch. Use `FieldValue.delete()` with `set({merge:true})`.**

Current `removeTeamMember` (functions/index.js line 531):
```js
await admin.firestore().doc(`companies/${companyId}/members/${targetUid}`).delete();
```

After #144:
```js
const batch = admin.firestore().batch();
batch.delete(admin.firestore().doc(`companies/${companyId}/members/${targetUid}`));
batch.set(admin.firestore().doc(`users/${targetUid}/config/profile`), {
  companyId: admin.firestore.FieldValue.delete(),
  role: admin.firestore.FieldValue.delete(),
}, { merge: true });
await batch.commit();
```

**Why `set` with `merge:true` + `FieldValue.delete()` instead of `update()`:**

`update()` throws `NOT_FOUND` if the profile doc doesn't exist, which would roll back the entire batch — including the member doc delete. While the profile doc should always exist for a properly-invited user, defensive coding here costs nothing. `set({merge:true})` with `FieldValue.delete()` on a non-existent doc creates an empty doc (harmless — `loadUserProfile` returns `{}`, which has no `companyId`, so it falls to personal path). On an existing doc, it removes only the specified fields, preserving `firstName` and anything else.

**Why batch, not sequential:**

If the member delete succeeds but the profile mutation fails, we've recreated the exact orphan state #144 exists to prevent. The batch is atomic — both succeed or both roll back. This mirrors the symmetry of `acceptTeamInvite`, which also uses a batch (line 493–504).

**Return value:** Keep `return { success: true };` — no change to the caller contract.

---

## Q3 — Re-Invite from Clean State

**Confirmed: `acceptTeamInvite` correctly re-establishes both docs after a #144-cleared profile.**

After #144 removal, the user's state is:
- `companies/{cid}/members/{uid}` — DELETED (by the batch)
- `users/{uid}/config/profile` — EXISTS, but companyId and role are ABSENT. May still contain `firstName`.

When the admin re-invites and the user accepts, `acceptTeamInvite` (line 493–504) does:
```js
batch.set(admin.firestore().doc(`companies/${found.companyId}/members/${context.auth.uid}`), {
  email, role: found.role, addedAt: Date.now(),
});
batch.set(admin.firestore().doc(`users/${context.auth.uid}/config/profile`), {
  companyId: found.companyId, role: found.role,
}, { merge: true });
```

The `{ merge: true }` on the profile write means:
- `companyId` is set (restored)
- `role` is set (restored)
- `firstName` is preserved (not overwritten — merge only touches specified fields)
- Member doc is created fresh

**This is the RYAN-recovery path and it works correctly.** The user regains company access with their name intact. No additional changes needed to `acceptTeamInvite`.

---

## Q4 — Existing Orphans (Read-Only Count)

**I cannot query live Firestore from this session.** The audit query to find orphaned profiles is:

```
For each doc in users/*/config/profile where companyId is non-null:
  Check if companies/{companyId}/members/{uid} exists.
  If not → orphaned.
```

This is not expressible as a single Firestore query (it requires a cross-collection join). It needs a small script — structurally similar to `tools/reset-user.js` but read-only and iterating all profiles instead of targeting one email.

**Recommendation:** Marc writes a `tools/audit-orphans.js` (read-only, no deletes) that:
1. Lists all user profile docs (via Admin SDK collection group or per-user iteration)
2. For each profile with a `companyId`, checks member doc existence
3. Prints the count + the affected UIDs/emails

Run it once before deploying #144 to see if RYAN was alone or if there are others. If the count is > 0, Jon decides whether to batch-clear them (using `reset-user.js` per-user, or a new bulk script). If the count is 0, no action needed.

**Do not auto-delete.** The Brief is clear on this, and CLAUDE.md data retention rules reinforce it.

---

## Q5 — `tools/reset-user.js` Relationship

**No conflict. Different scope, complementary tools.**

| | `removeTeamMember` (CF, after #144) | `tools/reset-user.js` (admin script) |
|---|---|---|
| Trigger | Admin clicks "Remove" in app | Admin runs from terminal |
| Scope | Removes member doc + clears profile companyId/role | Deletes Auth user + profile doc + member doc + pending invites |
| When | Normal team management | Nuclear reset (account wipe for re-creation) |
| Profile | Surgical clear (preserves firstName) | Full delete |

After #144 ships, `reset-user.js` remains the admin escape hatch for cases where a full account wipe is needed (not just team removal). The script's profile delete (line 185) is a superset of #144's profile field clear — no conflict, no overlap.

One note: `reset-user.js` currently doesn't know about #144's field-clearing approach, but it doesn't need to — it deletes the entire profile doc, which is a more thorough cleanup than clearing fields. No changes needed to the script.

---

## Boot-Time Orphan Self-Heal — Open Question (NOT assumed)

Per Jon's instruction, I'm flagging this as a separate decision, not including it in #144 scope.

**The question:** Should the boot path detect the orphan condition (profile has `companyId` but member doc fetch fails with `permission-denied` or returns non-existent) and auto-clear the stale profile?

**My recommendation: No. Keep boot read-only.**

Rationale:
- #143 already makes boot fail gracefully — the user sees "contact admin" instead of spinning forever. The symptom is handled.
- #144 prevents NEW orphans from being created. The creation path is closed.
- Self-heal adds a write path to boot (clearing the profile), which introduces new failure modes (what if the profile write fails? what if the user is offline?) and makes boot non-idempotent.
- The admin fix path is clear: `tools/reset-user.js` or manual profile doc clear. This is an admin-level decision (removing a user's company association), not something the client should auto-decide.
- The audit script (Q4) will catch any existing orphans. If there are many, a batch fix is better than letting each user self-heal on next login (which would be invisible to the admin and un-auditable).

**If Jon or Freddy want self-heal later:** it would be a separate ticket (#145 or similar), scoped to: detect orphan condition in boot → clear profile → re-run boot on personal path. But I'd recommend against it for the reasons above.

---

## Summary for CCD

| Question | Decision | Rationale |
|---|---|---|
| Q1 Core fork | Option B — null companyId + role via `FieldValue.delete()` | All 11 profile read sites are null-safe; preserves firstName |
| Q2 Atomicity | Batch both writes | Prevents creating a new orphan if one write fails |
| Q3 Re-invite | Works correctly from clean state | `acceptTeamInvite` uses `{merge:true}` — sets companyId+role, preserves firstName |
| Q4 Existing orphans | Need audit script; cannot query from this session | Read-only count first; Jon decides on cleanup |
| Q5 reset-user.js | No conflict — different scope, complementary | Script is superset (full delete); #144 is surgical (field clear) |
| Self-heal | Recommend NO — keep boot read-only | #143 handles symptom; #144 closes creation path; admin path is clear |

**The build is one change:** replace the single `delete()` in `removeTeamMember` (functions/index.js line 531) with a two-operation batch (member delete + profile field clear). No other files change. No caller contract changes. `return { success: true }` unchanged.

**Diff-gate note:** This is a Cloud Function touching provisioning. CLAUDE.md requires explicit approval before Marc edits. The change is 4 lines (replace 1 line with 5 lines). Sequential, evidence-first.
