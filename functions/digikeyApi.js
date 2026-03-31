/**
 * DigiKey Product Information V4 API Integration
 * Uses 2-legged OAuth (client_credentials) for server-to-server access.
 *
 * Sandbox: https://sandbox-api.digikey.com
 * Production: https://api.digikey.com
 */

const DIGIKEY_BASE = "https://api.digikey.com";
const TOKEN_URL = `${DIGIKEY_BASE}/v1/oauth2/token`;
const DETAILS_BASE = `${DIGIKEY_BASE}/products/v4/search`;

let _cachedToken = null;
let _tokenExpiry = 0;

/**
 * Get OAuth2 access token via client_credentials flow.
 * Caches token until 60s before expiry.
 */
async function getDigikeyToken(clientId, clientSecret) {
  const now = Date.now();
  if (_cachedToken && now < _tokenExpiry) return _cachedToken;

  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: clientId,
    client_secret: clientSecret,
  });

  const r = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!r.ok) {
    const txt = await r.text();
    throw new Error(`DigiKey token error ${r.status}: ${txt}`);
  }

  const data = await r.json();
  console.log("DigiKey token response keys:", Object.keys(data));
  _cachedToken = data.access_token;
  _tokenExpiry = now + ((data.expires_in || 3600) - 60) * 1000;
  return _cachedToken;
}

/**
 * Normalize manufacturer name for fuzzy comparison
 * Strips common suffixes, punctuation, case
 */
function normMfr(s) {
  if (!s) return "";
  return s.toLowerCase()
    .replace(/\b(inc|llc|ltd|corp|co|gmbh|ag|sa|bv|nv|plc|pty|srl|s\.r\.l)\b\.?/g, "")
    .replace(/[^a-z0-9]/g, "")
    .trim();
}

/**
 * Returns true if mfrA and mfrB are a reasonable match
 */
function mfrMatches(mfrA, mfrB) {
  const a = normMfr(mfrA);
  const b = normMfr(mfrB);
  if (!a || !b) return true; // no info to compare — allow
  return a.includes(b) || b.includes(a);
}

/**
 * Search for a single part number via DigiKey productdetails endpoint.
 * @param {string} partNumber
 * @param {string} clientId
 * @param {string} clientSecret
 * @param {string|null} expectedManufacturer - Optional BC manufacturer name for validation
 * @returns {Object} { partNumber, found, price, availability, uom, manufacturer, digikeyPN, description, priceBreaks, error }
 */
async function digikeySearchPart(partNumber, clientId, clientSecret, expectedManufacturer = null) {
  const result = {
    partNumber,
    found: false,
    price: null,
    availability: null,
    uom: "EA",
    manufacturer: null,
    digikeyPN: null,
    description: null,
    priceBreaks: [],
    error: null,
  };

  try {
    const token = await getDigikeyToken(clientId, clientSecret);

    const url = `${DETAILS_BASE}/${encodeURIComponent(partNumber)}/productdetails`;
    const r = await fetch(url, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${token}`,
        "X-DIGIKEY-Client-Id": clientId,
        "X-DIGIKEY-Locale-Site": "US",
        "X-DIGIKEY-Locale-Language": "en",
        "X-DIGIKEY-Locale-Currency": "USD",
        "X-DIGIKEY-Customer-Id": "0",
        "Accept": "application/json",
      },
    });

    if (!r.ok) {
      const txt = await r.text();
      console.error(`DigiKey API ${r.status} for ${partNumber}:`, txt);
      result.error = `DigiKey API ${r.status}: ${txt.slice(0, 300)}`;
      return result;
    }

    const data = await r.json();
    const product = data?.Product;

    if (!product) {
      result.error = "No product found";
      return result;
    }

    result.manufacturer = product.Manufacturer?.Name || null;
    result.description = product.Description?.ProductDescription || null;

    // Get best variation
    const variations = product.ProductVariations || [];
    let bestVar = variations[0];
    for (const v of variations) {
      const name = v.PackageType?.Name || "";
      if (name.includes("Cut Tape") || name === "Bulk") { bestVar = v; break; }
    }

    if (bestVar) {
      result.digikeyPN = bestVar.DigiKeyProductNumber || null;
      result.availability = bestVar.QuantityAvailableforPackageType != null
        ? `${bestVar.QuantityAvailableforPackageType} available` : null;

      const pricing = bestVar.StandardPricing || [];
      result.priceBreaks = pricing.map(pb => ({
        quantity: pb.BreakQuantity || 1,
        price: pb.UnitPrice || 0,
      }));

      if (result.priceBreaks.length > 0) {
        const sorted = [...result.priceBreaks].sort((a, b) => a.quantity - b.quantity);
        result.price = sorted[0].price;
        result.found = result.price > 0;
      }
    }

    if (!result.found && product.UnitPrice > 0) {
      result.price = product.UnitPrice;
      result.found = true;
    }

    if (!result.found) {
      result.error = "No pricing available";
    }

    // Manufacturer validation — reject if expected mfr doesn't match DigiKey's mfr
    if (result.found && expectedManufacturer) {
      if (!result.manufacturer) {
        // DigiKey returned no manufacturer info — flag as unverified
        console.warn(`  → No manufacturer returned by DigiKey for ${partNumber}, expected "${expectedManufacturer}"`);
        result.mfrWarning = `DigiKey returned no manufacturer (expected "${expectedManufacturer}")`;
      } else if (!mfrMatches(expectedManufacturer, result.manufacturer)) {
        console.warn(`  → Mfr mismatch for ${partNumber}: expected "${expectedManufacturer}", got "${result.manufacturer}"`);
        result.found = false;
        result.price = null;
        result.error = `Manufacturer mismatch: expected "${expectedManufacturer}", DigiKey returned "${result.manufacturer}"`;
      }
    }
  } catch (e) {
    result.error = e.message;
  }

  return result;
}

/**
 * Search multiple parts via DigiKey API
 * @param {Array<{partNumber:string, manufacturer?:string}>} items
 * @param {string} clientId
 * @param {string} clientSecret
 * @returns {Object[]}
 */
async function digikeySearchBatch(items, clientId, clientSecret) {
  const results = [];
  for (let i = 0; i < items.length; i++) {
    const { partNumber: pn, manufacturer: mfr } = typeof items[i] === "string"
      ? { partNumber: items[i], manufacturer: null }
      : items[i];
    console.log(`DigiKey search ${i + 1}/${items.length}: ${pn}${mfr ? ` (${mfr})` : ""}`);
    const result = await digikeySearchPart(pn, clientId, clientSecret, mfr || null);
    results.push(result);
    if (result.found) {
      console.log(`  → $${result.price} | ${result.availability || "n/a"} | ${result.manufacturer || ""}`);
    } else {
      console.log(`  → Not found: ${result.error}`);
    }
    // Small delay between requests
    if (i < items.length - 1) {
      await new Promise(r => setTimeout(r, 500 + Math.random() * 500));
    }
  }
  return results;
}

module.exports = { digikeySearchPart, digikeySearchBatch, normMfr, mfrMatches };
