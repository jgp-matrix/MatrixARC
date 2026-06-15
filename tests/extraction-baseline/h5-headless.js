/**
 * H5 Headless Extraction Harness
 *
 * Renders BOM region to high-DPI JPEG tiles in Node.js (pdfjs-dist + node-canvas),
 * then calls the extractBomPage Cloud Function with tiledBomImages — the same CF
 * input path the browser H5 code uses (functions/index.js:2340).
 *
 * Usage:
 *   node tests/extraction-baseline/h5-headless.js
 *   node tests/extraction-baseline/h5-headless.js --project PRJ402101 --page 10
 *
 * Options:
 *   --project <bcProjectNumber>   Default: PRJ402119
 *   --page <1-based page number>  Default: 3 (PRJ402119's BOM page)
 *   --pad-floor <points>          Override H5_REGION_PAD_FLOOR_PTS (default: 14)
 *   --no-pad                      Disable #121 padding (baseline comparison)
 *   --save-tiles <dir>            Write tile JPEGs to disk for visual inspection
 *
 * Requires:
 *   - .secrets/matrix-arc-admin.json (Firebase service account)
 *   - npm packages: canvas, pdfjs-dist@4.4.168 (devDependencies in project root)
 *
 * Built by Coach (Sam Wize) for the #121 ship gate. C55 architecture.
 */
const path = require('path');
const fs = require('fs');
const https = require('https');
const { createCanvas } = require('canvas');

// pdfjs-dist 4.4.168 ships ESM-only — dynamic import() from CJS.
let pdfjsLib;

const admin = require(path.join(__dirname, '..', '..', 'functions', 'node_modules', 'firebase-admin'));

const keyPath = path.join(__dirname, '..', '..', '.secrets', 'matrix-arc-admin.json');
const serviceAccount = require(keyPath);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  storageBucket: `${serviceAccount.project_id}.firebasestorage.app`,
});
const db = admin.firestore();
const bucket = admin.storage().bucket();

// ─── H5 constants (mirrored from src/app.jsx) ───
const MODEL_MAX_PX = 2576;           // Opus 4.8 long-edge ceiling
const H5_TILE_TARGET_DPI = 600;
const H5_TILE_MAX_COUNT = 6;
const H5_TILE_OVERLAP_FRAC = 0.05;
const H5_REGION_PAD_FRAC = 0.02;     // #121 proportional ceiling
let   H5_REGION_PAD_FLOOR_PTS = 14;  // #121 absolute floor (overridable via --pad-floor)

// ─── Known projects (extend as needed) ───
const KNOWN_PROJECTS = {
  PRJ402119: {
    docPath: 'companies/XODxZ8xJc0dQXGZI7jbo/projects/YzzLdpyzX9jAkJZGhiUR',
    pdfStorage: 'originalPdfs/9q1xr8G24gadh5z66sTfcINqp2O2/YzzLdpyzX9jAkJZGhiUR/1780520222267_xmhnu5_RSW1596-126.pdf',
    defaultBomPage: 3,
  },
  PRJ402101: {
    docPath: 'companies/XODxZ8xJc0dQXGZI7jbo/projects/z1QmSG8BE7oTBo6PFr6a',
    pdfStorage: 'originalPdfs/9q1xr8G24gadh5z66sTfcINqp2O2/z1QmSG8BE7oTBo6PFr6a/1779312432826_upfjfs_CSW1927-121.dwg.pdf',
    defaultBomPage: 10,
  },
};

// ─── CLI args ───
const args = process.argv.slice(2);
function getArg(name, defaultVal) {
  const idx = args.indexOf('--' + name);
  if (idx >= 0 && idx + 1 < args.length) return args[idx + 1];
  return defaultVal;
}
const noPad = args.includes('--no-pad');
const projectKey = getArg('project', 'PRJ402119');
const pageOverride = getArg('page', null);
const padFloorOverride = getArg('pad-floor', null);
const saveTilesDir = getArg('save-tiles', null);

if (padFloorOverride != null) H5_REGION_PAD_FLOOR_PTS = Number(padFloorOverride);

// ─── Pure math (ported from app.jsx) ───

function findOptimalGrid(regionWInches, regionHInches) {
  let best = { nx: 1, ny: 1, dpi: MODEL_MAX_PX / Math.max(regionWInches, regionHInches) };
  for (let nx = 1; nx <= 4; nx++) {
    for (let ny = 1; ny <= 4; ny++) {
      if (nx * ny > H5_TILE_MAX_COUNT) continue;
      const tileW = regionWInches / nx, tileH = regionHInches / ny;
      const dpi = MODEL_MAX_PX / Math.max(tileW, tileH);
      if (dpi > best.dpi) best = { nx, ny, dpi };
      if (best.dpi >= H5_TILE_TARGET_DPI) return best;
    }
  }
  return best;
}

