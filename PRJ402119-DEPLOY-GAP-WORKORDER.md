# DEV WORK ORDER — PRJ402119 Deploy-Gap Confirmation

**Author:** Freddy Lyst · 2026-06-03
**Status:** Pending — next session
**Scope:** CONFIRM + ENUMERATE, do NOT deploy yet

---

## Context (established)
- PRJ402119 (scanned bitmap drawing) now extracts to an EMPTY BOM (labor lines only). Previously it got 13/14 items via the JPEG+P2 path.
- Coach's findings (PRJ402119-EXTRACTION-REGRESSION-FINDINGS.md): the #82 fix (remove the noBomReason "wrong-page-type" escape; crop-prompt quality alerts) is COMMITTED to functions/index.js, but there's no repo-record evidence `firebase deploy --only functions` was run after those commits. deploy.sh deploys HOSTING ONLY. So production Cloud Functions may be running PRE-#82 code, taking the escape on pdf-native → empty.
- Precedent: this codebase had a server half-deploy gap before (F-1d.8, ~v1.20.81).
- Ruled out: #92 (doesn't touch extraction), zero-BOM-classification (modal would've shown).
- H10 (re-extraction silent discard) only relevant IF this was a RE-extraction — confirm with Noah: first extraction or re-extraction?

## STEP 1 — CONFIRM the diagnosis (runtime, cheap, definitive)
1a. On PRJ402119, read `panel.extractionReport.extractionPath` and `rawCount`.
    SMOKING GUN = extractionPath "pdf-native" + rawCount 0.
1b. `firebase functions:log` (and/or check deployed function version/timestamp) — confirm the DEPLOYED function predates the #82 commits (i.e., production is running pre-fix code). Absence of a deploy record is not proof — confirm the deployed code is actually stale.

## STEP 2 — ENUMERATE the undeployed delta (DO THIS BEFORE ANY DEPLOY — hard gate)
The risk: if functions were never deployed after #82, they likely weren't deployed after OTHER commits either. Running `firebase deploy --only functions` ships EVERYTHING undeployed since the last functions deploy — potentially many commits of never-production-tested code, all at once.
2a. Determine the last time functions were actually deployed (deploy logs / function version timestamps).
2b. Diff deployed functions vs committed functions/index.js — list EVERY undeployed function change since that last deploy, not just #82.
2c. Report the batch. If it's ONLY the #82 fix → low-risk targeted deploy. If it's a large batch → flag for review; we decide whether to deploy all, or stage it, before pushing.

## STEP 3 — RECONCILE the routing (determines if deploy is the COMPLETE fix)
PRJ402119 previously got 13/14 via the JPEG+P2 (client-side) path. It now routes to pdf-native. Resolve:
3a. Why is it on pdf-native now? (Coach: "originalPdfPath exists.") Is the JPEG+P2 path client-side/hosting-shipped (hence it worked) while pdf-native depends on the undeployed function?
3b. Is this ALSO a routing issue (#83 — scanned docs not reliably hitting JPEG+P2)?
3c. KEY QUESTION: does deploying #82 RESTORE the 13/14 result, or does it only stop the silent-empty while pdf-native still gives WORSE extraction than JPEG+P2? If the latter, routing (#83) is also needed for QUALITY, not just non-empty. State which.

## DELIVERABLE
Report Steps 1–3. NO deploy yet. Based on the enumeration (Step 2) and routing finding (Step 3), the routing session decides: targeted #82 deploy vs. staged deploy, and whether #83 routing also needs a fix.

## SEPARATE SYSTEMIC FOLLOW-UP (log, scope after the immediate fix)
deploy.sh deploys hosting only → silent repo/production FUNCTION drift. Needs: (1) functions deploy folded into the deploy flow, and (2) a deployed-vs-committed function-version check so drift is caught automatically (a function-side analog of the cache-bust verifier). This is the root prevention — the #82 gap is a symptom of it.
