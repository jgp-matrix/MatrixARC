/**
 * Backfill BC Purchase Prices from ARC BOM data
 *
 * Scans all ARC projects, finds BOM items with priceSource="bc" and unitPrice > 0
 * that may not have a BC Purchase Price record, and pushes them.
 *
 * Run from the browser console on matrix-arc.web.app while logged in as admin.
 * Paste the entire script into the console and press Enter.
 *
 * Prerequisites:
 * - Must be logged in to ARC with BC Connected
 * - Must have _bcToken available
 */

(async function backfillBcPrices() {
  if (!window._bcToken) { console.error('BC not connected. Wait for BC Connected indicator.'); return; }
  if (!window._appCtx?.projectsPath) { console.error('App not loaded yet.'); return; }

  const db = firebase.firestore();
  const path = window._appCtx.projectsPath;

  console.log('=== BACKFILL BC PURCHASE PRICES ===');
  console.log('Loading all projects...');

  const snap = await db.collection(path).get();
  const projects = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  console.log(`Found ${projects.length} projects`);

  // Collect all unique BOM items with BC prices
  const itemMap = {}; // partNumber → { price, vendorName, vendorNo, sources }
  let totalItems = 0;

  for (const proj of projects) {
    for (const panel of (proj.panels || [])) {
      for (const row of (panel.bom || [])) {
        if (row.isLaborRow || row.isContingency) continue;
        if (!row.partNumber || !row.unitPrice || row.unitPrice <= 0) continue;
        if (row.priceSource !== 'bc') continue;

        const pn = row.partNumber.trim();
        if (!pn) continue;
        totalItems++;

        // Keep the most recent price for each part number
        if (!itemMap[pn] || (row.priceDate && row.priceDate > (itemMap[pn].priceDate || 0))) {
          itemMap[pn] = {
            price: row.unitPrice,
            vendorName: row.bcVendorName || '',
            priceDate: row.priceDate || 0,
            bcPoDate: row.bcPoDate || null,
            project: proj.bcProjectNumber || proj.name || proj.id
          };
        }
      }
    }
  }

  const uniqueParts = Object.keys(itemMap);
  console.log(`Found ${totalItems} BC-priced BOM items across all projects`);
  console.log(`${uniqueParts.length} unique part numbers to check`);

  // Load vendor list for vendor number lookup
  const vendors = await window.bcListVendors();
  const vendorMap = {};
  vendors.forEach(v => { vendorMap[v.displayName.toLowerCase()] = v.number; });
  console.log(`Loaded ${vendors.length} vendors`);

  // Check which items are missing Purchase Prices
  console.log('Fetching existing Purchase Prices from BC...');
  const existingPP = await window.bcFetchPurchasePrices(uniqueParts);
  console.log(`BC has Purchase Prices for ${existingPP.size} of ${uniqueParts.length} items`);

  const missing = uniqueParts.filter(pn => {
    const pp = existingPP.get(pn);
    return !pp || !pp.directUnitCost || pp.directUnitCost === 0;
  });

  console.log(`${missing.length} items MISSING Purchase Prices in BC`);

  if (missing.length === 0) {
    console.log('All items have Purchase Prices. Nothing to do!');
    return;
  }

  // Push missing prices
  let pushed = 0, failed = 0, noVendor = 0;

  for (let i = 0; i < missing.length; i++) {
    const pn = missing[i];
    const item = itemMap[pn];

    // Look up vendor number
    let vendorNo = null;
    if (item.vendorName) {
      const vnLower = item.vendorName.toLowerCase();
      vendorNo = vendorMap[vnLower];
      if (!vendorNo) {
        // Fuzzy match
        const match = vendors.find(v => vnLower.includes(v.displayName.toLowerCase()) || v.displayName.toLowerCase().includes(vnLower));
        if (match) vendorNo = match.number;
      }
    }

    // If no vendor from BOM, try BC item card
    if (!vendorNo) {
      try {
        vendorNo = await window.bcGetItemVendorNo(pn);
      } catch (e) {}
    }

    if (!vendorNo) {
      noVendor++;
      console.warn(`  [${i + 1}/${missing.length}] ${pn} — no vendor found, skipping Purchase Price (updating Item Card only)`);
      // Still update Item Card Unit_Cost
      try {
        await window.bcPatchItemOData(pn, { Unit_Cost: item.price });
        pushed++;
      } catch (e) {
        console.warn(`  [${i + 1}/${missing.length}] ${pn} — Item Card update failed:`, e.message);
        failed++;
      }
      continue;
    }

    try {
      // Update Item Card (may fail if locked by open PO/ledger — that's OK)
      try { await window.bcPatchItemOData(pn, { Unit_Cost: item.price }); }
      catch (e) { console.warn(`  [${i + 1}/${missing.length}] ${pn} — Item Card locked: ${e.message.slice(0, 60)} (pushing Purchase Price anyway)`); }
      // Push Purchase Price (independent of Item Card)
      const result = await window.bcPushPurchasePrice(pn, vendorNo, item.price, item.priceDate || Date.now());
      if (result && result.ok) {
        pushed++;
        console.log(`  [${i + 1}/${missing.length}] ✓ ${pn} → $${item.price.toFixed(2)} (${item.vendorName})`);
      } else {
        console.warn(`  [${i + 1}/${missing.length}] ${pn} — Purchase Price push result:`, result?.reason || 'unknown');
        failed++;
      }
    } catch (e) {
      console.warn(`  [${i + 1}/${missing.length}] ${pn} — failed:`, e.message);
      failed++;
    }

    // Throttle to avoid BC rate limiting
    if (i % 10 === 9) await new Promise(r => setTimeout(r, 500));
  }

  console.log('\n=== BACKFILL COMPLETE ===');
  console.log(`Pushed: ${pushed}, Failed: ${failed}, No Vendor: ${noVendor}`);
  console.log(`Total missing: ${missing.length}`);
})();
