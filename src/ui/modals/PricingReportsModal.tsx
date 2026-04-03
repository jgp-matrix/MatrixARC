import { useState, useEffect } from 'react';
import { C } from '@/core/constants';
import { fbDb } from '@/core/globals';

/**
 * PricingReportsModal -- displays history of pricing sync runs (Codale, DigiKey, Mouser)
 * with expandable details and CSV export.
 */
export default function PricingReportsModal({ uid, onClose }: { uid: string; onClose: () => void }) {
  const [runs, setRuns] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    fbDb.collection(`users/${uid}/pricingSyncLog`).orderBy('runAt', 'desc').limit(50).get()
      .then(snap => {
        const docs: any[] = [];
        snap.forEach(d => docs.push({ id: d.id, ...d.data() }));
        setRuns(docs);
      }).catch(e => console.warn('Failed to load sync log:', e))
      .finally(() => setLoading(false));
  }, [uid]);

  function exportRunCSV(run: any) {
    const header = ['Part Number', 'Vendor', 'Price', 'UOM', 'Availability', 'Manufacturer', 'Product Name', 'Status', 'Error', 'Sync Date'];
    const dateStr = new Date(run.runAt).toLocaleDateString();
    const rows = (run.results || []).map((r: any) => [
      r.partNumber, run.vendor, r.found ? r.price : '', r.uom || '', (r.availability || '').replace(/[\n\r,]/g, ' '),
      r.manufacturer || '', (r.productName || '').replace(/,/g, ' '), r.found ? 'Found' : 'Error', r.error || '', dateStr,
    ]);
    const csv = [header, ...rows].map(r => r.map((c: any) => `"${String(c || '').replace(/"/g, '""')}"`).join(',')).join('\n');
    const a = document.createElement('a');
    a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv);
    a.download = `${run.vendor}_pricing_${new Date(run.runAt).toISOString().slice(0, 10)}.csv`;
    a.click();
  }

  function exportAllLatest() {
    const latest: Record<string, any> = {};
    runs.forEach(run => {
      (run.results || []).forEach((r: any) => {
        if (r.found && r.price && !latest[r.partNumber + '_' + run.vendor]) {
          latest[r.partNumber + '_' + run.vendor] = {
            partNumber: r.partNumber, vendor: run.vendor, price: r.price, uom: r.uom || 'EA',
            availability: r.availability || '', manufacturer: r.manufacturer || '',
            productName: r.productName || '', date: new Date(run.runAt).toLocaleDateString(),
          };
        }
      });
    });
    const rows = Object.values(latest).sort((a, b) => a.partNumber.localeCompare(b.partNumber));
    const header = ['Part Number', 'Vendor', 'Price', 'UOM', 'Availability', 'Manufacturer', 'Product Name', 'Last Sync Date'];
    const csv = [header, ...rows.map((r: any) => [r.partNumber, r.vendor, r.price, r.uom, (r.availability || '').replace(/[\n\r,]/g, ' '), r.manufacturer, (r.productName || '').replace(/,/g, ' '), r.date])].map(r => r.map((c: any) => `"${String(c || '').replace(/"/g, '""')}"`).join(',')).join('\n');
    const a = document.createElement('a');
    a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv);
    a.download = `all_latest_pricing_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  }

  function fmtDuration(ms: number) {
    if (!ms) return '--';
    const s = Math.round(ms / 1000);
    if (s < 60) return s + 's';
    const m = Math.floor(s / 60), rs = s % 60;
    return m + 'm ' + rs + 's';
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.7)' }} onClick={onClose}>
      <div style={{ background: '#0f0f1a', borderRadius: 12, border: `1px solid ${C.border}`, width: 800, maxWidth: '95vw', maxHeight: '85vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }} onClick={(e: any) => e.stopPropagation()}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', borderBottom: `1px solid ${C.border}` }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: '#e2e8f0' }}>Pricing Sync Reports</div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {runs.length > 0 && <button onClick={exportAllLatest} style={{ background: '#16a34a', color: '#fff', border: 'none', borderRadius: 6, padding: '6px 14px', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>Export All Latest Prices (CSV)</button>}
            <button onClick={onClose} style={{ background: 'none', border: 'none', color: C.muted, fontSize: 18, cursor: 'pointer', padding: '2px 6px' }}>x</button>
          </div>
        </div>
        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '14px 18px' }}>
          {loading ? <div style={{ color: C.muted, fontSize: 13, padding: 20, textAlign: 'center' }}>Loading sync history...</div>
          : runs.length === 0 ? <div style={{ color: C.muted, fontSize: 13, padding: 20, textAlign: 'center' }}>No pricing sync runs yet. Run a Codale or Mouser update to see results here.</div>
          : <div>
            {runs.map(run => {
              const expanded = expandedId === run.id;
              const dt = new Date(run.runAt);
              return (
                <div key={run.id} style={{ marginBottom: 8, background: '#0a0a12', border: `1px solid ${C.border}`, borderRadius: 8, overflow: 'hidden' }}>
                  {/* Run summary row */}
                  <div onClick={() => setExpandedId(expanded ? null : run.id)} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', cursor: 'pointer', flexWrap: 'wrap' }}>
                    <span style={{ fontWeight: 700, color: run.vendor === 'Codale' ? '#22d3ee' : '#a78bfa', fontSize: 12, minWidth: 60 }}>{run.vendor}</span>
                    <span style={{ color: '#94a3b8', fontSize: 12 }}>{dt.toLocaleDateString()} {dt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                    <span style={{ color: '#22c55e', fontSize: 12, fontWeight: 600 }}>{run.found} found</span>
                    {run.errors > 0 && <span style={{ color: '#ef4444', fontSize: 12, fontWeight: 600 }}>{run.errors} errors</span>}
                    <span style={{ color: '#94a3b8', fontSize: 12 }}>{run.totalItems} total</span>
                    {run.writtenToBC > 0 && <span style={{ color: '#60a5fa', fontSize: 12 }}>{run.writtenToBC} written to BC</span>}
                    <span style={{ color: '#94a3b8', fontSize: 11 }}>{fmtDuration(run.durationMs)}</span>
                    <div style={{ marginLeft: 'auto', display: 'flex', gap: 6, alignItems: 'center' }}>
                      <button onClick={(e: any) => { e.stopPropagation(); exportRunCSV(run); }} style={{ background: '#334155', color: '#e2e8f0', border: 'none', borderRadius: 4, padding: '4px 10px', fontSize: 11, cursor: 'pointer', fontWeight: 600 }}>CSV</button>
                      <span style={{ color: '#94a3b8', fontSize: 14 }}>{expanded ? 'v' : '>'}</span>
                    </div>
                  </div>
                  {/* Expanded results */}
                  {expanded && <div style={{ borderTop: `1px solid ${C.border}`, padding: '8px 14px', maxHeight: 400, overflowY: 'auto' }}>
                    {(run.results || []).length === 0 ? <div style={{ color: C.muted, fontSize: 12 }}>No detailed results stored.</div>
                    : (run.results || []).map((r: any, i: number) => <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', borderBottom: '1px solid rgba(255,255,255,0.03)', fontSize: 12, flexWrap: 'wrap' }}>
                      <span style={{ fontWeight: 700, color: r.found ? '#22c55e' : '#ef4444', minWidth: 140 }}>{r.partNumber}</span>
                      {r.found ? <>
                        <span style={{ color: '#22c55e', fontWeight: 700, minWidth: 80 }}>${Number(r.price).toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                        <span style={{ color: '#94a3b8' }}>{r.uom || 'EA'}</span>
                        {r.manufacturer && <span style={{ color: '#94a3b8' }}>| {r.manufacturer}</span>}
                        {r.productName && <span style={{ color: '#94a3b8', fontSize: 11 }}>{r.productName}</span>}
                      </> : <span style={{ color: '#94a3b8' }}>{r.error || 'Not found'}</span>}
                    </div>)}
                  </div>}
                </div>
              );
            })}
          </div>}
        </div>
      </div>
    </div>
  );
}
