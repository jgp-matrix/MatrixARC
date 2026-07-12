// B016-2 focused unit test — exercises the REAL pure merge helpers extracted from
// src/app.jsx (no logic copy, no app.jsx refactor). Slices the self-contained block
// [B016_METADATA_WHITELIST … end of _mergeBomOnSave] out of source and evals it — these
// functions depend only on Array/Map/Set, so they run standalone without React/browser deps.
//
// Run: node tests/b016-merge.test.js   (from the repo root / worktree root)
// Covers the plan's row-merge matrix: new row, price-group last-writer, LT-group last-writer,
// bcPoDate monotonic, metadata gap-fill (undefined=preserve / null=honor), delete-vs-add
// (preserve stale absence / honor explicit delete), and the F019 "fresh priceDate wins" case.

const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '..', 'src', 'app.jsx');
const src = fs.readFileSync(SRC, 'utf8');

const startMarker = 'const B016_METADATA_WHITELIST=[';
const endMarker = '// ─── Milestone E: ECO Flatten Utilities ───';
const start = src.indexOf(startMarker);
const end = src.indexOf(endMarker, start);
if (start < 0 || end < 0) {
  console.error('FAIL: could not locate the B016 merge block in src/app.jsx');
  process.exit(1);
}
const block = src.slice(start, end);
// Expose the three declarations from the eval'd block.
const factory = new Function(`${block}\nreturn {B016_METADATA_WHITELIST,_b016Ts,_mergeBomOnSave};`);
const { B016_METADATA_WHITELIST, _b016Ts, _mergeBomOnSave } = factory();

let passed = 0, failed = 0;
function assert(name, cond) {
  if (cond) { passed++; console.log('  PASS', name); }
  else { failed++; console.error('  FAIL', name); }
}
function rowById(arr, id) { return arr.find(r => String(r.id) === String(id)); }

// ── _b016Ts coercion ──
assert('_b016Ts number', _b016Ts(1000) === 1000);
assert('_b016Ts undefined → -Infinity', _b016Ts(undefined) === -Infinity);
assert('_b016Ts null → -Infinity', _b016Ts(null) === -Infinity);
assert('_b016Ts numeric string', _b016Ts('1500') === 1500);

// ── New row (id absent on server) → keep incoming ──
{
  const merged = _mergeBomOnSave(
    [{ id: 'a', qty: 1 }, { id: 'new', qty: 5, partNumber: 'X' }],
    [{ id: 'a', qty: 1 }],
    []
  );
  assert('new row kept', !!rowById(merged, 'new') && rowById(merged, 'new').qty === 5);
  assert('new-row merge length', merged.length === 2);
}

// ── Content edit wins as base (qty/PN/desc) ──
{
  const merged = _mergeBomOnSave(
    [{ id: 'a', qty: 9, partNumber: 'NEW-PN' }],
    [{ id: 'a', qty: 1, partNumber: 'OLD-PN' }],
    []
  );
  assert('content edit wins qty', rowById(merged, 'a').qty === 9);
  assert('content edit wins partNumber', rowById(merged, 'a').partNumber === 'NEW-PN');
}

