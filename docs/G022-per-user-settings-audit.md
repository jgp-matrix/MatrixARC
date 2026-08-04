# G022 — Per-User Settings/Preference Audit (companion to F088)

> Auditor: Coach lane (read-only), via Freddy · 2026-08-04 · prod v1.24.85
> Purpose: inform what F088's per-user `prefs` map (on `companies/{cid}/members/{uid}`) should absorb. Findings + recommendations only — nothing moved.

**Key takeaway:** the classic "company-shared but should be per-user" bucket is **rare** — the `config/*` family is correctly company-shared. The real gap is **(B) ephemeral view prefs** (reset every session) + **(C) device-bound localStorage UI prefs** (don't sync across a user's machines). That's where F088 delivers value.

## ★ RECOMMENDED CONSOLIDATION SHORTLIST (ranked by payoff)

| # | Preference | Today | Problem | Rec |
|---|-----------|-------|---------|-----|
| 1 | **Board default view** (`groupBy`) | ephemeral useState (49901) | resets to "status" EVERY session | **Consolidate (highest payoff)** |
| 2 | **Sidebar pinned state** (`navPinned`) | ephemeral useState (53312) | unpin never persists | **Consolidate** |
| 3 | **"My Projects only" toggle** | ephemeral useState (53318/49902) | resets every session | **Consolidate** |
| 4 | To-Do rail open/closed | localStorage `arc_todo_rail_open` (53325) | device-bound | Consolidate (or leave device-local) |
| 5 | BOM Items column widths | localStorage `arc_items_col_widths` (52718) | device-bound | Consolidate |
| 6 | BC Item Browser modal size | localStorage `arc_bcItemBrowserSize` (25184) | device-bound | Consolidate |
| 7 | Notification dropdown height | localStorage `arc_notif_menu_height` (53392) | device-bound | Consolidate (low value) |
| 8 | "Skip re-extract warning" | localStorage `_arc_skip_reextract_warn` (32559/34993) | re-suppress per machine | Consolidate |
| 9 | Chime-on-viewer toggle | localStorage `arc_chime_on_viewer_<uid>` (41957/44032) | uid-keyed but device-bound | Consolidate |
| 10 | Onboarding tour progress | localStorage `arc_tour_step_<uid>` (53385) | re-shows on new device | Consolidate (minor) |

**#1–#3 are the cleanest first migration** — purely additive (no existing storage to migrate), highest visibility.

**Push toggle nuance (`arc_push_<uid>`, 53414): LEAVE device-local.** Push is inherently per-device (FCM token per device at `users/{uid}/fcmTokens`); syncing the on/off flag would mislead (enabling on phone shouldn't flip on a desktop with no token).

## Bucket counts
- (A) Already correctly per-user: **8**
- (B) Ephemeral → should be synced per-user pref: **3**
- (C) Per-user but device-bound (localStorage)/scattered: **10**
- (D) Intentionally company-shared — LEAVE: **18+**

## (A) Already correctly per-user — confirm, no action
Member doc (permissions/role/email; bcUserCode/bcSalespersonCode/displayName — the self-edit precedent for F088); `users/{uid}/config/profile.firstName` (candidate to fold — displayName already on member doc → two names in two places); `users/{uid}/config/api` (per-user, mirrored to company by admins — leave); `config/anthropicLedger` (+ monthly budget); `users/{uid}/notifications`; `users/{uid}/fcmTokens`; `users/{uid}/pricingSyncLog`.

## (B) Ephemeral → should be synced per-user pref (top targets)
`groupBy` (49901), `navPinned` (53312), `myProjectsOnly` (53318/49902). (`focusedCol`/`navTab`/`view` are transient navigation, NOT durable prefs — leave.)

## (C) localStorage keys — classified
Consolidate: shortlist #4–#10. **Leave device-local:** `arc_push_<uid>` (per-device), `arc_broadcast_seen`/`_version` (F086 version-ack is device-local by design), `_arc_bc_queue` (offline write queue), `arc_salesperson_cache` (cache), `_arc_seen_jokes` (cosmetic). **Flag for dedup:** `_arc_dk_vendor` (46133) likely legacy — F077 Vendor Sync now stores DK/Mouser vendor#s in company config; possibly redundant.

**Opposite-direction scope note (do NOT move to prefs):** `users/{uid}/config/unknownManufacturers` (6247) + `users/{uid}/config/manufacturerVendorMap` (7428/7482/7508) are hardcoded per-user and do NOT switch to `configPath` in team mode — unlike sibling learning DBs (alternates/corrections) which are company-shared. Learning-DB-shaped → arguably belong in COMPANY config, not prefs. Separate ticket.

## (D) Intentionally company-shared — LEAVE (out of scope)
Pricing/labor (`config/pricing`, `config/laborRates`, `_pricingConfig`); BOM defaults (`config/defaultBomItems`, `config/partLibrary`); learning DBs (alternates/corrections/partCorrections/descriptionCrosses/page_type_learning/layout_learning/region_learning/device_classifications/titleBlockLearning — Data Retention CRITICAL); supplier data (supplierCantSupply/supplierCrossRef); quote/counter/templates (quoteCounter/customerTemplates/salespersonInfo/cpd_catalog/mfrDenylist); integration (bcEnvironment/customScrapers/api company mirror/F077 vendor #s); company `termsAndConditions`.

**Three borderline (D) — Jon ruling, NOT recommending a move:** `config/defaultBomItems` (per-estimator default sets?); `config/bcEnvironment` (per-user active env? — F069 write-block + single-BC-company model make company-shared safer); `_pricingConfig` attention/stale thresholds (per-user view filter?).

## Notes
- No theme/dark-mode pref exists (dark-only). If ever added → born in `prefs`.
- F088 precedent already exists: member-doc self-edit for bcUserCode/displayName (21386) is exactly F088's pattern; add `prefs` to that same self-edit path.
- Do NOT migrate the "leave" localStorage keys — device-local is correct for them.
