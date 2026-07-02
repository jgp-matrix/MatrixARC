# #189 Trace — Global Default quoteValidityDays Not Persisting

**Author:** Sam Wize (Coach)
**Date:** 2026-07-01
**Type:** Read-only trace (no fix)
**Tip:** master `c46e75fd` (v1.21.14)
**Symptom:** Set quoteValidityDays=60 in Config modal → save → refresh → reads back 30

---

## Link-by-link trace

### Link 1: SAVE (line 17961) — CORRECT in source

```js
savePricingConfig(uid,{contingencyBOM:bomVal,contingencyConsumables:consVal,
  budgetaryContingencyPct:budgPct,codaleStaleDays,bcStaleDays,defaultStaleDays,
  ecoDefaultLaborRate,quoteValidityDays}),
```

`quoteValidityDays` is a shorthand property referencing the React state variable defined at
line 17763. No shadowing variables exist in scope. The state is updated by the input handler
at line 18018: `setQuoteValidityDays(Math.max(1,parseInt(e.target.value)||30))`. User types 60
→ state = 60 → save object includes `quoteValidityDays: 60`. **Correct.**

### Link 2: WRITE→STORE (line 2027-2030) — CORRECT in source

```js
async function savePricingConfig(uid,cfg){
  _pricingConfig=cfg;
  const path=_appCtx.configPath?`${_appCtx.configPath}/pricing`:`users/${uid}/config/pricing`;
  await fbDb.doc(path).set(cfg);
}
```

`.set(cfg)` with no `{merge:true}` — FULL doc replacement. Whatever is in `cfg` is the entire
doc. No whitelist, no field filtering. `quoteValidityDays: 60` would be written. The in-memory
`_pricingConfig` is also updated to `cfg` (line 2028). No try/catch — if Firestore throws, the
caller's `await Promise.all` rejects and the "Saved" feedback never shows. **Correct.**

### Link 3: LOAD (line 2020-2026) — CORRECT in source

```js
_pricingConfig={..., quoteValidityDays:c.quoteValidityDays??30};
```

Reads from the same path expression as save. `c = d.data()` where `d` is the Firestore doc.
If the doc contains `quoteValidityDays: 60`, this reads 60. If the field is absent, `??30`
provides the fallback. **Correct.**

### Link 4: STATE SEED (line 17763) — CORRECT in source

```js
const [quoteValidityDays,setQuoteValidityDays]=useState(_pricingConfig.quoteValidityDays??30);
```

`loadPricingConfig` is awaited at login (line 46662, inside `Promise.all`). The Config modal
cannot open until the app is loaded. By the time `PricingConfigModal` mounts, `_pricingConfig`
is populated from Firestore. The seed reads the live value. **Correct.**

---

## All four links trace clean. The code is correct on master.

---

## Root cause hypothesis: STALE DEPLOY

The most likely cause is that **production is serving a version prior to Phase 1 (v1.21.13)**,
or the save was executed on such a version. Evidence:

**v1.21.12 save call (pre-Phase 1):**
```js
// git show 3d67163b:src/app.jsx — line 17901
savePricingConfig(uid,{contingencyBOM:bomVal,contingencyConsumables:consVal,
  budgetaryContingencyPct:budgPct,codaleStaleDays,bcStaleDays,defaultStaleDays,
  ecoDefaultLaborRate}),
```

**Missing: `quoteValidityDays` is NOT in this object.** The v1.21.12 save writes a 7-field
object. Because `savePricingConfig` uses `.set(cfg)` (full doc replacement, not merge), this
CLOBBERS any `quoteValidityDays` that existed on the Firestore doc.

**Scenario that reproduces the symptom:**
1. The Config modal's "Quote Validity" input exists in the DOM (Phase 1 HTML was deployed)
2. But the save handler's object literal is the v1.21.12 version (7 fields, no quoteValidityDays)
3. User sets 60, clicks Save → save writes {7 fields} → `.set()` replaces the doc → `quoteValidityDays` is not in the written object → field absent from Firestore
4. Refresh → `loadPricingConfig` reads doc → `c.quoteValidityDays` is undefined → `??30` → shows 30

**This happens if:**
- `firebase deploy --only hosting` was not run after the `c46e75fd` release commit, OR
- The browser is serving a cached prior build (service worker, CDN cache, browser cache)

**Verification step for Jon:** Check what version the browser is actually running:
- Open the app → browser console → look for a version string in the page source or `version.json`
- Hard refresh (Ctrl+Shift+R) to bypass service worker / cache
- Confirm the running version is v1.21.14, then retry the save

If the running version IS v1.21.14 and the bug persists, the code trace is exhaustive — all four
links are correct — and the issue would be in Firestore itself (permissions, offline cache,
or a race with another client). But stale deploy is the 95% explanation.

---

## Secondary check: no other save path clobbers the field

`savePricingConfig` is called from exactly ONE site (line 17961). No other code writes to the
`config/pricing` doc. There is no second modal, no background save, no migration script that
could overwrite the doc with a field-subset. Once the correct version is running, saves should
persist `quoteValidityDays` reliably.