// ── Layer A price group: newer priceUpdatedAt wins (B016-2 FIX — keyed on the dedicated clock,
//    NOT priceDate, which is the BC Starting_Date domain value and legitimately null) ──
{
  // server priceUpdatedAt NEWER → server price group wins (whole group transferred together)
  const m1 = _mergeBomOnSave(
    [{ id: 'a', unitPrice: 10, priceSource: 'manual', priceDate: 1000, priceUpdatedAt: 1000 }],
    [{ id: 'a', unitPrice: 22, priceSource: 'bc', priceDate: 2000, priceUpdatedAt: 2000 }],
    []
  );
  const r1 = rowById(m1, 'a');
  assert('price group: newer server wins unitPrice', r1.unitPrice === 22);
  assert('price group: newer server wins priceSource', r1.priceSource === 'bc');
  assert('price group: newer server wins priceDate', r1.priceDate === 2000);
  assert('price group: newer server wins priceUpdatedAt', r1.priceUpdatedAt === 2000);

  // incoming priceUpdatedAt NEWER → incoming wins (F019 completion / user re-price)
  const m2 = _mergeBomOnSave(
    [{ id: 'a', unitPrice: 33, priceSource: 'bc', priceDate: 5000, priceUpdatedAt: 5000 }],
    [{ id: 'a', unitPrice: 22, priceSource: 'bc', priceDate: 2000, priceUpdatedAt: 2000 }],
    []
  );
  assert('price group: newer incoming wins', rowById(m2, 'a').unitPrice === 33 && rowById(m2, 'a').priceUpdatedAt === 5000);

  // equal priceUpdatedAt → incoming stays (base {...inc}); F019 tie still lands its price
  const m3 = _mergeBomOnSave(
    [{ id: 'a', unitPrice: 44, priceSource: 'bc', priceDate: 2000, priceUpdatedAt: 2000 }],
    [{ id: 'a', unitPrice: 22, priceSource: 'bc', priceDate: 2000, priceUpdatedAt: 2000 }],
    []
  );
  assert('price group: equal priceUpdatedAt → incoming kept (F019 tie lands)', rowById(m3, 'a').unitPrice === 44);

  // priceDate must NOT act as the clock: a fresh incoming edit with priceDate:null but a NEWER
  // priceUpdatedAt beats a server twin holding a real priceDate. (Regression guard for Finding 1.)
  const m4 = _mergeBomOnSave(
    [{ id: 'a', unitPrice: 15, priceSource: 'manual', priceDate: null, priceUpdatedAt: 9000 }],
    [{ id: 'a', unitPrice: 22, priceSource: 'bc', priceDate: 2000, priceUpdatedAt: 2000 }],
    []
  );
  const r4 = rowById(m4, 'a');
  assert('price group: null-priceDate incoming with newer clock wins (not reverted)', r4.unitPrice === 15 && r4.priceSource === 'manual' && r4.priceDate === null);
}

// ── Finding 1 BLOCKER regression: clear-price over a BC-priced server row → STAYS CLEARED ──
{
  // User clears the price (unitPrice/priceSource/priceDate all null) with a fresh priceUpdatedAt.
  // A concurrent server twin holds a real BC price + priceDate. Under the OLD priceDate-keyed
  // Layer A this cleared edit (priceDate:null = -Infinity) always lost to the server → silent
  // revert. Now the fresh priceUpdatedAt wins and the clear sticks.
  const mClear = _mergeBomOnSave(
    [{ id: 'a', qty: 1, unitPrice: null, priceSource: null, priceDate: null, priceUpdatedAt: 9000 }],
    [{ id: 'a', qty: 1, unitPrice: 22, priceSource: 'bc', priceDate: 2000, priceUpdatedAt: 2000 }],
    []
  );
  const rc = rowById(mClear, 'a');
  assert('clear-price: unitPrice stays null (not reverted to BC)', rc.unitPrice === null);
  assert('clear-price: priceSource stays null', rc.priceSource === null);
  assert('clear-price: priceDate stays null', rc.priceDate === null);
}

// ── Finding 1 BLOCKER regression: budgetary price over a BC-priced server row → STAYS BUDGETARY ──
{
  // Budgetary edit = manual price with NO priceDate (priceDate:null by design). Fresh
  // priceUpdatedAt must beat the server's BC price+date so the budgetary value holds.
  const mBudget = _mergeBomOnSave(
    [{ id: 'a', qty: 1, unitPrice: 15, priceSource: 'manual', priceDate: null, priceUpdatedAt: 9000 }],
    [{ id: 'a', qty: 1, unitPrice: 22, priceSource: 'bc', priceDate: 2000, priceUpdatedAt: 2000 }],
    []
  );
  const rb = rowById(mBudget, 'a');
  assert('budgetary: unitPrice stays 15 (not reverted to BC 22)', rb.unitPrice === 15);
  assert('budgetary: priceSource stays manual', rb.priceSource === 'manual');
  assert('budgetary: priceDate stays null', rb.priceDate === null);
}

// ── Layer A lead-time group: newer leadTimeUpdatedAt wins ──
{
  const m = _mergeBomOnSave(
    [{ id: 'a', leadTimeDays: 5, leadTimeSource: 'ai', leadTimeUpdatedAt: 1000, leadTimeEstimated: true }],
    [{ id: 'a', leadTimeDays: 30, leadTimeSource: 'supplier', leadTimeUpdatedAt: 9000, leadTimeEstimated: false }],
    []
  );
  const r = rowById(m, 'a');
  assert('LT group: newer server wins days', r.leadTimeDays === 30);
  assert('LT group: newer server wins source', r.leadTimeSource === 'supplier');
  assert('LT group: newer server wins estimated flag', r.leadTimeEstimated === false);
}

