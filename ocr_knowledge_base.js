#!/usr/bin/env node
/**
 * OCR document pages and upload to Firestore knowledge base.
 *
 * Usage:
 *   node ocr_knowledge_base.js <anthropic_api_key> <company_id> [pages_dir] [source_name]
 *
 * Examples:
 *   node ocr_knowledge_base.js sk-ant-xxx COMPANY123
 *   node ocr_knowledge_base.js sk-ant-xxx COMPANY123 ul508a_pages UL508A
 *
 * Uses Firebase CLI stored credentials (run `firebase login` first).
 * To get company ID, run in browser console: console.log(_appCtx.companyId)
 */

const fs = require('fs');
const path = require('path');

const API_KEY = process.argv[2];
const COMPANY_ID = process.argv[3];
const PAGES_DIR = path.join(__dirname, process.argv[4] || 'ul508a_pages');
const SOURCE_NAME = process.argv[5] || 'UL508A';
const OUTPUT_FILE = path.join(__dirname, `${path.basename(PAGES_DIR)}_text.json`);
const FIRESTORE_PROJECT = 'matrix-arc';

if (!API_KEY || !COMPANY_ID) {
  console.log('Usage: node ocr_knowledge_base.js <anthropic_api_key> <company_id> [pages_dir] [source_name]');
  console.log('');
  console.log('Defaults: pages_dir=ul508a_pages, source_name=UL508A');
  console.log('To get company ID, run in browser console: console.log(_appCtx.companyId)');
  process.exit(1);
}

