/**
 * Mouser Electronics API Integration
 * Uses the official Mouser Search API (v1) for part pricing and availability.
 *
 * API: POST https://api.mouser.com/api/v1/search/partnumber?apiKey={key}
 * Docs: https://api.mouser.com/api/docs/ui/index
 */

const MOUSER_API_BASE = "https://api.mouser.com/api/v1";

/** Normalize manufacturer name for fuzzy comparison */
function normMfr(s) {
  if (!s) return "";
  return s.toLowerCase()
    .replace(/\b(inc|llc|ltd|corp|co|gmbh|ag|sa|bv|nv|plc|pty|srl|s\.r\.l)\b\.?/g, "")
    .replace(/[^a-z0-9]/g, "")
    .trim();
}

/** Returns true if mfrA and mfrB are a reasonable match */
function mfrMatches(mfrA, mfrB) {
  const a = normMfr(mfrA);
  const b = normMfr(mfrB);
  if (!a || !b) return true;
  return a.includes(b) || b.includes(a);
}

/**
 * Search for a single part number via Mouser API
 * @param {string} partNumber - Part number to search
 * @param {string} apiKey - Mouser API key
 * @param {string|null} expectedManufacturer - Optional manufacturer for MFR validation
 * @returns {Object} { partNumber, found, price, availability, uom, manufacturer, mouserPN, priceBreaks, leadTime, factoryStock }
 */
async function mouserSearchPart(partNumber, apiKey, expectedManufacturer = null) {
  const result = {
    partNumber,
    found: false,
    price: null,
    availability: null,
    uom: "EA",
    manufacturer: null,
    mouserPN: null,
    description: null,
    priceBreaks: [],
    leadTime: null,
    factoryStock: null,
    dataSheetUrl: null,
  };

  try {
    const url = `${MOUSER_API_BASE}/search/partnumber?apiKey=${encodeURIComponent(apiKey)}`;
    const r = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
      },
      body: JSON.stringify({
        SearchByPartRequest: {
          mouserPartNumber: partNumber,
          partSearchOptions: "Exact",
        },
      }),
    });

    if (!r.ok) {
      result.error = `Mouser API returned ${r.status}`;
      return result;
    }

    const data = await r.json();
    const parts = data?.SearchResults?.Parts || [];

    if (!parts.length) {
      result.error = "No results found";
      return result;
    }

    // Find best match — prefer exact part number match
    const pnNorm = partNumber.replace(/[\s\-\.]/g, "").toUpperCase();
    let bestPart = parts[0];
    for (const part of parts) {
      const mpn = (part.ManufacturerPartNumber || "").replace(/[\s\-\.]/g, "").toUpperCase();
      const mPN = (part.MouserPartNumber || "").replace(/[\s\-\.]/g, "").toUpperCase();
      if (mpn === pnNorm || mPN === pnNorm) {
        bestPart = part;
        break;
      }
    }

    // Extract data from best match
    result.mouserPN = bestPart.MouserPartNumber || null;
    result.manufacturer = bestPart.Manufacturer || null;
    result.description = (bestPart.Description || "").slice(0, 200);
    result.availability = bestPart.Availability || null;
    result.factoryStock = bestPart.FactoryStock || null;
    result.leadTime = bestPart.LeadTime || null;
    result.dataSheetUrl = bestPart.DataSheetUrl || null;

    // Extract price breaks
    const priceBreaks = bestPart.PriceBreaks || [];
    result.priceBreaks = priceBreaks.map(pb => ({
      quantity: pb.Quantity || 0,
      price: parseFloat((pb.Price || "0").replace(/[^0-9.]/g, "")) || 0,
      currency: pb.Currency || "USD",
    }));

    // Use the lowest quantity price break (qty=1 or first available)
    if (result.priceBreaks.length > 0) {
      const sorted = [...result.priceBreaks].sort((a, b) => a.quantity - b.quantity);
      result.price = sorted[0].price;
      result.found = result.price > 0;
    }

    if (!result.found) {
      result.error = "No pricing available";
    }

    // Manufacturer validation — reject if expected mfr doesn't match Mouser's mfr
    if (result.found && expectedManufacturer) {
      if (!result.manufacturer) {
        console.warn(`  → No manufacturer returned by Mouser for ${partNumber}, expected "${expectedManufacturer}"`);
        result.mfrWarning = `Mouser returned no manufacturer (expected "${expectedManufacturer}")`;
      } else if (!mfrMatches(expectedManufacturer, result.manufacturer)) {
        console.warn(`  → Mfr mismatch for ${partNumber}: expected "${expectedManufacturer}", got "${result.manufacturer}"`);
        result.found = false;
        result.price = null;
        result.error = `Manufacturer mismatch: expected "${expectedManufacturer}", Mouser returned "${result.manufacturer}"`;
      }
    }

  } catch (e) {
    result.error = e.message;
  }

  return result;
}

/**
 * Search multiple parts via Mouser API
 * Accepts either string[] or {partNumber, manufacturer}[] items
 * @param {Array<string|{partNumber:string,manufacturer?:string}>} items
 * @param {string} apiKey - Mouser API key
 * @returns {Object[]} Array of results
 */
async function mouserSearchBatch(items, apiKey) {
  const results = [];
  for (let i = 0; i < items.length; i++) {
    const { partNumber: pn, manufacturer: mfr } = typeof items[i] === "string"
      ? { partNumber: items[i], manufacturer: null }
      : items[i];
    console.log(`Mouser search ${i + 1}/${items.length}: ${pn}${mfr ? ` (${mfr})` : ""}`);
    const result = await mouserSearchPart(pn, apiKey, mfr || null);
    results.push(result);
    if (result.found) {
      console.log(`  → $${result.price} | ${result.availability || "n/a"} | ${result.manufacturer || ""}`);
    } else {
      console.log(`  → Not found: ${result.error}`);
    }
    // Small delay to respect rate limits (Mouser allows ~30 requests/min)
    if (i < items.length - 1) {
      await new Promise(r => setTimeout(r, 2000 + Math.random() * 1000));
    }
  }
  return results;
}

module.exports = { mouserSearchPart, mouserSearchBatch };
