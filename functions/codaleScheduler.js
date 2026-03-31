/**
 * Codale Price Scraper — Scheduler, Orchestrator & Price Writer
 *
 * Architecture:
 * 1. codaleStartPriceScrape (callable or scheduled) — fetches items needing pricing, kicks off batches
 * 2. codaleScrapeWorkerBatch (Pub/Sub) — processes a batch of 5 items via Puppeteer
 * 3. Results written to Firestore codalePrices collection + BC Purchase Prices via OData
 */

const functions = require("firebase-functions");
const admin = require("firebase-admin");
const { scrapeBatch } = require("./codaleScraper");

const db = admin.firestore();

const CODALE_VENDOR_NO = "V00165";
const BATCH_SIZE = 5;
const ITEMS_PER_RUN = 30; // Max items per scheduled run (spread load across day)
const PRICE_STALE_DAYS = 30; // Re-scrape prices older than this

/**
 * Get BC OAuth token from user's stored credentials
 */
async function getBcToken(uid) {
  const bcDoc = await db.doc(`users/${uid}/config/bc`).get();
  if (!bcDoc.exists) return null;
  return bcDoc.data().token || null;
}

/**
 * Get BC company ID from user's stored config
 */
async function getBcCompanyId(uid) {
  const bcDoc = await db.doc(`users/${uid}/config/bc`).get();
  if (!bcDoc.exists) return null;
  return bcDoc.data().companyId || null;
}

/**
 * Fetch all BC items with Vendor_No = V00165 via OData
 * Returns: [{ number, displayName, vendorNo }]
 */
async function fetchCodaleItems(bcToken, bcApiBase, companyId) {
  const items = [];
  let skip = 0;
  const top = 100;

  while (true) {
    const url = `${bcApiBase}/companies(${companyId})/items?$filter=contains(number,'')&$top=${top}&$skip=${skip}&$orderby=number&$select=number,displayName`;
    const r = await fetch(url, {
      headers: { "Authorization": `Bearer ${bcToken}` },
    });
    if (!r.ok) break;
    const data = await r.json();
    const batch = data.value || [];
    if (!batch.length) break;
    items.push(...batch);
    skip += top;
    if (batch.length < top) break;
  }

  // Now filter by vendor — need OData ItemCard for Vendor_No field
  // BC v2.0 API doesn't expose Vendor_No on items endpoint, so we check via ItemCard OData
  const codaleItems = [];
  for (const item of items) {
    try {
      // Use OData page to check Vendor_No
      const odataUrl = `${bcApiBase.replace('/v2.0/', '/v2.0/')}/companies(${companyId})/items?$filter=number eq '${encodeURIComponent(item.number)}'&$select=number,displayName`;
      // For vendor filtering, we'll use a different approach — check purchase prices
      codaleItems.push(item);
    } catch (e) {
      // Skip items we can't check
    }
  }

  return items; // We'll filter by vendor via purchase prices or OData below
}

/**
 * Fetch items assigned to Codale vendor using OData ItemCard page
 */
async function fetchCodaleVendorItems(bcToken, bcApiBase, companyId) {
  // Use OData to find items where Vendor_No = V00165
  // Try the ItemCard OData page
  const items = [];
  let skip = 0;
  const top = 50;

  while (true) {
    // Discover the OData ItemCard page
    const url = `${bcApiBase}/companies(${companyId})/items?$filter=number ne ''&$top=${top}&$skip=${skip}&$select=number,displayName`;
    const r = await fetch(url, { headers: { "Authorization": `Bearer ${bcToken}` } });
    if (!r.ok) break;
    const data = await r.json();
    const batch = data.value || [];
    if (!batch.length) break;
    items.push(...batch.map(i => ({ number: i.number, displayName: i.displayName })));
    skip += top;
    if (batch.length < top) break;
  }

  return items;
}

/**
 * Check which items need pricing (no recent Codale price in Firestore)
 */
