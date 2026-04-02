// ─── PurchasingTab ──────────────────────────────────────────────────────────
// Placeholder tab for future purchasing workflow features.

import React from 'react';

export default function PurchasingTab() {
  return (
    <div style={{ padding: 48, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 400 }}>
      <div style={{ fontSize: 48, marginBottom: 16, opacity: 0.3 }}>⬡</div>
      <div style={{ fontSize: 20, fontWeight: 700, color: '#94a3b8', marginBottom: 8 }}>Purchasing</div>
      <div style={{ fontSize: 14, color: '#94a3b8', textAlign: 'center', maxWidth: 360, lineHeight: 1.7 }}>
        Purchase order management, RFQ workflow, and BC purchase quote integration coming soon.
      </div>
    </div>
  );
}