function resolveBomRegion(pg) {
  const userRegions = (pg.regions || []).filter(r => r.type === 'bom');
  if (userRegions.length) {
    const r = userRegions[0];
    return { x: r.x, y: r.y, w: r.w, h: r.h, source: 'user' };
  }
  if (pg.bomRegionCleared) return null;
  if (pg.aiBomRegion) return { ...pg.aiBomRegion, source: 'ai' };
  return null;
}

function padRegion(bomRegion, pageWidthPts, pageHeightPts) {
  if (noPad) return { ...bomRegion };
  const floorFracX = H5_REGION_PAD_FLOOR_PTS / pageWidthPts;
  const floorFracY = H5_REGION_PAD_FLOOR_PTS / pageHeightPts;
  const padX = Math.max(bomRegion.w * H5_REGION_PAD_FRAC, floorFracX);
  const padY = Math.max(bomRegion.h * H5_REGION_PAD_FRAC, floorFracY);
  const rx = Math.max(0, bomRegion.x - padX);
  const ry = Math.max(0, bomRegion.y - padY);
  return {
    x: rx, y: ry,
    w: Math.min(1, bomRegion.x + bomRegion.w + padX) - rx,
    h: Math.min(1, bomRegion.y + bomRegion.h + padY) - ry,
  };
}

// ─── PDF download via admin Storage ───

async function downloadPdf(storagePath) {
  const [buf] = await bucket.file(storagePath).download();
  if (!buf.length) throw new Error('PDF is 0 bytes at ' + storagePath);
  return buf;
}

// ─── Tile renderer (node-canvas port of renderBomRegionHighDpi) ───

async function renderTiles(pdfBuf, pageNumber, bomRegion) {
  const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(pdfBuf) }).promise;
  try {
    if (pageNumber > pdf.numPages) throw new Error(`page ${pageNumber} > ${pdf.numPages}`);
    const pg = await pdf.getPage(pageNumber);
    const baseVp = pg.getViewport({ scale: 1 }); // PDF points

    // #121 padding
    const region = padRegion(bomRegion, baseVp.width, baseVp.height);
    const regionWIn = region.w * baseVp.width / 72;
    const regionHIn = region.h * baseVp.height / 72;

    if (regionWIn <= 0.1 || regionHIn <= 0.1) throw new Error('degenerate BOM region');

    const grid = findOptimalGrid(regionWIn, regionHIn);
    const ovWIn = grid.nx > 1 ? (regionWIn / grid.nx) * H5_TILE_OVERLAP_FRAC : 0;
    const ovHIn = grid.ny > 1 ? (regionHIn / grid.ny) * H5_TILE_OVERLAP_FRAC : 0;
    const tileWIn = regionWIn / grid.nx + 2 * ovWIn;
    const tileHIn = regionHIn / grid.ny + 2 * ovHIn;
    const renderDpi = MODEL_MAX_PX / Math.max(tileWIn, tileHIn);

    const vp = pg.getViewport({ scale: renderDpi / 72 });
    const rX = region.x * vp.width, rY = region.y * vp.height;
    const rW = region.w * vp.width, rH = region.h * vp.height;
    const ovWpx = ovWIn * renderDpi, ovHpx = ovHIn * renderDpi;

    const tiles = [];
    for (let j = 0; j < grid.ny; j++) {
      for (let i = 0; i < grid.nx; i++) {
        const x0 = rX + (i / grid.nx) * rW - (i > 0 ? ovWpx : 0);
        const x1 = rX + ((i + 1) / grid.nx) * rW + (i < grid.nx - 1 ? ovWpx : 0);
        const y0 = rY + (j / grid.ny) * rH - (j > 0 ? ovHpx : 0);
        const y1 = rY + ((j + 1) / grid.ny) * rH + (j < grid.ny - 1 ? ovHpx : 0);
        const cw = Math.round(x1 - x0), ch = Math.round(y1 - y0);
        if (cw < 10 || ch < 10) continue;

        const canvas = createCanvas(cw, ch);
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, cw, ch);

        await pg.render({
          canvasContext: ctx,
          viewport: vp,
          transform: [1, 0, 0, 1, -x0, -y0],
        }).promise;

        const jpegBuf = canvas.toBuffer('image/jpeg', { quality: 0.92 });
        tiles.push(jpegBuf.toString('base64'));

        if (saveTilesDir) {
          fs.mkdirSync(saveTilesDir, { recursive: true });
          fs.writeFileSync(path.join(saveTilesDir, `tile_${j}_${i}.jpg`), jpegBuf);
        }
      }
    }

    if (!tiles.length) throw new Error('rendered 0 tiles');

    // Print the [H5] DPI line matching browser format
    console.log(`[H5] rendered ${tiles.length} tile(s) ${grid.nx}×${grid.ny} @ ~${Math.round(renderDpi)} DPI — region ${regionWIn.toFixed(1)}"×${regionHIn.toFixed(1)}", model ceiling ${MODEL_MAX_PX}px`);
    console.log(`[H5] pad=${noPad ? 'OFF' : 'ON'} floor=${H5_REGION_PAD_FLOOR_PTS}pt`);
    console.log(`[H5] original region: x=${bomRegion.x.toFixed(4)} y=${bomRegion.y.toFixed(4)} w=${bomRegion.w.toFixed(4)} h=${bomRegion.h.toFixed(4)}`);
    console.log(`[H5] padded region:   x=${region.x.toFixed(4)} y=${region.y.toFixed(4)} w=${region.w.toFixed(4)} h=${region.h.toFixed(4)}`);
    const yGrowth = ((region.h - bomRegion.h) / bomRegion.h * 100).toFixed(1);
    const xGrowth = ((region.w - bomRegion.w) / bomRegion.w * 100).toFixed(1);
    console.log(`[H5] region growth: X +${xGrowth}%, Y +${yGrowth}%`);

    return { tiles, grid, renderDpi, region, bomRegion };
  } finally {
    pdf.destroy();
  }
}