// ── Layer A bcPoDate: monotonic max ──
{
  const mUp = _mergeBomOnSave([{ id: 'a', bcPoDate: 1000 }], [{ id: 'a', bcPoDate: 5000 }], []);
  assert('bcPoDate monotonic: server-higher wins', rowById(mUp, 'a').bcPoDate === 5000);
  const mDown = _mergeBomOnSave([{ id: 'a', bcPoDate: 9000 }], [{ id: 'a', bcPoDate: 5000 }], []);
  assert('bcPoDate monotonic: incoming-higher kept', rowById(mDown, 'a').bcPoDate === 9000);
}

// ── Layer B metadata gap-fill: undefined=preserve, null=honor clear ──
{
  const m = _mergeBomOnSave(
    [{ id: 'a', qty: 1, /* isCrossed undefined */ correctionType: null }],
    [{ id: 'a', qty: 1, isCrossed: true, crossedFrom: 'OLD', correctionType: 'ocr', cannotSupply: true }],
    []
  );
  const r = rowById(m, 'a');
  assert('gap-fill: undefined isCrossed restored from server', r.isCrossed === true);
  assert('gap-fill: undefined crossedFrom restored', r.crossedFrom === 'OLD');
  assert('gap-fill: undefined cannotSupply restored', r.cannotSupply === true);
  assert('gap-fill: explicit null honored (not overwritten)', r.correctionType === null);
}

// ── Delete-vs-add: server row absent from incoming ──
{
  // no marker → PRESERVE (staleness protection)
  const mKeep = _mergeBomOnSave([{ id: 'a' }], [{ id: 'a' }, { id: 'b', partNumber: 'KEEP' }], []);
  assert('delete-vs-add: absent server row preserved (no marker)', !!rowById(mKeep, 'b'));

  // marker present → DROP (explicit delete sticks)
  const mDrop = _mergeBomOnSave([{ id: 'a' }], [{ id: 'a' }, { id: 'b' }], ['b']);
  assert('delete-vs-add: explicit delete drops the row', !rowById(mDrop, 'b'));
  assert('delete-vs-add: kept row survives explicit delete of another', !!rowById(mDrop, 'a'));
}

// ── Bulk clear (removePage cascade): incoming empty + all ids in deleted → empty ──
{
  const server = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
  const mFull = _mergeBomOnSave([], server, ['a', 'b', 'c']);
  assert('bulk clear: all-ids-deleted → empty result', mFull.length === 0);
  // concurrent server-only add (id d) not in deleted list → preserved
  const mPartial = _mergeBomOnSave([], [...server, { id: 'd', partNumber: 'CONCURRENT' }], ['a', 'b', 'c']);
  assert('bulk clear: concurrent server add preserved', mPartial.length === 1 && rowById(mPartial, 'd').partNumber === 'CONCURRENT');
}

// ── Brand-new panel (empty server) → incoming verbatim ──
{
  const inc = [{ id: 'a', qty: 3 }];
  const m = _mergeBomOnSave(inc, [], []);
  assert('empty server → incoming returned verbatim', m === inc);
}

// ── F019 scenario: standalone repricing lands over a stale concurrent snapshot ──
{
  // F019 save carries fresh prices (priceDate 8000); a stale peer save on the server holds
  // the pre-reprice snapshot (priceDate 3000) + a manual qty edit the user made meanwhile.
  const f019Incoming = [
    { id: 'r1', qty: 1, unitPrice: 12.5, priceSource: 'bc', priceDate: 8000, priceUpdatedAt: 8000 },
    { id: 'r2', qty: 1, unitPrice: 7.0, priceSource: 'bc', priceDate: 8000, priceUpdatedAt: 8000 },
  ];
  const staleServer = [
    { id: 'r1', qty: 4, unitPrice: 0, priceSource: null, priceDate: 3000, priceUpdatedAt: 3000, cannotSupply: false },
    { id: 'r2', qty: 1, unitPrice: 0, priceSource: null, priceDate: 3000, priceUpdatedAt: 3000 },
  ];
  const m = _mergeBomOnSave(f019Incoming, staleServer, []);
  assert('F019: fresh price lands (r1)', rowById(m, 'r1').unitPrice === 12.5 && rowById(m, 'r1').priceSource === 'bc');
  assert('F019: fresh price lands (r2)', rowById(m, 'r2').unitPrice === 7.0);
  // server metadata the incoming omitted is still gap-filled (cannotSupply)
  assert('F019: server metadata gap-filled alongside fresh price', rowById(m, 'r1').cannotSupply === false);
}

console.log(`\nB016-2 merge tests: ${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