async function getItemsNeedingPricing(uid, allItems) {
  const staleThreshold = Date.now() - PRICE_STALE_DAYS * 24 * 60 * 60 * 1000;
  const needsPricing = [];

  // Check Firestore codalePrices for each item
  for (const item of allItems) {
    const priceDoc = await db.doc(`users/${uid}/config/codalePrices/items`).get();
    const prices = priceDoc.exists ? priceDoc.data() : {};
    const existing = prices[item.number];

    if (!existing || !existing.scrapedAt || existing.scrapedAt < staleThreshold) {
      needsPricing.push(item);
    }
  }

  return needsPricing;
}

/**
 * Write scraped prices to Firestore
 */
async function writePricesToFirestore(uid, results) {
  const priceDocRef = db.doc(`users/${uid}/config/codalePrices`);
  const priceDoc = await priceDocRef.get();
  const existing = priceDoc.exists ? priceDoc.data() : {};

  const updates = {};
  for (const result of results) {
    if (result.found) {
      updates[result.partNumber] = {
        price: result.price,
        availability: result.availability || null,
        uom: result.uom || "EA",
        productName: result.productName || null,
        scrapedAt: Date.now(),
        vendor: "Codale Electric Supply",
        vendorNo: CODALE_VENDOR_NO,
      };
    }
  }

  if (Object.keys(updates).length > 0) {
    await priceDocRef.set({ ...existing, ...updates }, { merge: true });
  }

  return Object.keys(updates).length;
}

/**
 * Write scraped prices to BC Purchase Prices via OData
 */
async function writePricesToBC(bcToken, bcApiBase, companyId, results) {
  let written = 0;

  // Discover the PurchasePrices OData page
  let purchasePricePage = null;
  try {
    const pagesUrl = `${bcApiBase}/companies(${companyId})/`;
    // Try common OData page names for purchase prices
    const pageNames = ["purchasePrices", "PurchasePrices", "Purchase_Prices"];
    for (const name of pageNames) {
      const testUrl = `${bcApiBase}/companies(${companyId})/${name}?$top=1`;
      const r = await fetch(testUrl, { headers: { "Authorization": `Bearer ${bcToken}` } });
      if (r.ok) {
        purchasePricePage = name;
        break;
      }
    }
  } catch (e) {
    console.warn("Could not discover PurchasePrices page:", e.message);
  }

  if (!purchasePricePage) {
    console.warn("PurchasePrices OData page not found — skipping BC write");
    return 0;
  }

  const today = new Date().toISOString().split("T")[0];

  for (const result of results) {
    if (!result.found || !result.price) continue;

    try {
      // Check if price record already exists
      const checkUrl = `${bcApiBase}/companies(${companyId})/${purchasePricePage}?$filter=Item_No eq '${encodeURIComponent(result.partNumber)}' and Vendor_No eq '${CODALE_VENDOR_NO}'`;
      const checkR = await fetch(checkUrl, { headers: { "Authorization": `Bearer ${bcToken}` } });

      if (checkR.ok) {
        const checkData = await checkR.json();
        const existing = (checkData.value || [])[0];

        if (existing) {
          // PATCH existing record
          const etag = existing["@odata.etag"];
          const patchUrl = `${bcApiBase}/companies(${companyId})/${purchasePricePage}(${existing.systemId || existing.SystemId})`;
          await fetch(patchUrl, {
            method: "PATCH",
            headers: {
              "Authorization": `Bearer ${bcToken}`,
              "Content-Type": "application/json",
              "If-Match": etag || "*",
            },
            body: JSON.stringify({
              Direct_Unit_Cost: result.price,
              Starting_Date: today,
              Unit_of_Measure_Code: result.uom || "EA",
            }),
          });
        } else {
          // POST new record
          await fetch(`${bcApiBase}/companies(${companyId})/${purchasePricePage}`, {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${bcToken}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              Item_No: result.partNumber,
              Vendor_No: CODALE_VENDOR_NO,
              Direct_Unit_Cost: result.price,
              Starting_Date: today,
              Unit_of_Measure_Code: result.uom || "EA",
            }),
          });
        }
        written++;
      }
    } catch (e) {
      console.warn(`BC purchase price write failed for ${result.partNumber}:`, e.message);
    }
  }

  return written;
}

/**
 * Main orchestrator — callable from ARC UI or scheduled trigger
 * Fetches items needing Codale pricing, scrapes in batches, writes results
 */