// ─── CF caller (authenticated via service account custom token) ───

async function getIdToken(uid) {
  const customToken = await admin.auth().createCustomToken(uid);
  const apiKey = serviceAccount.project_id === 'matrix-arc'
    ? 'AIzaSyDAk-bcYLwjrihgOwsdboU70Y9q93-_9-M' // public Firebase web API key (from index.html:261)
    : null;
  if (!apiKey) throw new Error('Unknown project — add Firebase web API key for ' + serviceAccount.project_id);

  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      token: customToken,
      returnSecureToken: true,
    });
    const req = https.request({
      hostname: 'identitytoolkit.googleapis.com',
      path: `/v1/accounts:signInWithCustomToken?key=${apiKey}`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
    }, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.idToken) resolve(parsed.idToken);
          else reject(new Error('No idToken: ' + data.slice(0, 300)));
        } catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function callExtractBomPage(idToken, tiledBomImages, pageNumber) {
  const payload = JSON.stringify({
    data: {
      tiledBomImages,
      tiledBomMediaType: 'image/jpeg',
      pageNumber,
      feedback: '',
      userNotes: '',
    },
  });

  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'us-central1-matrix-arc.cloudfunctions.net',
      path: '/extractBomPage',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + idToken,
        'Content-Length': Buffer.byteLength(payload),
      },
    }, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.result) resolve(parsed.result);
          else if (parsed.error) reject(new Error('CF error: ' + JSON.stringify(parsed.error)));
          else reject(new Error('Unexpected CF response: ' + data.slice(0, 500)));
        } catch (e) { reject(new Error('CF parse error: ' + e.message + ' — raw: ' + data.slice(0, 500))); }
      });
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

// ─── Main ───

