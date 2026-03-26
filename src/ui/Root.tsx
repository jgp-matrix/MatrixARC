// ─── Root Component ──────────────────────────────────────────────────────────
// Auth state machine: loading → LoginScreen | App
// Handles join invite flow and RFQ supplier portal routing.

import { useState, useEffect } from 'react';
import { C } from '@/core/constants';
import { fbAuth, fbDb } from '@/core/globals';
import LoginScreen from './LoginScreen';
import App from './App';

export default function Root() {
  const [rfqUploadToken] = useState(() => {
    try {
      const p = new URLSearchParams(window.location.search);
      return p.get('rfqUpload') || null;
    } catch { return null; }
  });

  const [user, setUser] = useState<any>(undefined);
  const [redirectDone, setRedirectDone] = useState(false);

  useEffect(() => { setRedirectDone(true); }, []);

  const [joinPayload] = useState(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const j = params.get('join');
      if (!j) return null;
      return JSON.parse(atob(j));
    } catch { return null; }
  });

  useEffect(() => {
    return fbAuth.onAuthStateChanged(u => {
      if (u && joinPayload) {
        if (u.email?.toLowerCase() !== joinPayload.e?.toLowerCase()) {
          fbAuth.signOut();
          return;
        }
        const { c: companyId, r: role } = joinPayload;
        const batch = fbDb.batch();
        batch.set(fbDb.doc(`companies/${companyId}/members/${u.uid}`), { email: u.email, role, addedAt: Date.now() });
        batch.set(fbDb.doc(`users/${u.uid}/config/profile`), { companyId, role }, { merge: true } as any);
        batch.commit()
          .then(() => {
            try {
              const url = new URL(window.location.href);
              url.searchParams.delete('join');
              window.history.replaceState({}, '', url.toString());
            } catch {}
            setUser(u);
          })
          .catch(e => {
            console.error('Failed to accept invite:', e);
            setUser(u);
          });
      } else {
        setUser(u);
      }
    });
  }, [joinPayload]);

  // TODO: Add SupplierPortalPage when migrated
  // if (rfqUploadToken) return <SupplierPortalPage token={rfqUploadToken} />;

  if (user === undefined || !redirectDone) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: C.bg }}>
      <div style={{ color: C.muted, fontSize: 14 }}>Loading…</div>
    </div>
  );

  if (!user) return <LoginScreen invite={joinPayload} />;
  return <App user={user} />;
}