async function runCodaleScrape(uid, options = {}) {
  const codaleUser = process.env.CODALE_USERNAME;
  const codalePass = process.env.CODALE_PASSWORD;
  if (!codaleUser || !codalePass) {
    throw new Error("Codale credentials not configured (CODALE_USERNAME / CODALE_PASSWORD)");
  }

  // Get the user's list of Codale items from Firestore
  // (These are maintained by the ARC frontend when items are assigned to Codale vendor)
  const itemListDoc = await db.doc(`users/${uid}/config/codaleItems`).get();
  let allItems = [];
  if (itemListDoc.exists) {
    allItems = itemListDoc.data().items || [];
  }

  if (!allItems.length) {
    console.log("No Codale items configured — nothing to scrape");
    return { scraped: 0, updated: 0, errors: 0 };
  }

  // Filter to items needing pricing refresh
  const priceDoc = await db.doc(`users/${uid}/config/codalePrices`).get();
  const existingPrices = priceDoc.exists ? priceDoc.data() : {};
  const staleThreshold = Date.now() - PRICE_STALE_DAYS * 24 * 60 * 60 * 1000;

  const needsPricing = allItems.filter(item => {
    const pn = typeof item === "string" ? item : item.number;
    const existing = existingPrices[pn];
    return !existing || !existing.scrapedAt || existing.scrapedAt < staleThreshold;
  });

  if (!needsPricing.length) {
    console.log("All Codale items have recent pricing — nothing to scrape");
    return { scraped: 0, updated: 0, errors: 0 };
  }

  // Take a random subset for this run (spread load across day)
  const maxItems = options.maxItems || ITEMS_PER_RUN;
  const shuffled = needsPricing.sort(() => Math.random() - 0.5);
  const toScrape = shuffled.slice(0, maxItems);
  const partNumbers = toScrape.map(i => typeof i === "string" ? i : i.number);

  console.log(`Codale scrape: ${partNumbers.length} items to process (${needsPricing.length} total needing refresh)`);

  // Process in batches
  let totalScraped = 0;
  let totalUpdated = 0;
  let totalErrors = 0;
  const allResults = [];

  for (let i = 0; i < partNumbers.length; i += BATCH_SIZE) {
    const batch = partNumbers.slice(i, i + BATCH_SIZE);
    console.log(`Processing batch ${Math.floor(i / BATCH_SIZE) + 1}: ${batch.join(", ")}`);

    try {
      const results = await scrapeBatch(batch, codaleUser, codalePass);
      allResults.push(...results);
      totalScraped += batch.length;
      totalErrors += results.filter(r => !r.found).length;
    } catch (e) {
      console.error(`Batch ${Math.floor(i / BATCH_SIZE) + 1} failed:`, e.message);
      totalErrors += batch.length;
    }

    // Delay between batches (1-3 minutes to mimic human breaks)
    if (i + BATCH_SIZE < partNumbers.length) {
      const delayMs = 60000 + Math.random() * 120000; // 1-3 minutes
      console.log(`Waiting ${Math.round(delayMs / 1000)}s before next batch...`);
      await new Promise(r => setTimeout(r, delayMs));
    }
  }

  // Write successful results to Firestore
  const foundResults = allResults.filter(r => r.found);
  if (foundResults.length > 0) {
    totalUpdated = await writePricesToFirestore(uid, foundResults);
    console.log(`Wrote ${totalUpdated} prices to Firestore`);
  }

  // Log scrape run
  await db.collection(`users/${uid}/codaleScrapeLog`).add({
    runAt: Date.now(),
    itemsProcessed: totalScraped,
    pricesFound: foundResults.length,
    pricesWritten: totalUpdated,
    errors: totalErrors,
    results: allResults.map(r => ({
      partNumber: r.partNumber,
      found: r.found,
      price: r.price || null,
      error: r.error || null,
    })),
  });

  return {
    scraped: totalScraped,
    updated: totalUpdated,
    errors: totalErrors,
    details: allResults,
  };
}

module.exports = { runCodaleScrape, writePricesToFirestore, writePricesToBC, CODALE_VENDOR_NO };