async function main() {
  pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');

  const projInfo = KNOWN_PROJECTS[projectKey];
  if (!projInfo) {
    console.error(`Unknown project ${projectKey}. Known: ${Object.keys(KNOWN_PROJECTS).join(', ')}`);
    process.exit(1);
  }

  const bomPageNum = pageOverride ? Number(pageOverride) : projInfo.defaultBomPage;
  console.log(`\n═══ H5 Headless Extraction: ${projectKey} page ${bomPageNum} ═══\n`);

  // 1. Load project from Firestore to get bomRegion
  console.log(`[SETUP] Loading project from Firestore: ${projInfo.docPath}`);
  const doc = await db.doc(projInfo.docPath).get();
  if (!doc.exists) { console.error('Project doc not found'); process.exit(1); }
  const project = doc.data();
  const panel = project.panels[0];
  const targetPage = panel.pages.find(p => p.pageNumber === bomPageNum);
  if (!targetPage) {
    console.error(`No page with pageNumber=${bomPageNum} in panel. Available:`,
      panel.pages.map(p => `${p.name}(pn=${p.pageNumber})`).join(', '));
    process.exit(1);
  }

  const bomRegion = resolveBomRegion(targetPage);
  if (!bomRegion) {
    console.error(`No BOM region on page ${bomPageNum} (no user region, no aiBomRegion)`);
    process.exit(1);
  }
  console.log(`[SETUP] BOM region (${bomRegion.source}): x=${bomRegion.x.toFixed(4)} y=${bomRegion.y.toFixed(4)} w=${bomRegion.w.toFixed(4)} h=${bomRegion.h.toFixed(4)}`);

  // 2. Download PDF
  console.log(`[SETUP] Downloading PDF: ${projInfo.pdfStorage}`);
  const pdfBuf = await downloadPdf(projInfo.pdfStorage);
  console.log(`[SETUP] PDF downloaded: ${(pdfBuf.length / 1024 / 1024).toFixed(1)} MB`);

  // 3. Render tiles
  console.log(`[RENDER] Rendering H5 tiles...`);
  const t0 = Date.now();
  const h5 = await renderTiles(pdfBuf, bomPageNum, bomRegion);
  const renderMs = Date.now() - t0;
  console.log(`[RENDER] Done in ${renderMs}ms — ${h5.tiles.length} tiles, total ${Math.round(h5.tiles.reduce((s, t) => s + t.length, 0) * 0.75 / 1024)} KB`);

  // 4. Authenticate and call CF
  const uid = '9q1xr8G24gadh5z66sTfcINqp2O2'; // Noah's UID (from storage path)
  console.log(`[CF] Authenticating as uid=${uid}...`);
  const idToken = await getIdToken(uid);
  console.log(`[CF] Got ID token (${idToken.length} chars)`);

  console.log(`[CF] Calling extractBomPage with ${h5.tiles.length} tiles...`);
  const cfT0 = Date.now();
  const result = await callExtractBomPage(idToken, h5.tiles, bomPageNum);
  const cfMs = Date.now() - cfT0;
  console.log(`[CF] Response in ${cfMs}ms — path=${result.extractionPath} model=${result.modelUsed || '?'} stop=${result.stopReason}`);

  // 5. Parse items
  const raw = result.raw || '';
  let items = [];
  try {
    const parsed = JSON.parse(raw);
    items = parsed.items || parsed || [];
  } catch {
    const jsonMatch = raw.match(/\{[\s\S]*"items"\s*:\s*\[[\s\S]*\]/);
    if (jsonMatch) {
      try { items = JSON.parse(jsonMatch[0] + '}').items || []; } catch { /* fall through */ }
    }
  }
  if (!Array.isArray(items)) items = [];

  // 6. Output results
  console.log(`\n═══ RESULTS ═══\n`);
  console.log(`Item count: ${items.length}`);
  console.log(`Extraction path: ${result.extractionPath}`);
  console.log(`Model: ${result.modelUsed || '?'}`);
  console.log(`Stop reason: ${result.stopReason}`);
  console.log(`Render DPI: ~${Math.round(h5.renderDpi)}`);
  console.log(`Grid: ${h5.grid.nx}×${h5.grid.ny} (${h5.tiles.length} tiles)`);
  console.log(`Pad: ${noPad ? 'OFF' : `ON (floor=${H5_REGION_PAD_FLOOR_PTS}pt)`}`);
  console.log('');

  if (items.length) {
    console.log('  # │ Qty   │ Part Number                │ Manufacturer             │ Notes');
    console.log('────┼───────┼────────────────────────────┼──────────────────────────┼──────');
    for (const row of items) {
      const num = String(row.itemNo || row.item || '').padStart(3);
      const qty = String(row.qty || '').padStart(5);
      const pn = (row.partNumber || row.catalog || '').padEnd(26).slice(0, 26);
      const mfr = (row.manufacturer || row.mfg || '').padEnd(24).slice(0, 24);
      const notes = (row.notes || row.catalogNotes || row.description || '').slice(0, 40);
      console.log(` ${num} │ ${qty} │ ${pn} │ ${mfr} │ ${notes}`);
    }
  }

  // Dump full raw JSON for detailed review
  console.log('\n─── RAW ITEMS JSON ───');
  console.log(JSON.stringify(items, null, 2));

  console.log(`\n═══ END ═══\n`);
  process.exit(0);
}

main().catch(err => {
  console.error('FATAL:', err);
  process.exit(1);
});
