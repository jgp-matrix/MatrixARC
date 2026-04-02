// ─── ItemsTab ───────────────────────────────────────────────────────────────
// BC Items browser with manufacturer code editing, vendor sync, and bulk MFR lookup.

import React, { useState, useEffect, useRef } from 'react';
import { C, btn, inp, card } from '@/core/constants';
import { _bcToken, fbDb } from '@/core/globals';
import { patchItemOData as bcPatchItemOData } from '@/services/businessCentral/items';
import { getOdataBase, discoverODataPages } from '@/services/businessCentral/client';

// ─── Globals not yet in module system ────────────────────────────────────────
declare const firebase: any;
declare const BC_MFR_MAP: { code: string; terms: string[] }[];
declare const _bcManufacturers: any;

// Stub components — these live in the monolith and will be extracted separately
const VendorPricingSyncPanel = ({ uid }: any) => (
  <div style={{ color: C.muted, fontSize: 12, padding: 8 }}>Vendor pricing sync (loading from monolith)...</div>
);
const VendorsPanel = ({ uid, onVendorAdded }: any) => (
  <div style={{ color: C.muted, fontSize: 12, padding: 8 }}>Vendors panel (loading from monolith)...</div>
);

// ─── Local BC helpers (not yet in service modules) ──────────────────────────

let _bcVendorMapCache: Record<string, string> | null = null;

async function bcFetchVendorMap(): Promise<Record<string, string>> {
  if (_bcVendorMapCache) return _bcVendorMapCache;
  if (!_bcToken) return {};
  try {
    const allPages = await discoverODataPages();
    const vPage = allPages.find((n: string) => /^vendor/i.test(n)) || 'Vendor';
    const base = getOdataBase();
    const r = await fetch(`${base}/${vPage}?$select=No,Name&$top=500`, {
      headers: { Authorization: `Bearer ${_bcToken}` },
    });
    if (!r.ok) return {};
    const list = (await r.json()).value || [];
    _bcVendorMapCache = Object.fromEntries(list.map((v: any) => [v.No, v.Name]));
    return _bcVendorMapCache!;
  } catch { return {}; }
}

let _bcManufacturersCache: { Code: string; Name: string }[] | null = null;

async function bcFetchManufacturers(): Promise<{ Code: string; Name: string }[]> {
  if (_bcManufacturersCache) return _bcManufacturersCache;
  if (!_bcToken) return [];
  const bcCodes = new Map<string, string>();
  try {
    const allPages = await discoverODataPages();
    const mPage = allPages.find((n: string) => n === 'Manufacturer' || n === 'Manufacturers');
    if (mPage) {
      const base = getOdataBase();
      const r = await fetch(`${base}/${mPage}?$select=Code,Name&$top=500`, {
        headers: { Authorization: `Bearer ${_bcToken}` },
      });
      if (r.ok) (await r.json()).value?.forEach((m: any) => bcCodes.set(m.Code, m.Name));
    }
  } catch { /* ignore */ }
  // Merge with BC_MFR_MAP if available
  try {
    const mfrMap = typeof BC_MFR_MAP !== 'undefined' ? BC_MFR_MAP : [];
    const mfrNames = Object.fromEntries(
      mfrMap.map((m: any) => [m.code, m.terms[0].split(' ').map((w: string) => w[0].toUpperCase() + w.slice(1)).join(' ')])
    );
    mfrMap.forEach((m: any) => { if (!bcCodes.has(m.code)) bcCodes.set(m.code, mfrNames[m.code] || m.code); });
  } catch { /* BC_MFR_MAP not available */ }
  _bcManufacturersCache = Array.from(bcCodes.entries())
    .map(([Code, Name]) => ({ Code, Name }))
    .sort((a, b) => a.Code.localeCompare(b.Code));
  return _bcManufacturersCache;
}

// ─── ItemsTab Component ─────────────────────────────────────────────────────

