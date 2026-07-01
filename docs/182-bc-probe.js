// #182 BC PROBE v2 — ItemVendorCatalog PATCH addressing
// Paste this ENTIRE script into the browser console while connected to BC.
// Safe: all PATCHes are no-ops (set Lead_Time_Calculation to its current value).
// Environment: sandbox (MATR_SndBx_01152026). No production writes.
//
// TOKEN ACQUISITION: Uses msal.PublicClientApplication.acquireTokenSilent with
// the BC resource scope — the same path ARC uses at src/app.jsx:1634-1640.
// Falls back to manual token entry if MSAL is unavailable.
//
// PREREQUISITE: BC must be connected (green "Connected to BC" indicator in the app).

(async function bcProbe182() {
  const R = []; // results collector
  const log = (msg, data) => { console.log(msg, data !== undefined ? data : ''); R.push({ msg, data }); };
  const fail = (msg, data) => { console.error(msg, data !== undefined ? data : ''); R.push({ msg, data, error: true }); };

  log('=== #182 BC PROBE v2 — ItemVendorCatalog PATCH addressing ===');
  log('Timestamp:', new Date().toISOString());

  // ── 0. Acquire BC token via MSAL acquireTokenSilent (same as ARC) ──
  // ARC config from src/app.jsx lines 337-339, 1595-1597, 1634
  const BC_TENANT = 'd1f2c7f7-fab2-40b5-85c1-06a715e6a157';
  const BC_CLIENT_ID = window.BC_CLIENT_ID || '75b9ff22-488d-4d4c-88ec-f803f7038716';
  const BC_SCOPES = ['https://api.businesscentral.dynamics.com/.default'];

  let token = null;

  // Option 2 (primary): call acquireTokenSilent via a fresh MSAL instance
  // sharing the same sessionStorage cache as ARC's instance
  if (window.msal && window.msal.PublicClientApplication) {
    log('MSAL library found — acquiring BC token via acquireTokenSilent...');
    try {
      const inst = new msal.PublicClientApplication({
        auth: {
          clientId: BC_CLIENT_ID,
          authority: `https://login.microsoftonline.com/${BC_TENANT}`,
          redirectUri: window.location.origin
        },
        cache: { cacheLocation: 'sessionStorage' }
      });
      await inst.initialize();
      const accounts = inst.getAllAccounts();
      log('MSAL accounts found:', accounts.length);
      if (accounts.length > 0) {
        log('Using account:', accounts[0].username);
        const resp = await inst.acquireTokenSilent({
          scopes: BC_SCOPES,
          account: accounts[0]
        });
        token = resp.accessToken;
        log('BC token acquired via acquireTokenSilent (first 20 chars):', token.slice(0, 20) + '...');
        // Verify the token audience
        try {
          const payload = JSON.parse(atob(token.split('.')[1]));
          log('Token audience (aud):', payload.aud);
          log('Token resource (appid):', payload.appid);
          log('Token expires:', new Date(payload.exp * 1000).toISOString());
          if (!payload.aud || !payload.aud.includes('businesscentral')) {
            fail('WARNING: Token audience does not contain "businesscentral" — may be wrong token');
          }
        } catch(e) { log('(could not decode token payload — non-fatal)'); }
      } else {
        fail('No MSAL accounts found. BC may not be connected.');
      }
    } catch(e) {
      fail('acquireTokenSilent failed:', e.message || String(e));
      log('Falling back to sessionStorage cache extraction...');
    }
  } else {
    log('window.msal not available — falling back to sessionStorage cache extraction');
  }

  // Fallback: extract from sessionStorage with BC-resource audience filter
  if (!token) {
    log('Attempting sessionStorage cache extraction (BC-resource filtered)...');
    for (const k of Object.keys(sessionStorage)) {
      // MSAL cache key format: {homeAccountId}-{env}-accesstoken-{clientId}-{realm}-{target}
      // BC tokens have "api.businesscentral.dynamics.com" in the target segment
      if (k.includes('accesstoken') && k.includes('businesscentral')) {
        try {
          const entry = JSON.parse(sessionStorage.getItem(k));
          if (entry && entry.secret) {
            token = entry.secret;
            log('Token found via cache key filter (businesscentral in key)');
            log('Cache key:', k);
            break;
          }
        } catch(e) {}
      }
    }
  }

  // Last resort: manual entry instructions
  if (!token) {
    fail('COULD NOT ACQUIRE BC TOKEN automatically.');
    log('MANUAL FALLBACK: Open DevTools Network tab → trigger any BC operation');
    log('(e.g. open a project with BC items) → find a request to');
    log('api.businesscentral.dynamics.com → copy the Authorization header value');
    log('(everything after "Bearer ") → re-run this script with:');
    log('  window._bcProbeToken = "eyJ0eXA...";');
    log('  // then paste this script again');
    if (window._bcProbeToken) {
      token = window._bcProbeToken;
      log('Using manually set window._bcProbeToken');
    } else {
      return;
    }
  }

  const base = window.BC_ODATA_BASE;
  const apiBase = window.BC_API_BASE;
  log('OData base:', base);
  log('API base:', apiBase);

  const hdrs = { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' };
  const patchHdrs = (etag) => ({ ...hdrs, 'Content-Type': 'application/json', 'If-Match': etag || '*' });

  // ── 1. GET an existing ItemVendorCatalog record (full metadata) ──
  log('\n--- STEP 1: GET existing ItemVendorCatalog record (full response) ---');
  let rec, etag, odataId, odataEditLink;
  try {
    const r = await fetch(`${base}/ItemVendorCatalog?$top=1`, { headers: hdrs });
    if (!r.ok) {
      const body = await r.text().catch(() => '');
      fail(`GET failed: ${r.status}`, body.slice(0, 300));
      if (r.status === 401) {
        fail('401 = token rejected. If using manual fallback, verify the token is fresh.');
        fail('Try: window._bcProbeToken = "<paste fresh token>"; then re-run.');
      }
      return;
    }
    const d = await r.json();
    rec = (d.value || [])[0];
    if (!rec) { fail('No ItemVendorCatalog records found'); return; }
    log('Full record (all fields + OData annotations):', JSON.stringify(rec, null, 2));
    etag = rec['@odata.etag'] || '*';
    odataId = rec['@odata.id'] || null;
    odataEditLink = rec['@odata.editLink'] || null;
    log('@odata.etag:', etag);
    log('@odata.id:', odataId);
    log('@odata.editLink:', odataEditLink);
    log('@odata.context:', d['@odata.context'] || 'not present');
  } catch(e) { fail('GET exception:', e.message); return; }

  const itemNo = rec.Item_No;
  const vendorNo = rec.Vendor_No;
  const currentLT = rec.Lead_Time_Calculation;
  log('Test record:', `Item_No=${itemNo}, Vendor_No=${vendorNo}, Lead_Time_Calculation=${currentLT}`);

  // No-op body — current value, no actual data change
  const noopBody = JSON.stringify({ Lead_Time_Calculation: currentLT });

  // ── 2. Q1a: PATCH via compound-key URL (the form that currently 404s) ──
  log('\n--- STEP 2 (Q1a): PATCH via compound-key URL ---');
  const pn = encodeURIComponent(String(itemNo).replace(/'/g, "''"));
  const vn = encodeURIComponent(String(vendorNo).replace(/'/g, "''"));
  const compoundUrl = `${base}/ItemVendorCatalog(Item_No='${pn}',Vendor_No='${vn}')`;
  log('URL:', compoundUrl);
  try {
    const r = await fetch(compoundUrl, { method: 'PATCH', headers: patchHdrs(etag), body: noopBody });
    log(`Result: ${r.status} ${r.statusText}`);
    if (!r.ok) log('Response body:', (await r.text()).slice(0, 400));
    else log('COMPOUND-KEY PATCH SUCCEEDED');
  } catch(e) { fail('Exception:', e.message); }

  // ── 3. Q1b: PATCH via @odata.editLink ──
  if (odataEditLink) {
    log('\n--- STEP 3 (Q1b): PATCH via @odata.editLink ---');
    const editUrl = odataEditLink.startsWith('http') ? odataEditLink : `${base}/${odataEditLink}`;
    log('URL:', editUrl);
    if (editUrl === compoundUrl) {
      log('SAME as compound-key URL — would produce same result, skipping');
    } else {
      try {
        const r = await fetch(editUrl, { method: 'PATCH', headers: patchHdrs(etag), body: noopBody });
        log(`Result: ${r.status} ${r.statusText}`);
        if (!r.ok) log('Response body:', (await r.text()).slice(0, 400));
        else log('EDITLINK PATCH SUCCEEDED');
      } catch(e) { fail('Exception:', e.message); }
    }
  } else {
    log('\n--- STEP 3 (Q1b): @odata.editLink is NULL — no editLink addressing available ---');
  }

  // ── 4. Q1c: PATCH via @odata.id ──
  if (odataId && odataId !== odataEditLink) {
    log('\n--- STEP 4 (Q1c): PATCH via @odata.id ---');
    const idUrl = odataId.startsWith('http') ? odataId : `${base}/${odataId}`;
    log('URL:', idUrl);
    try {
      const r = await fetch(idUrl, { method: 'PATCH', headers: patchHdrs(etag), body: noopBody });
      log(`Result: ${r.status} ${r.statusText}`);
      if (!r.ok) log('Response body:', (await r.text()).slice(0, 400));
      else log('ODATA-ID PATCH SUCCEEDED');
    } catch(e) { fail('Exception:', e.message); }
  } else if (odataId === odataEditLink) {
    log('\n--- STEP 4 (Q1c): @odata.id === @odata.editLink — same URL, skipped ---');
  } else {
    log('\n--- STEP 4 (Q1c): @odata.id is NULL — skipped ---');
  }

  // ── 5. Q1d: PATCH with UNENCODED key values ──
  log('\n--- STEP 5 (Q1d): PATCH via UNENCODED compound-key URL ---');
  const rawUrl = `${base}/ItemVendorCatalog(Item_No='${String(itemNo).replace(/'/g, "''")}',Vendor_No='${String(vendorNo).replace(/'/g, "''")}')`;
  if (rawUrl !== compoundUrl) {
    log('URL:', rawUrl);
    log('Diff from encoded:', `encoded has ${compoundUrl.length} chars, unencoded has ${rawUrl.length}`);
    try {
      const r = await fetch(rawUrl, { method: 'PATCH', headers: patchHdrs(etag), body: noopBody });
      log(`Result: ${r.status} ${r.statusText}`);
      if (!r.ok) log('Response body:', (await r.text()).slice(0, 400));
      else log('UNENCODED COMPOUND-KEY PATCH SUCCEEDED');
    } catch(e) { fail('Exception:', e.message); }
  } else {
    log('Identical to encoded URL (no special chars in keys) — skipped');
  }

  // ── 6. Q2: Alternative surface — v2.0 API items/{id}/itemVendors ──
  log('\n--- STEP 6 (Q2): v2.0 API — items/{id}/itemVendors ---');
  log('Looking for item via v2.0 API...');
  try {
    const ir = await fetch(`${apiBase}/items?$filter=number eq '${encodeURIComponent(itemNo)}'&$select=id,number,displayName`, { headers: hdrs });
    if (!ir.ok) {
      log(`Items GET failed: ${ir.status}`, (await ir.text()).slice(0, 200));
    } else {
      const id = await ir.json();
      const item = (id.value || [])[0];
      if (!item || !item.id) {
        log('Item not found via v2.0 API (number may differ from Item_No)');
      } else {
        log('Found item:', JSON.stringify(item));

        // Try itemVendors as a navigation property
        const ivUrl = `${apiBase}/items(${item.id})/itemVendors`;
        log('Fetching itemVendors:', ivUrl);
        const ivr = await fetch(ivUrl, { headers: hdrs });
        if (!ivr.ok) {
          const errText = (await ivr.text()).slice(0, 300);
          log(`itemVendors GET: ${ivr.status}`, errText);
          if (ivr.status === 404) {
            log('itemVendors navigation property NOT available on this tenant');
          }
        } else {
          const ivd = await ivr.json();
          log('itemVendors response (full):', JSON.stringify(ivd, null, 2));
          const vendors = ivd.value || [];
          const match = vendors.find(v => v.vendorNumber === vendorNo) || vendors[0];
          if (match && match.id) {
            log('Found itemVendor record:', JSON.stringify(match));
            // Try PATCH — no-op on whatever lead time field exists
            const patchUrl = `${apiBase}/items(${item.id})/itemVendors(${match.id})`;
            log('PATCH URL:', patchUrl);
            const v2Body = {};
            if ('leadTimeDays' in match) v2Body.leadTimeDays = match.leadTimeDays;
            else if ('leadTimeCalculation' in match) v2Body.leadTimeCalculation = match.leadTimeCalculation;
            log('PATCH body:', JSON.stringify(v2Body));
            try {
              const pr = await fetch(patchUrl, {
                method: 'PATCH',
                headers: patchHdrs(match['@odata.etag']),
                body: JSON.stringify(v2Body)
              });
              log(`Result: ${pr.status} ${pr.statusText}`);
              if (!pr.ok) log('Response body:', (await pr.text()).slice(0, 400));
              else log('v2.0 API itemVendors PATCH SUCCEEDED');
            } catch(e) { fail('PATCH exception:', e.message); }
          } else {
            log('No itemVendor records found for this item');
          }
        }
      }
    }
  } catch(e) { fail('v2.0 API exception:', e.message); }

  // ── 7. Q2 fallback: top-level itemVendors endpoint ──
  log('\n--- STEP 7 (Q2 fallback): v2.0 API top-level /itemVendors ---');
  try {
    const r = await fetch(`${apiBase}/itemVendors?$top=1`, { headers: hdrs });
    log(`GET /itemVendors: ${r.status} ${r.statusText}`);
    if (r.ok) {
      const d = await r.json();
      log('Top-level itemVendors response:', JSON.stringify(d, null, 2));
    } else {
      log('Response:', (await r.text()).slice(0, 200));
    }
  } catch(e) { fail('Exception:', e.message); }

  // ── 8. Metadata: check entity type for Page 114 ──
  log('\n--- STEP 8: OData $metadata for ItemVendorCatalog ---');
  try {
    const metaUrl = base.replace(/\/Company\(.*$/, '/$metadata');
    log('Fetching $metadata (may be large, extracting ItemVendorCatalog section)...');
    const r = await fetch(metaUrl, { headers: { ...hdrs, 'Accept': 'application/xml' } });
    if (r.ok) {
      const xml = await r.text();
      const match = xml.match(/<EntityType[^>]*Name="ItemVendorCatalog"[\s\S]*?<\/EntityType>/i);
      if (match) {
        log('ItemVendorCatalog EntityType:', match[0]);
      } else {
        const match2 = xml.match(/<EntityType[^>]*Name="[^"]*[Ii]tem[Vv]endor[^"]*"[\s\S]*?<\/EntityType>/gi);
        if (match2) log('ItemVendor-related EntityTypes:', match2.join('\n'));
        else log('No ItemVendorCatalog EntityType found in $metadata');
      }
      const capMatch = xml.match(/<Annotations[^>]*ItemVendorCatalog[\s\S]*?<\/Annotations>/i);
      if (capMatch) log('Capabilities annotations:', capMatch[0]);
    } else {
      log(`$metadata fetch failed: ${r.status}`);
    }
  } catch(e) { fail('$metadata exception:', e.message); }

  // ── SUMMARY ──
  log('\n=== PROBE COMPLETE ===');
  const successes = R.filter(r => typeof r.msg === 'string' && r.msg.includes('SUCCEEDED'));
  if (successes.length > 0) {
    log('WORKING PATCH FORMS:', successes.map(s => s.msg).join('; '));
  } else {
    log('NO PATCH form succeeded. Page 114 may be read-after-create on this tenant.');
    log('Check Q2 (v2.0 API) results above for alternative surface.');
  }
  log('\nCopy ALL console output (right-click → Save As) and send to Coach.');

  const summary = {
    timestamp: new Date().toISOString(),
    record: { Item_No: itemNo, Vendor_No: vendorNo, Lead_Time_Calculation: currentLT },
    odataAnnotations: { etag, odataId, odataEditLink },
    results: R.filter(r => r.msg && (r.msg.includes('Result:') || r.msg.includes('SUCCEEDED') || r.msg.includes('NULL') || r.msg.includes('failed'))).map(r => r.msg + (r.data ? ' ' + r.data : ''))
  };
  console.log('\n--- JSON SUMMARY (copy this block) ---');
  console.log(JSON.stringify(summary, null, 2));
})();
