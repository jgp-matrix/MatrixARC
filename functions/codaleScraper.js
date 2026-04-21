/**
 * Codale Electric Supply Price Scraper
 *
 * Uses Puppeteer with login to get customer-specific pricing.
 * Public prices differ from logged-in prices (customer discount).
 *
 * Codale page structure (confirmed from screenshot):
 * - Search URL: /product/productSearch?searchString={partNumber}
 * - Product cards contain:
 *   - Product name link: "Allen-Bradley 25B-D4P0N114 Powerflex 525 15 kW 2 Hp AC Drive"
 *   - Manufacturer: "Allen Bradley / Rockwell"
 *   - Catalog #: 25B-D4P0N114
 *   - Codale Part #: 3497625
 *   - Availability: "6 available for delivery" + "15 available at Salt Lake City"
 *   - Price: "$1,129.53 /ea" (large text, customer-specific when logged in)
 *   - Qty input + ADD TO CART / BUY NOW buttons
 */

const puppeteer = require("puppeteer-core");
const chromium = require("@sparticuz/chromium");

const CODALE_URL = "https://www.codale.com";
const LOGIN_URL = `${CODALE_URL}/account/login`;
const SEARCH_URL = `${CODALE_URL}/product/productSearch`;

// Human-like delay helpers
function randomDelay(minMs, maxMs) {
  return new Promise(r => setTimeout(r, minMs + Math.random() * (maxMs - minMs)));
}

/**
 * Launch headless Chromium configured for Cloud Functions
 */
