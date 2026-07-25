# F068 — Extend F065 cross-Line propagation to CROSSED / SUPERSEDED parts — Analysis

**Author:** Freddy Lyst (analyst) · **Trace:** Sam Wize (Coach), read-only · **Date:** 2026-07-24
**Status:** ANALYSIS COMPLETE — DECISION PENDING (Int. 2 timing). Not scoped/built. Source: Jon (live idea after F065 shipped).

## The ask
F065 links duplicate parts across Lines by **exact part#** (`normPart`). If the same physical part sits on
different Lines under **different numbers** because one was crossed or superseded to another, F065 doesn't link them.
Jon wants F065-style cross-Line behavior to also cover crossed/superseded parts. Two interpretations analyzed:

## Interpretation 1 — BROADEN THE MATCH — ❌ NOT RECOMMENDED (blocked on data)
Make F065's duplicate index treat crossed/superseded equivalents as the same part (propagate across
different-but-equivalent part#s).
- **Why it fails:** there is **no reliable bidirectional equivalence** in the data. Crossing/supersede links are all
  **one-directional and incomplete**: `crossedFrom` only exists on rows crossed *in this project* (a freshly-extracted
  B row has no back-link to A); the `config/alternates` map is `originalPN → replacement` only (no reverse), is
  user/company-global, may have `autoReplace:false`, and uses normalized/fuzzy matching that can over-collapse
  distinct parts; `bcNo` surrogate equality only helps *after both* rows are crossed (defeats the purpose);
  `supplierCrossRef` is orig→bc one-directional.
- **Risk:** money-path + **wrong-part** — a false equivalence would propagate price/LT/vendor onto a row that isn't
  actually the same part. Plus an architecture mismatch: `buildCrossLineDuplicates` is pure/synchronous (runs every
  save/open); the alternates store is async Firestore — threading async equivalence into the pure builder is invasive.
- **Verdict:** don't build on this data. (Could revisit only if a reliable bidirectional equivalence store existed.)

## Interpretation 2 — PROPAGATE THE CROSS OPERATION — ✅ RECOMMENDED (build first)
When the user crosses/supersedes a part on one Line (A→B), offer to apply the **same cross** to the matching rows on
the OTHER Lines (which still literally contain A), turning them into B too.
- **Why it's safe:** the equivalence is **explicit and reliable** — the user just declared A→B, and the other Lines
  still carry the exact part A. Matching the other Lines on the **OLD** part `crossedFrom` uses the same exact
  `normPart` match F065 already trusts — **no inference, no reverse index needed.**
- **Insertion point:** `commitBcItem` (`:28350`) already fires the F065 price prompt at `:28539`. Add a sibling
  cross-propagation there: find other-Line rows whose part# == the OLD part (`crossedFrom`/`origPN`), and offer to
  cross them to B. Reuse `propagatePartAcrossPanels` (`:40058`) single-write + guards (capturedProjectId, owner-priority,
  excluded-row, ECO) — but it must additionally write `partNumber`/`bcNo`/`isCrossed`/`crossedFrom`, not just price/LT/vendor.
- **Risk:** it's a **part# mutation** across Lines (bigger than a price patch) → must be an explicit prompt, never
  silent; must carry the right price/LT/vendor.

## ★ The one decision Jon must make (Int. 2 timing — "the core of the build")
At cross-commit time, the NEW part's **lead time and vendor haven't resolved yet** — they arrive via later async
ItemCard/vendor lookups (`:28452`/`:28469`), which is exactly why the existing F065 fire from this path is price-only.
So when the other Lines' A-rows are auto-crossed to B, they should receive:
- **Option A — cross now, price only, let each Line resolve LT/vendor itself.** Simpler; immediate; the other Lines
  become B with the price, and their LT/vendor fill in via their own pricing/lookup like any crossed row.
- **Option B — defer the propagation until B's LT/vendor async lookups land, then cross the other Lines with the full
  set (part# + price + LT + vendor).** Fully syncs everything in one action, but requires waiting for the async lookups
  and threading the deferred propagation.

## Recommendation
Build **Interpretation 2** (propagate the cross); shelve Interpretation 1 (no reliable equivalence data). For the timing
decision, **Option A (cross-now, price-only)** is the simpler/safer first cut and matches how the current F065 cross-fire
already behaves (price-only, LT/vendor resolve async) — but Jon's call, since B (full defer) gives the cleaner one-shot
full-sync he liked in F065. Once Jon picks the timing, this is a focused build reusing the proven propagation path.

**Key refs:** crossing `commitBcItem :28350`/`:28457` · alternates `:2336`/`:2493`/`:2511` · F065 fire-from-cross
`:28539` · match key `:52173`/`:52178` · index `:52186` · propagate `:40058`.