export default function ItemsTab({ uid }: any) {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [skip, setSkip] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [editingMfr, setEditingMfr] = useState<{ no: string; val: string } | null>(null);
  const [savingMfr, setSavingMfr] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showVendorSync, setShowVendorSync] = useState(false);
  const [manufacturers, setManufacturers] = useState<{ Code: string; Name: string }[]>([]);
  const [vendorMap, setVendorMap] = useState<Record<string, string>>({});
  const [priceDateMap, setPriceDateMap] = useState<Record<string, number>>({});
  const [showMfrLookup, setShowMfrLookup] = useState(false);
  const [mfrLookupRunning, setMfrLookupRunning] = useState(false);
  const [mfrLookupResult, setMfrLookupResult] = useState<any>(null);
  const [mfrLookupProgress, setMfrLookupProgress] = useState('');
  const PAGE = 100;

  async function fetchPurchasePriceDates(itemNos: string[]) {
    if (!_bcToken || !itemNos.length) return;
    try {
      const allPages = await discoverODataPages();
      const ppPage = allPages.find((p: string) => /purchaseprice/i.test(p));
      if (!ppPage) { console.warn('ItemsTab: PurchasePrice OData page not found'); return; }
      const BATCH = 15;
      const map: Record<string, number> = {};
      const batches: string[][] = [];
      for (let i = 0; i < itemNos.length; i += BATCH) batches.push(itemNos.slice(i, i + BATCH));
      const base = getOdataBase();
      await Promise.all(batches.map(async (batch) => {
        const f = batch.map(n => `Item_No eq '${n.replace(/'/g, "''")}'`).join(' or ');
        const r = await fetch(
          `${base}/${ppPage}?$select=Item_No,Starting_Date&$filter=(${f})&$top=500`,
          { headers: { Authorization: `Bearer ${_bcToken}` } }
        );
        if (!r.ok) return;
        const rows = (await r.json()).value || [];
        for (const row of rows) {
          if (!row.Starting_Date) continue;
          const ms = new Date(row.Starting_Date).getTime();
          if (!map[row.Item_No] || ms > map[row.Item_No]) map[row.Item_No] = ms;
        }
      }));
      setPriceDateMap(prev => ({ ...prev, ...map }));
    } catch (e: any) { console.warn('fetchPurchasePriceDates:', e); }
  }

  // Column resize
  const COL_LS_KEY = 'arc_items_col_widths';
  const COL_DEFAULTS = [110, 340, 140, 160, 100, 120];
  const [colWidths, setColWidths] = useState<number[]>(() => {
    try { const s = JSON.parse(localStorage.getItem(COL_LS_KEY)!); if (s && s.length === 6) return s; } catch { }
    return COL_DEFAULTS;
  });
  const colResizing = useRef<any>(null);

  function onColResizeStart(e: React.MouseEvent, colIdx: number) {
    e.preventDefault();
    const startX = e.clientX;
    const startW = colWidths[colIdx];
    colResizing.current = { colIdx, startX, startW };
    function onMove(ev: MouseEvent) {
      if (!colResizing.current) return;
      const newW = Math.max(48, startW + (ev.clientX - startX));
      setColWidths(prev => { const n = [...prev]; n[colIdx] = newW; return n; });
    }
    function onUp() {
      setColWidths(prev => { localStorage.setItem(COL_LS_KEY, JSON.stringify(prev)); return prev; });
      colResizing.current = null;
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    }
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }

  useEffect(() => {
    if (_bcToken) {
      load(0, '');
      bcFetchManufacturers().then(setManufacturers);
      bcFetchVendorMap().then(setVendorMap);
    }
  }, []);

  // Live search debounced 350ms
  useEffect(() => {
    if (!_bcToken) return;
    const t = setTimeout(() => load(0, search), 350);
    return () => clearTimeout(t);
  }, [search]);

  async function load(sk: number, q: string) {
    setLoading(true); setError(null);
    const base = getOdataBase();
    const baseUrl = `${base}/ItemCard?$select=No,Description,Manufacturer_Code,Vendor_No,Last_Direct_Cost&$top=${PAGE}&$orderby=No asc`;
    const hdrs = { Authorization: `Bearer ${_bcToken}` };
    try {
      if (q && q.trim()) {
        const s = q.trim().replace(/'/g, "''");
        const [rNo, rDesc] = await Promise.all([
          fetch(`${baseUrl}&$filter=startswith(No,'${s}')`, { headers: hdrs }),
          fetch(`${baseUrl}&$filter=contains(Description,'${s}')`, { headers: hdrs }),
        ]);
        const noItems = rNo.ok ? (await rNo.json()).value || [] : [];
        const descItems = rDesc.ok ? (await rDesc.json()).value || [] : [];
        const seen = new Set<string>();
        const merged = [...noItems, ...descItems].filter((i: any) => { if (seen.has(i.No)) return false; seen.add(i.No); return true; });
        setItems(merged);
        setHasMore(false);
        fetchPurchasePriceDates(merged.map((i: any) => i.No));
      } else {
        const r = await fetch(`${baseUrl}&$skip=${sk}`, { headers: hdrs });
        if (!r.ok) throw new Error(`BC ${r.status}`);
        const batch = (await r.json()).value || [];
        if (sk === 0) setItems(batch);
        else setItems(prev => [...prev, ...batch]);
        setHasMore(batch.length === PAGE);
        setSkip(sk);
        fetchPurchasePriceDates(batch.map((i: any) => i.No));
      }
    } catch (e: any) { setError(e.message); }
    setLoading(false);
  }

  async function saveMfr(no: string, val: string) {
    setSavingMfr(no);
    try {
      const code = val.trim().slice(0, 10).toUpperCase();
      if (!code) {
        await bcPatchItemOData(no, { Manufacturer_Code: '' });
        setItems(prev => prev.map(i => i.No === no ? { ...i, Manufacturer_Code: '' } : i));
        setSavingMfr(null);
        return;
      }
      // Ensure manufacturer record exists in BC before patching item
      const allPages = await discoverODataPages();
      const mPage = allPages.find((n: string) => n === 'Manufacturer' || n === 'Manufacturers');
      if (mPage) {
        const base = getOdataBase();
        const chk = await fetch(`${base}/${mPage}?$filter=Code eq '${code}'&$top=1`, {
          headers: { Authorization: `Bearer ${_bcToken}` },
        });
        if (chk.ok) {
          const existing = (await chk.json()).value || [];
          if (!existing.length) {
            const mfrMap = typeof BC_MFR_MAP !== 'undefined' ? BC_MFR_MAP : [];
            const mfrName = mfrMap.find((m: any) => m.code === code)?.terms[0] || code;
            const name = mfrName.split(' ').map((w: string) => w[0].toUpperCase() + w.slice(1)).join(' ');
            await fetch(`${base}/${mPage}`, {
              method: 'POST',
              headers: { Authorization: `Bearer ${_bcToken}`, 'Content-Type': 'application/json' },
              body: JSON.stringify({ Code: code, Name: name }),
            });
          }
        }
      }
      await bcPatchItemOData(no, { Manufacturer_Code: code });
      setItems(prev => prev.map(i => i.No === no ? { ...i, Manufacturer_Code: code } : i));
      _bcManufacturersCache = null; // refresh dropdown on next load
      setEditingMfr(null);
    } catch (e: any) { setError('Save failed: ' + e.message); }
    setSavingMfr(null);
  }

  if (!_bcToken) return (
    <div style={{ padding: 48, textAlign: 'center' }}>
      <div style={{ fontSize: 40, marginBottom: 12, opacity: 0.4 }}>📦</div>
      <div style={{ color: C.muted, fontSize: 14 }}>Connect to Business Central to browse items.</div>
    </div>
  );

  return (
    <div style={{ padding: '20px 32px', maxWidth: 1600, margin: '0 auto', boxSizing: 'border-box' }}>
      {/* Toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: C.text, letterSpacing: 0.5 }}>Items</h2>
        <div style={{ flex: 1, minWidth: 180, maxWidth: 380, display: 'flex', gap: 6 }}>
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search by item no or description..."
            style={{ flex: 1, ...inp(), padding: '6px 10px', fontSize: 13, fontFamily: 'inherit' }} />
          {loading && <span style={{ color: C.muted, fontSize: 12, whiteSpace: 'nowrap', alignSelf: 'center' }}>searching...</span>}
        </div>
        <button onClick={() => setShowVendorSync(v => !v)}
          style={{ background: showVendorSync ? '#0d9488' : '#1e3a5f', color: '#fff',
            border: `1px solid ${showVendorSync ? '#0d9488' : '#3b6aad'}`, borderRadius: 6, padding: '6px 14px', fontSize: 12,
            fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}>
          🔄 Sync Pricing
        </button>
        <button onClick={() => setShowMfrLookup(v => !v)}
          style={{ background: showMfrLookup ? '#2563eb' : '#1e3a5f', color: '#fff',
            border: `1px solid ${showMfrLookup ? '#2563eb' : '#3b6aad'}`, borderRadius: 6, padding: '6px 14px', fontSize: 12,
            fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}>
          🔍 Lookup MFR Codes
        </button>
      </div>

      {/* Collapsible panels */}
      {showVendorSync && <div style={{ ...card(), marginBottom: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: C.text, marginBottom: 10 }}>🔄 DigiKey & Mouser Vendor Pricing Sync</div>
        <VendorPricingSyncPanel uid={uid} />
      </div>}
      {showMfrLookup && <div style={{ ...card(), marginBottom: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: C.text, marginBottom: 10 }}>🔍 Bulk MFR Code Lookup (DigiKey + Mouser)</div>
        <div style={{ fontSize: 12, color: C.muted, marginBottom: 12, lineHeight: 1.6 }}>
          Finds BC items with empty Manufacturer Code, looks up each part number on DigiKey/Mouser to identify the manufacturer, then pushes the BC manufacturer code back to the Item Card.
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 }}>
          <button disabled={mfrLookupRunning} onClick={async () => {
            setMfrLookupRunning(true); setMfrLookupResult(null); setMfrLookupProgress('Fetching items from BC...');
            try {
              const listFn = (window as any).firebase?.functions().httpsCallable('bulkMfrList', { timeout: 300000 });
              const listR = await listFn({ bcToken: _bcToken, bcODataBase: getOdataBase() });
              const allItems = listR.data.items || [];
              setMfrLookupProgress(`Found ${allItems.length} items. Looking up MFR (dry run)...`);
              const BATCH = 3; const allResults: any[] = []; const allUnknown: any[] = [];
              const lookupFn = (window as any).firebase?.functions().httpsCallable('bulkMfrLookup', { timeout: 300000 });
              for (let i = 0; i < allItems.length; i += BATCH) {
                const batch = allItems.slice(i, i + BATCH);
                setMfrLookupProgress(`Dry run: ${i + 1}-${Math.min(i + BATCH, allItems.length)} of ${allItems.length}...`);
                const r = await lookupFn({ bcToken: _bcToken, bcODataBase: getOdataBase(), dryRun: true, items: batch });
                allResults.push(...(r.data.results || []));
                allUnknown.push(...(r.data.unknownMfr || []));
              }
              setMfrLookupResult({ totalInBC: allItems.length, found: allResults.filter((r: any) => r.manufacturer).length, notFound: allResults.filter((r: any) => r.status === 'not_found').length, patched: 0, unknownMfr: allUnknown, results: allResults, allItems });
              setMfrLookupProgress('');
            } catch (e: any) { setMfrLookupProgress('Error: ' + e.message); }
            setMfrLookupRunning(false);
          }} style={btn(mfrLookupRunning ? '#334155' : '#1e3a5f', '#93c5fd', { fontSize: 12, fontWeight: 600, border: '1px solid #3b82f655' })}>
            {mfrLookupRunning ? 'Running...' : 'Preview (Dry Run)'}
          </button>
          <button disabled={mfrLookupRunning || !mfrLookupResult} onClick={async () => {
            if (!confirm('This will write Manufacturer Codes to BC for all matched items. Continue?')) return;
            setMfrLookupRunning(true);
            try {
              const matchedItems = (mfrLookupResult.results || []).filter((r: any) => r.code).map((r: any) => ({ no: r.itemNo, desc: r.desc }));
              const BATCH = 3; const allResults: any[] = []; let totalPatched = 0;
              const lookupFn = (window as any).firebase?.functions().httpsCallable('bulkMfrLookup', { timeout: 300000 });
              for (let i = 0; i < matchedItems.length; i += BATCH) {
                const batch = matchedItems.slice(i, i + BATCH);
                setMfrLookupProgress(`Pushing ${i + 1}-${Math.min(i + BATCH, matchedItems.length)} of ${matchedItems.length}...`);
                const r = await lookupFn({ bcToken: _bcToken, bcODataBase: getOdataBase(), dryRun: false, items: batch });
                allResults.push(...(r.data.results || []));
                totalPatched += r.data.patched || 0;
              }
              setMfrLookupResult((prev: any) => ({ ...prev, results: allResults, patched: totalPatched }));
              setMfrLookupProgress(`Done! Patched ${totalPatched} items.`);
            } catch (e: any) { setMfrLookupProgress('Error: ' + e.message); }
            setMfrLookupRunning(false);
          }} style={btn(mfrLookupRunning || !mfrLookupResult ? '#334155' : '#064e3b', mfrLookupResult ? '#34d399' : '#475569', { fontSize: 12, fontWeight: 600, border: `1px solid ${mfrLookupResult ? '#059669' : '#334155'}` })}>
            Push to BC
          </button>
          {mfrLookupProgress && <span style={{ fontSize: 11, color: mfrLookupProgress.startsWith('Error') ? '#f87171' : '#93c5fd' }}>{mfrLookupProgress}</span>}
        </div>
        {mfrLookupResult && <div>
          <div style={{ fontSize: 12, color: C.muted, marginBottom: 8 }}>
            {mfrLookupResult.totalInBC} items missing MFR in BC · Found: {mfrLookupResult.found} · Not found: {mfrLookupResult.notFound} · Patched: {mfrLookupResult.patched || 0}
          </div>
          {mfrLookupResult.unknownMfr?.length > 0 && <div style={{ marginBottom: 8 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#fbbf24', marginBottom: 4 }}>Unknown manufacturers (no BC code mapping):</div>
            {mfrLookupResult.unknownMfr.map((u: any, i: number) => <div key={i} style={{ fontSize: 11, color: C.muted }}>{u.itemNo} → {u.manufacturer}</div>)}
          </div>}
          <div style={{ maxHeight: 300, overflowY: 'auto', border: `1px solid ${C.border}`, borderRadius: 6 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
              <thead><tr style={{ background: '#111d30' }}>
                <th style={{ padding: '5px 8px', textAlign: 'left', color: C.sub, fontWeight: 700 }}>ITEM</th>
                <th style={{ padding: '5px 8px', textAlign: 'left', color: C.sub, fontWeight: 700 }}>MANUFACTURER</th>
                <th style={{ padding: '5px 8px', textAlign: 'left', color: C.sub, fontWeight: 700 }}>CODE</th>
                <th style={{ padding: '5px 8px', textAlign: 'left', color: C.sub, fontWeight: 700 }}>SOURCE</th>
                <th style={{ padding: '5px 8px', textAlign: 'left', color: C.sub, fontWeight: 700 }}>STATUS</th>
              </tr></thead>
              <tbody>{(mfrLookupResult.results || []).map((r: any, i: number) => (
                <tr key={i} style={{ borderBottom: `1px solid ${C.border}`, background: r.status === 'patched' || r.status === 'dry_run' ? 'rgba(34,197,94,0.06)' : r.status === 'not_found' ? 'rgba(239,68,68,0.06)' : 'rgba(251,191,36,0.06)' }}>
                  <td style={{ padding: '4px 8px', color: '#93c5fd', fontFamily: 'monospace' }}>{r.itemNo}</td>
                  <td style={{ padding: '4px 8px', color: C.text }}>{r.manufacturer || '—'}</td>
                  <td style={{ padding: '4px 8px', color: r.code ? '#22c55e' : '#ef4444', fontWeight: 700 }}>{r.code || '—'}</td>
                  <td style={{ padding: '4px 8px', color: C.muted }}>{r.source || '—'}</td>
                  <td style={{ padding: '4px 8px', color: r.status === 'patched' ? '#22c55e' : r.status === 'not_found' ? '#ef4444' : '#fbbf24' }}>{r.status}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </div>}
      </div>}

      {error && <div style={{ color: C.red, fontSize: 12, marginBottom: 10 }}>{error}</div>}

      {/* Two-column layout: Items left, Vendors right */}
      <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>

        {/* LEFT - Items table */}
        <div style={{ flex: '0 0 75%', minWidth: 0, maxHeight: 'calc(100vh - 240px)', overflowY: 'auto' }}>
          <div style={{ border: `1px solid ${C.border}`, borderRadius: 8, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, tableLayout: 'fixed' }}>
              <colgroup>{colWidths.map((w, i) => <col key={i} style={{ width: w }} />)}</colgroup>
              <thead>
                <tr style={{ background: '#111d30', borderBottom: `2px solid ${C.border}` }}>
                  {['ITEM NO', 'DESCRIPTION', 'MFR CODE', 'VENDOR', 'LAST COST', 'PRICED DATE'].map((h, i) => (
                    <th key={h} style={{ position: 'relative', padding: '9px 12px',
                      textAlign: i === 4 ? 'right' : 'left',
                      color: C.sub, fontWeight: 700, fontSize: 11, letterSpacing: 1,
                      whiteSpace: 'nowrap', userSelect: 'none', overflow: 'hidden' }}>
                      {h}
                      <div onMouseDown={e => onColResizeStart(e, i)}
                        onDoubleClick={() => { setColWidths(prev => { const n = [...prev]; n[i] = COL_DEFAULTS[i]; localStorage.setItem(COL_LS_KEY, JSON.stringify(n)); return n; }); }}
                        style={{ position: 'absolute', right: 0, top: 0, height: '100%', width: 6,
                          cursor: 'col-resize', zIndex: 2,
                          background: 'transparent',
                          borderRight: '2px solid transparent',
                          transition: 'border-color 0.15s' }}
                        onMouseEnter={e => (e.currentTarget.style.borderRightColor = '#3b82f6')}
                        onMouseLeave={e => (e.currentTarget.style.borderRightColor = 'transparent')}
                        title="Drag to resize · Double-click to reset" />
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {items.map((item, idx) => {
                  const priceMs = priceDateMap[item.No] ?? null;
                  const daysSince = priceMs != null
                    ? Math.floor((Date.now() - priceMs) / (1000 * 60 * 60 * 24))
                    : null;
                  const priceColor = daysSince === null ? '#ef4444' : daysSince <= 30 ? '#22c55e' : '#ef4444';
                  const priceBold = 700;
                  const pricedDate = priceMs != null
                    ? new Date(priceMs).toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: '2-digit' })
                    : '—';
                  const vendorName = vendorMap[item.Vendor_No] || item.Vendor_No || '—';
                  return (
                    <tr key={item.No} style={{ borderBottom: `1px solid ${C.border}`,
                      background: idx % 2 === 0 ? '#1a2235' : '#162040' }}>
                      <td style={{ padding: '7px 12px', color: '#93c5fd', fontFamily: 'monospace', fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.No}</td>
                      <td style={{ padding: '7px 12px', color: C.text, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                        title={item.Description}>{item.Description}</td>
                      <td style={{ padding: '4px 12px', whiteSpace: 'nowrap' }}>
                        {manufacturers.length > 0 ? (
                          editingMfr?.no === item.No ? (
                            <select value={editingMfr.val || ''} autoFocus
                              onChange={e => { const v = e.target.value; setEditingMfr(null); saveMfr(item.No, v); }}
                              onBlur={() => { setTimeout(() => setEditingMfr(prev => prev?.no === item.No ? null : prev), 150); }}
                              style={{ background: '#1e293b', border: '1px solid #3b82f6',
                                borderRadius: 4, padding: '3px 6px',
                                color: C.text,
                                fontSize: 11, fontFamily: 'inherit', width: '100%', maxWidth: 120, cursor: 'pointer' }}>
                              <option value="">— none —</option>
                              {manufacturers.map(m => <option key={m.Code} value={m.Code}>{m.Code} — {m.Name}</option>)}
                            </select>
                          ) : (
                            <span onClick={() => setEditingMfr({ no: item.No, val: item.Manufacturer_Code || '' })}
                              style={{ cursor: 'pointer', display: 'inline-block', padding: '2px 7px',
                                borderRadius: 4, border: '1px solid transparent', fontSize: 12,
                                color: item.Manufacturer_Code ? '#60a5fa' : C.muted,
                                background: item.Manufacturer_Code ? 'rgba(59,130,246,0.12)' : 'transparent',
                                fontWeight: item.Manufacturer_Code ? 700 : 400 }}
                              title={item.Manufacturer_Code ? manufacturers.find(m => m.Code === item.Manufacturer_Code)?.Name || 'Click to change' : 'Click to set'}>
                              {savingMfr === item.No ? '...' : item.Manufacturer_Code || '—'}
                            </span>
                          )
                        ) : (
                          <span onClick={() => setEditingMfr({ no: item.No, val: item.Manufacturer_Code || '' })}
                            title="Click to edit"
                            style={{ cursor: 'pointer', display: 'inline-block', minWidth: 52, padding: '2px 7px',
                              borderRadius: 4, border: '1px solid transparent', fontSize: 13,
                              color: item.Manufacturer_Code ? '#60a5fa' : C.muted,
                              background: item.Manufacturer_Code ? 'rgba(59,130,246,0.12)' : 'transparent',
                              fontWeight: item.Manufacturer_Code ? 600 : 400 }}>
                            {editingMfr?.no === item.No ? (
                              <input value={editingMfr.val}
                                onChange={e => setEditingMfr({ no: item.No, val: e.target.value })}
                                onKeyDown={e => { if (e.key === 'Enter') saveMfr(item.No, editingMfr!.val); if (e.key === 'Escape') setEditingMfr(null); }}
                                maxLength={10} autoFocus
                                style={{ width: 80, background: '#1e293b', border: '1px solid #3b82f6', borderRadius: 4,
                                  padding: '3px 6px', color: C.text, fontSize: 13, fontFamily: 'inherit', textTransform: 'uppercase' }} />
                            ) : item.Manufacturer_Code || '—'}
                          </span>
                        )}
                      </td>
                      <td style={{ padding: '7px 12px', fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
                        title={vendorName !== item.Vendor_No ? `${item.Vendor_No} — ${vendorName}` : vendorName}>
                        <span style={{ color: C.muted }}>{vendorName}</span>
                      </td>
                      <td style={{ padding: '7px 12px', textAlign: 'right', fontFamily: 'monospace', fontSize: 13, whiteSpace: 'nowrap',
                        color: item.Last_Direct_Cost > 0 ? priceColor : C.muted, fontWeight: item.Last_Direct_Cost > 0 ? priceBold : 400 }}>
                        {item.Last_Direct_Cost > 0 ? `$${Number(item.Last_Direct_Cost).toFixed(2)}` : '—'}
                      </td>
                      <td style={{ padding: '7px 12px', fontSize: 13, whiteSpace: 'nowrap',
                        color: priceColor, fontWeight: priceBold }}>
                        {pricedDate}{daysSince !== null && <span style={{ fontSize: 10, opacity: 0.7, marginLeft: 4 }}>({daysSince}d)</span>}
                      </td>
                    </tr>
                  );
                })}
                {items.length === 0 && !loading && (
                  <tr><td colSpan={6} style={{ padding: 32, textAlign: 'center', color: C.muted, fontSize: 13 }}>No items found.</td></tr>
                )}
              </tbody>
            </table>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 10, fontSize: 12, color: C.muted }}>
            <span>{items.length} items loaded</span>
            {hasMore && <button onClick={() => load(skip + PAGE, search)} disabled={loading}
              style={{ ...btn(C.border, C.text), padding: '5px 16px', fontSize: 12 }}>
              {loading ? 'Loading...' : 'Load More'}
            </button>}
          </div>
        </div>

        {/* RIGHT - Vendors */}
        <div style={{ flex: '0 0 25%', maxHeight: 'calc(100vh - 240px)', overflowY: 'auto' }}>
          <div style={{ ...card(), padding: '14px 16px' }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: C.text, marginBottom: 12 }}>🏢 Vendors</div>
            <VendorsPanel uid={uid} onVendorAdded={() => { _bcVendorMapCache = null; bcFetchVendorMap().then(setVendorMap); }} />
          </div>
        </div>

      </div>
    </div>
  );
}