async function launchBrowser() {
  const executablePath = await chromium.executablePath();
  return puppeteer.launch({
    args: [...chromium.args, "--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
    defaultViewport: { width: 1366, height: 768 },
    executablePath,
    headless: chromium.headless,
  });
}

/**
 * Log into Codale with provided credentials
 * Confirmed form fields: input[name="username"] (text), input[name="password"]
 * Cookie consent buttons: #btn-accept-all, #btn-reject-all
 */
async function login(page, username, password) {
  await page.goto(LOGIN_URL, { waitUntil: "networkidle0", timeout: 45000 });
  await randomDelay(2000, 4000);

  // Dismiss cookie consent banner first (it may overlay the form)
  try {
    await page.waitForSelector("#btn-reject-all", { timeout: 5000 });
    await page.click("#btn-reject-all");
    await randomDelay(1000, 2000);
    console.log("Cookie banner dismissed");
  } catch (e) { console.log("No cookie banner found"); }

  // Wait for login form to be present in DOM
  try {
    await page.waitForSelector('#UserName', { timeout: 15000 });
  } catch (e) {
    // Log what's on the page for debugging
    const inputs = await page.evaluate(() =>
      Array.from(document.querySelectorAll("input")).map(el => ({
        type: el.type, name: el.name, id: el.id, placeholder: el.placeholder, className: el.className
      }))
    );
    console.error("Login form not found. Inputs on page:", JSON.stringify(inputs));
    throw new Error("Login form not found — inputs on page: " + JSON.stringify(inputs));
  }

  await randomDelay(500, 1000);

  // Fill username — use #UserName (the one with id) to target the correct form
  await page.evaluate((u) => {
    const el = document.querySelector('#UserName') || document.querySelector('input[name="UserName"]');
    if (el) { el.value = u; el.dispatchEvent(new Event("input", { bubbles: true })); el.dispatchEvent(new Event("change", { bubbles: true })); }
  }, username);

  await randomDelay(400, 800);

  // Fill password — use #Password
  await page.evaluate((p) => {
    const el = document.querySelector('#Password') || document.querySelector('input[name="Password"]');
    if (el) { el.value = p; el.dispatchEvent(new Event("input", { bubbles: true })); el.dispatchEvent(new Event("change", { bubbles: true })); }
  }, password);

  await randomDelay(500, 1000);

  // Submit — the form has a submit button with class "btn btn-primary btn-lg"
  const submitted = await page.evaluate(() => {
    // Find the login form (has action="/account/login")
    const form = document.querySelector('form[action*="login"]');
    if (form) {
      const btn = form.querySelector('input[type="submit"], button[type="submit"]');
      if (btn) { btn.click(); return "button"; }
      form.submit(); return "form";
    }
    const btn = document.querySelector('#btn-login') || document.querySelector('button[type="submit"]') || document.querySelector('input[type="submit"]');
    if (btn) { btn.click(); return "button"; }
    return null;
  });
  if (!submitted) {
    await page.keyboard.press("Enter");
    console.log("Submitted via Enter key");
  } else {
    console.log("Submitted via " + submitted);
  }

  // Wait for navigation after login
  await page.waitForNavigation({ waitUntil: "networkidle2", timeout: 30000 }).catch(() => {});
  await randomDelay(2000, 4000);

  // Verify login — look for "WELCOME" or "LOG OFF" in page text
  const pageText = await page.evaluate(() => document.body.innerText || "");
  const loggedIn = /welcome|log\s*off|sign\s*out|my\s*account/i.test(pageText);
  if (!loggedIn) {
    const hasError = /invalid|incorrect|failed/i.test(pageText);
    if (hasError) throw new Error("Login failed: invalid credentials");
    console.log("Login status uncertain — proceeding");
  } else {
    console.log("Codale login verified");
  }

  return true;
}

/**
 * Extract price data from a Codale search results page.
 * Simplified approach: scan entire page text for price patterns.
 * Codale search pages typically show one product with "$XX.XX /ea" pricing.
 */
async function extractFromPage(page, partNumber) {
  return page.evaluate((pn) => {
    const result = { partNumber: pn, found: false, price: null, availability: null, uom: "EA", productName: null, codalePartNo: null };
    const body = document.body.innerText || "";
    const pnNorm = pn.replace(/[\s\-\.]/g, "").toUpperCase();

    // Check for no results
    if (/0\s*Products?\s*found|no\s*results|did not match/i.test(body)) {
      result.error = "No results found";
      return result;
    }

    // Strategy 1: Find "Catalog #:" lines and EXACT match against our part number.
    // Codale shows "Catalog #: 800H-JP2KB7AXXX" — we must match exactly, not substring.
    // e.g. searching "800H-JP2KB7AXXX" should NOT match "800HL-JP2KB7AXXX".
    const lines = body.split("\n").map(l => l.trim()).filter(Boolean);
    const catalogLines = [];
    for (let i = 0; i < lines.length; i++) {
      const catMatch = lines[i].match(/Catalog\s*#[:\s]*(.+)/i);
      if (catMatch) {
        const catalogPN = catMatch[1].trim();
        const catalogNorm = catalogPN.replace(/[\s\-\.]/g, "").toUpperCase();
        catalogLines.push({ idx: i, catalogPN, catalogNorm, exact: catalogNorm === pnNorm });
      }
    }

    // Find EXACT catalog match first, then try substring as fallback
    let matchedCatalogIdx = -1;
    const exactCat = catalogLines.find(c => c.exact);
    if (exactCat) {
      matchedCatalogIdx = exactCat.idx;
    } else if (catalogLines.length === 1 && catalogLines[0].catalogNorm.includes(pnNorm)) {
      // Only one catalog entry and it contains our PN — probably close enough
      matchedCatalogIdx = catalogLines[0].idx;
    }

    if (matchedCatalogIdx >= 0) {
      // Found the exact product — look for price within 40 lines
      for (let j = matchedCatalogIdx; j < Math.min(lines.length, matchedCatalogIdx + 40); j++) {
        const pm = lines[j].match(/\$([\d,]+\.\d{2})\s*\/?\s*(ea|ft|each|m|rl|pk|c)?/i);
        if (pm) {
          const p = parseFloat(pm[1].replace(/,/g, ""));
          if (p >= 0.01 && p <= 50000) {
            result.price = p;
            result.uom = (pm[2] || "EA").toUpperCase();
            result.found = true;
            break;
          }
        }
      }
      // Also look backwards (price might be above catalog line in some layouts)
      if (!result.found) {
        for (let j = matchedCatalogIdx; j >= Math.max(0, matchedCatalogIdx - 20); j--) {
          const pm = lines[j].match(/\$([\d,]+\.\d{2})\s*\/?\s*(ea|ft|each|m|rl|pk|c)?/i);
          if (pm) {
            const p = parseFloat(pm[1].replace(/,/g, ""));
            if (p >= 0.01 && p <= 50000) {
              result.price = p;
              result.uom = (pm[2] || "EA").toUpperCase();
              result.found = true;
              break;
            }
          }
        }
      }
    }

    // Strategy 2: DOM-based — find smallest element with EXACT catalog match + price
    if (!result.found) {
      const allElements = document.querySelectorAll('*');
      const productSections = [];
      for (const el of allElements) {
        const text = el.innerText || "";
        if (text.length > 2000) continue;
        // Look for "Catalog #: <exact PN>" within this element
        const catRx = new RegExp("Catalog\\s*#[:\\s]*" + pn.replace(/[-\\\/\.]/g, "[\\-\\.\\s]?"), "i");
        if (catRx.test(text)) {
          const priceMatch = text.match(/\$([\d,]+\.\d{2})\s*\/?\s*(ea|ft|each|m|rl|pk|c)?/i);
          if (priceMatch) {
            const price = parseFloat(priceMatch[1].replace(/,/g, ""));
            if (price >= 0.01 && price <= 50000) {
              productSections.push({ el, price, uom: (priceMatch[2] || "EA").toUpperCase(), textLen: text.length });
            }
          }
        }
      }
      if (productSections.length > 0) {
        productSections.sort((a, b) => a.textLen - b.textLen);
        const best = productSections[0];
        result.price = best.price;
        result.uom = best.uom;
        result.found = true;
      }
    }

    // Strategy 3: Single product on page — safe to take the price
    if (!result.found) {
      const countMatch = body.match(/(\d+)\s*Products?\s*found/i);
      const productCount = countMatch ? parseInt(countMatch[1]) : 0;
      if (productCount === 1) {
        const priceMatches = [...body.matchAll(/\$([\d,]+\.\d{2})\s*\/?\s*(ea|ft|each|m|rl|pk|c)?/gi)];
        const validPrices = priceMatches
          .map(m => ({ price: parseFloat(m[1].replace(/,/g, "")), uom: (m[2] || "EA").toUpperCase() }))
          .filter(p => p.price >= 0.01 && p.price <= 50000);
        if (validPrices.length > 0) {
          result.price = validPrices[0].price;
          result.uom = validPrices[0].uom;
          result.found = true;
        }
      }
    }

    // Extract availability
    if (!result.availability) {
      const availMatches = [...body.matchAll(/(\d+)\s*available\s*(for delivery|at [A-Za-z\s]+)?/gi)];
      if (availMatches.length) result.availability = availMatches.map(m => m[0].trim()).join("; ");
    }

    // Extract product name
    const lines2 = body.split("\n").map(l => l.trim()).filter(Boolean);
    for (const line of lines2) {
      if (line.length > 15 && line.length < 200 && line.replace(/[\s\-\.]/g, "").toUpperCase().includes(pnNorm) && !/catalog|codale|manufacturer|search/i.test(line)) {
        result.productName = line.slice(0, 200);
        break;
      }
    }

    // Extract Codale Part #
    if (!result.codalePartNo) {
      const codaleMatch = body.match(/Codale\s*Part\s*#[:\s]*(\d+)/i);
      if (codaleMatch) result.codalePartNo = codaleMatch[1];
    }

    if (!result.found) {
      result.error = "Price not found";
      result.debug = body.slice(0, 800);
    }
    return result;
  }, partNumber);
}

/**
 * Search for a single part number on a logged-in page
 */
async function searchPart(page, partNumber) {
  try {
    const searchUrl = `${SEARCH_URL}?searchString=${encodeURIComponent(partNumber)}`;
    await page.goto(searchUrl, { waitUntil: "networkidle2", timeout: 30000 });
    await randomDelay(2000, 4000);
    return extractFromPage(page, partNumber);
  } catch (e) {
    return { partNumber, found: false, error: e.message };
  }
}

/**
 * Scrape prices for a batch of part numbers
 * Logs in first, then searches each part with human-like delays
 */
async function scrapeBatch(partNumbers, username, password) {
  let browser;
  const results = [];

  try {
    browser = await launchBrowser();
    const page = await browser.newPage();

    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
    );

    // DECISION(v1.19.590): Harden against third-party JS that breaks on push/notification APIs in headless Chrome.
    page.on('pageerror', err => console.warn('[codaleScrape] page JS error (swallowed):', String(err && err.message || err).slice(0, 200)));
    await page.evaluateOnNewDocument(() => {
      try {
        if (typeof PushManager !== 'undefined' && PushManager.prototype) {
          PushManager.prototype.subscribe = function() { return Promise.reject(new Error('push disabled in headless scraper')); };
          PushManager.prototype.getSubscription = function() { return Promise.resolve(null); };
        }
        if (typeof Notification !== 'undefined') {
          try { Object.defineProperty(Notification, 'permission', { get: () => 'denied', configurable: true }); } catch(_) {}
          try { Notification.requestPermission = () => Promise.resolve('denied'); } catch(_) {}
        }
      } catch (e) {}
    });

    // Login for customer-specific pricing
    await login(page, username, password);

    // Search each part
    for (let i = 0; i < partNumbers.length; i++) {
      const pn = partNumbers[i];
      console.log(`Searching part ${i + 1}/${partNumbers.length}: ${pn}`);

      const result = await searchPart(page, pn);
      results.push(result);

      if (result.found) {
        console.log(`  → $${result.price}/${result.uom} | ${result.availability || "n/a"}`);
      } else {
        console.log(`  → Not found: ${result.error}`);
      }

      // Human-like delay between searches
      if (i < partNumbers.length - 1) {
        await randomDelay(3000, 8000);
      }
    }
  } catch (e) {
    console.error("Scrape batch error:", e.message);
    throw e;
  } finally {
    if (browser) await browser.close().catch(() => {});
  }

  return results;
}

module.exports = { scrapeBatch, launchBrowser, login, searchPart, extractFromPage };
