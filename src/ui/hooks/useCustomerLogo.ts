// ─── Customer Logo Hook ──────────────────────────────────────────────────────
// Loads a customer logo URL from Clearbit API based on customer name.

import { useState, useEffect } from 'react';

const _logoCache: Record<string, string | null> = {};

export default function useCustomerLogo(name: string | null): string | null {
  const [logo, setLogo] = useState<string | null>(() => {
    if (!name) return null;
    const k = name.toLowerCase().trim();
    return k in _logoCache ? _logoCache[k] : null;
  });

  useEffect(() => {
    if (!name) return;
    const k = name.toLowerCase().trim();
    if (k in _logoCache) { setLogo(_logoCache[k]); return; }
    setLogo(null);
    fetch(`https://autocomplete.clearbit.com/v1/companies/suggest?query=${encodeURIComponent(k)}`)
      .then(r => r.json())
      .then(d => { const url = d && d[0]?.logo || null; _logoCache[k] = url; setLogo(url); })
      .catch(() => { _logoCache[k] = null; setLogo(null); });
  }, [name]);

  return logo || null;
}