// Get access token from Firebase CLI stored credentials
async function getFirebaseAccessToken() {
  const cfgPath = path.join(process.env.HOME || process.env.USERPROFILE, '.config', 'configstore', 'firebase-tools.json');
  if (!fs.existsSync(cfgPath)) {
    throw new Error('Firebase CLI config not found. Run: firebase login');
  }
  const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
  const refreshToken = cfg.tokens?.refresh_token;
  if (!refreshToken) throw new Error('No refresh token in Firebase CLI config. Run: firebase login');

  // Exchange refresh token for access token
  const resp = await fetch('https://securetoken.googleapis.com/v1/token?key=AIzaSyDummyKey', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=refresh_token&refresh_token=${encodeURIComponent(refreshToken)}`
  });

  // Use Google OAuth2 token endpoint instead
  const resp2 = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: '563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com',
      client_secret: 'j9iVZfS8kkCEFUPaAeJV0sAi'
    }).toString()
  });

  if (!resp2.ok) {
    const err = await resp2.text();
    throw new Error(`Token refresh failed: ${err}`);
  }

  const data = await resp2.json();
  return data.access_token;
}

async function ocrPage(pageNum, imageBase64) {
  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': API_KEY,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 4000,
      messages: [{
        role: 'user',
        content: [
          {
            type: 'image',
            source: { type: 'base64', media_type: 'image/png', data: imageBase64 }
          },
          {
            type: 'text',
            text: `Extract ALL text from this page of the ${SOURCE_NAME} standard. Preserve section numbers, headings, table structures, and footnotes. Return the raw text content only, no commentary.`
          }
        ]
      }]
    })
  });

  if (!resp.ok) {
    const err = await resp.text();
    // Content filtering or rate limit — don't crash, return placeholder
    if (resp.status === 400 && err.includes('content filtering')) {
      console.log(` [BLOCKED by content filter - skipping]`);
      return '[Page content blocked by content filter]';
    }
    if (resp.status === 429) {
      // Rate limited — wait and retry once
      console.log(` [rate limited — waiting 30s]`);
      await new Promise(r => setTimeout(r, 30000));
      return ocrPage(pageNum, imageBase64);
    }
    throw new Error(`API error ${resp.status}: ${err}`);
  }

  const data = await resp.json();
  return data.content?.[0]?.text || '';
}

async function uploadToFirestore(accessToken, docId, payload) {
  const url = `https://firestore.googleapis.com/v1/projects/${FIRESTORE_PROJECT}/databases/(default)/documents/companies/${COMPANY_ID}/knowledgeBase/${docId}`;

  const fields = {};
  for (const [k, v] of Object.entries(payload)) {
    if (typeof v === 'string') fields[k] = { stringValue: v };
    else if (typeof v === 'number') fields[k] = { integerValue: String(v) };
  }

  const resp = await fetch(url, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`
    },
    body: JSON.stringify({ fields })
  });

  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`Firestore error ${resp.status}: ${err}`);
  }

  console.log(`  ✓ Uploaded ${docId} to Firestore`);
}

async function main() {
  // Get Firebase access token
  console.log('Authenticating with Firebase...');
  const accessToken = await getFirebaseAccessToken();
  console.log('✓ Got access token');

  // Verify Firestore connection
  console.log('Testing Firestore connection...');
  const testUrl = `https://firestore.googleapis.com/v1/projects/${FIRESTORE_PROJECT}/databases/(default)/documents/companies/${COMPANY_ID}`;
  const testResp = await fetch(testUrl, {
    headers: { 'Authorization': `Bearer ${accessToken}` }
  });
  if (!testResp.ok) {
    console.error(`Company ${COMPANY_ID} not found or access denied. Status: ${testResp.status}`);
    process.exit(1);
  }
  const testData = await testResp.json();
  const companyName = testData.fields?.name?.stringValue || COMPANY_ID;
  console.log(`✓ Connected — company: ${companyName}`);

  // Get all page files
  if (!fs.existsSync(PAGES_DIR)) {
    console.error(`Pages directory not found: ${PAGES_DIR}`);
    process.exit(1);
  }

  const files = fs.readdirSync(PAGES_DIR)
    .filter(f => f.match(/^page_\d+\.png$/))
    .sort((a, b) => {
      const na = parseInt(a.match(/\d+/)[0]);
      const nb = parseInt(b.match(/\d+/)[0]);
      return na - nb;
    });

  console.log(`Found ${files.length} pages to OCR`);

  // Check for cached OCR results
  let pages = [];
  if (fs.existsSync(OUTPUT_FILE)) {
    pages = JSON.parse(fs.readFileSync(OUTPUT_FILE, 'utf8'));
    console.log(`Loaded ${pages.length} cached OCR results from ${OUTPUT_FILE}`);
  }

  // OCR remaining pages
  const startFrom = pages.length;
  const BATCH_SIZE = 5; // concurrent requests

  for (let i = startFrom; i < files.length; i += BATCH_SIZE) {
    const batch = files.slice(i, Math.min(i + BATCH_SIZE, files.length));
    const promises = batch.map(async (file) => {
      const pageNum = parseInt(file.match(/\d+/)[0]);
      const imgPath = path.join(PAGES_DIR, file);
      const imageBase64 = fs.readFileSync(imgPath).toString('base64');

      process.stdout.write(`  OCR page ${pageNum}/${files.length}...`);
      const text = await ocrPage(pageNum, imageBase64);
      console.log(` ${text.length} chars`);

      return { page: pageNum, text, file };
    });

    const results = await Promise.all(promises);
    pages.push(...results.sort((a, b) => a.page - b.page));

    // Save progress after each batch
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(pages, null, 2));
    console.log(`  Saved progress: ${pages.length}/${files.length} pages`);
  }

  console.log(`\nOCR complete: ${pages.length} pages, total ${pages.reduce((s, p) => s + p.text.length, 0)} chars`);

  // Upload to Firestore in chunks of 40 pages per doc
  const CHUNK_SIZE = 40;
  const chunks = [];
  for (let i = 0; i < pages.length; i += CHUNK_SIZE) {
    chunks.push(pages.slice(i, i + CHUNK_SIZE));
  }

  console.log(`\nUploading ${chunks.length} chunks to Firestore...`);

  // Refresh token before upload in case OCR took a while
  const uploadToken = await getFirebaseAccessToken();

  const sourceKey = SOURCE_NAME.toLowerCase().replace(/[^a-z0-9]/g, '');
  for (let c = 0; c < chunks.length; c++) {
    const chunk = chunks[c];
    const pageStart = chunk[0].page;
    const pageEnd = chunk[chunk.length - 1].page;
    const docId = `${sourceKey}_pages_${String(pageStart).padStart(3, '0')}_${String(pageEnd).padStart(3, '0')}`;

    const content = chunk.map(p => `--- PAGE ${p.page} ---\n${p.text}`).join('\n\n');

    console.log(`  Chunk ${c + 1}/${chunks.length}: pages ${pageStart}-${pageEnd} (${content.length} chars)`);

    await uploadToFirestore(uploadToken, docId, {
      title: `${SOURCE_NAME} Standard — Pages ${pageStart}-${pageEnd}`,
      source: SOURCE_NAME,
      createdAt: Date.now(),
      pageStart,
      pageEnd,
      content
    });
  }

  console.log(`\n✓ All done! ${SOURCE_NAME} knowledge base uploaded to Firestore.`);
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
