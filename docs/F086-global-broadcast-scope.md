# F086 — Auto Version Broadcast + Admin Global Msg — build plan

Coach scope, 2026-08-03. Folds in F008. **Headline: ~70% already exists** — mostly a restyle + a hard-reload upgrade + one new admin write path. Line refs current `src/app.jsx` / `public/index.html` / `deploy.sh` / `public/sw.js` / `firestore.rules`.

## What already exists
- **Version:** `APP_VERSION` (index.html:243); `deploy.sh:56` writes `public/version.json` every deploy; `deploy.sh:42` cache-busts the bundle URL.
- **SW:** `public/sw.js` (push-only, no app caching; already deletes caches on activate) + `firebase-messaging-sw.js`.
- **TWO version-detect paths already built:** (1) load-time freshness check (index.html:256-272) — fetches version.json, on mismatch already runs the exact hard-reload (unregister SW + caches.delete + reload) — but only ONCE at load + auto-reloads; (2) live `_system/version` onSnapshot (app.jsx:54191-54200) → `setNewVersionAvailable(remote)`; doc written by first admin who loads the new build.
- **Receiver banner (F008 remnant, app.jsx:54467-54491):** full-width TOP banner (not top-right/flashing) with "Refresh Now"/"Later". `safeRefresh` (54470) **already guards running bg tasks** (54468-54478 — the "don't lose work" behavior Jon wants; KEEP). **★ BUG: its reload is a plain `window.location.reload()` (54479), NOT a hard reload → does not clear SW/caches → the stale-bundle behind Ryan's problem.**
- **Rules:** `firestore.rules:6-9` — `_system/{docId}` read+write for any authed user → a new `_system/globalBroadcast` needs ZERO rules change.
- **Admin/UI:** `isAdmin()` (2501); `arcPrompt(msg,{multiline})` (2227) for compose; gear menu admin items (54698-54709); `@keyframes pulseYellow` (index.html:44).
- **No seen-dedup today.**

## Architecture (two triggers → one top-right modal)
- **Auto version — client `version.json` poll (REC):** App `setInterval` (~3-5 min + on visibilitychange→visible) fetches `/version.json?t=` `{cache:'no-store'}`; on `version!==APP_VERSION` → modal `{type:'version'}`. No deploy creds, no CF, no admin-first-load dependency (version.json already written by deploy.sh:56). Keep the `_system/version` onSnapshot as a secondary instant trigger. *(Rejected: deploy.sh Firestore write — firebase CLI has no doc-set, needs a service-account key = credential surface for no gain. Rejected: Cloud Function — extra moving part.)*
- **Admin message — `_system/globalBroadcast` doc** `{type:'admin',message,sentAt,sentBy,sentByName}` + App onSnapshot → modal `{type:'admin',id:sentAt}`. Reuses existing rules; client-gated `isAdmin()`.
- **Hard reload (button):** upgrade `safeRefresh` to AWAIT teardown before reload: `await Promise.all(regs.map(unregister))` + `await Promise.all(cacheKeys.map(caches.delete))` then `location.reload()` (drop the deprecated `true` arg). KEEP the running-task guard in front unchanged.
- **Modal UX:** restyle 54467-54491 → fixed top-right flashing card (`pulseYellow`), no focus-steal/nav. `type:'version'` = persistent + "Refresh & Update Now" (hard reload) + "Later". `type:'admin'` = dismissible + "Dismiss".
- **Seen-dedup (localStorage):** admin msgs keyed by `sentAt`; version keyed by served version string.

## Admin "Send Global Msg" button
Jon said "Admin home **top bar**." → default to a **visible admin-gated top-bar button** next to bell/gear (~54689), `userRole==="admin"`, onClick → `arcPrompt(multiline)` → write `_system/globalBroadcast`. (Coach alt: tuck in the gear menu with the other admin tools for consistency — Jon's call.)

## Phasing
- **Phase 1 (ship first):** admin manual broadcast — `_system/globalBroadcast` doc + onSnapshot + top-right dismissible modal + top-bar button + seen-dedup. No deploy/rules/CF change.
- **Phase 2:** auto version-on-deploy — version.json poll + restyle banner→top-right persistent for `type:'version'` + **the hard-reload upgrade** (the actual stale-bundle fix). Retire the old full-width banner.
Both `src/app.jsx`-only; sequential, single-file. **S-M total, LOW risk.** Minor version bump.

## ⭐ Decisions for Jon
1. **Auto-version delivery:** client version.json poll [REC] vs push (keep/expand `_system/version`).
2. **"Send Global Msg" placement:** visible top-bar button (Jon's literal ask) [default] vs gear menu (Coach consistency alt).
3. **Version modal:** persistent, re-show until refreshed [REC — matches "finish then click"] vs "Later" suppresses until a newer version.
4. **Hard-block vs nag for auto-version:** nag only, never force-reload [REC — matches "don't lose in-progress work"].
5. **Rules hardening (security):** `_system/{docId}` currently allows ANY authed write (same trust model as today's `_system/version`). Lock `globalBroadcast` write to admins server-side (small rules add), or keep client-side `isAdmin()` gating (status quo)?
6. **Phase 1 alone first, or build both phases together?**
