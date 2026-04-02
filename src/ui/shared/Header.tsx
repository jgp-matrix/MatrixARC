// ─── Header ─────────────────────────────────────────────────────────────────
// Supplier portal RFQ header — shows company branding, RFQ number, and contact info.
// Used by SupplierPortalPage in both upload and review phases.

import React from 'react';

interface HeaderProps {
  /** Portal info object containing company/RFQ details */
  info?: {
    companyLogoUrl?: string;
    companyName?: string;
    companyAddress?: string;
    companyPhone?: string;
    rfqNum?: string;
  };
  /** Theme colors — if not provided, uses light-theme defaults */
  colors?: {
    dark?: string;
    muted?: string;
    accent?: string;
    border?: string;
  };
}

export default function Header({ info, colors }: HeaderProps) {
  const dark = colors?.dark || '#1e293b';
  const muted = colors?.muted || '#64748b';
  const accent = colors?.accent || '#2563eb';
  const border = colors?.border || '#e2e8f0';

  return (
    <>
      <div style={{ textAlign: 'center', padding: '10px 0 12px', marginBottom: 16, borderBottom: `1px solid ${border}` }}>
        <span style={{ fontSize: 14, color: muted, letterSpacing: 1 }}>
          Powered by <strong style={{ color: dark }}>ARC Software</strong> &copy; 2026
        </span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 700, color: muted, marginBottom: 4 }}>Request For Quote from</div>
          {info?.companyLogoUrl
            ? <img src={info.companyLogoUrl} alt="Company Logo" style={{ maxHeight: 52, maxWidth: 180, objectFit: 'contain' }} />
            : <div style={{ fontSize: 20, fontWeight: 800, color: accent }}>{info?.companyName || 'Matrix Systems, Inc.'}</div>
          }
          {(info?.companyAddress || info?.companyPhone) && (
            <div style={{ fontSize: 14, color: muted }}>
              {[info?.companyAddress, info?.companyPhone].filter(Boolean).join(' · ')}
            </div>
          )}
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 12, color: muted, letterSpacing: 2, textTransform: 'uppercase' }}>Request for Quote</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: dark }}>{info?.rfqNum || '—'}</div>
        </div>
      </div>
    </>
  );
}
