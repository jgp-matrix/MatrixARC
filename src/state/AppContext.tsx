// ─── App Context ─────────────────────────────────────────────────────────────
// Replaces the global _appCtx, _apiKey, _pricingConfig mutable variables.

import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import type { AppContext as AppCtxType, PricingConfig, UserRole } from '@/core/types';
import { PRICING_DEFAULTS } from '@/core/constants';
import { loadApiKey, loadPricingConfig, loadUserProfile } from '@/services/firebase/firestore';
import { setApiKey } from '@/services/anthropic/client';

interface AppState {
  uid: string | null;
  companyId: string | null;
  role: UserRole | null;
  projectsPath: string | null;
  configPath: string | null;
  apiKey: string | null;
  pricingConfig: PricingConfig;
  isReadOnly: boolean;
  isAdmin: boolean;
}

interface AppContextValue extends AppState {
  setUid: (uid: string | null) => void;
  setCompanyId: (companyId: string | null) => void;
  setRole: (role: UserRole | null) => void;
  refreshConfig: () => Promise<void>;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AppState>({
    uid: null,
    companyId: null,
    role: null,
    projectsPath: null,
    configPath: null,
    apiKey: null,
    pricingConfig: { ...PRICING_DEFAULTS },
    isReadOnly: false,
    isAdmin: false,
  });

  function setUid(uid: string | null) {
    setState(s => ({ ...s, uid }));
  }

  function setCompanyId(companyId: string | null) {
    const projectsPath = companyId ? `companies/${companyId}/projects` : state.uid ? `users/${state.uid}/projects` : null;
    const configPath = companyId ? `companies/${companyId}/config` : state.uid ? `users/${state.uid}/config` : null;
    setState(s => ({ ...s, companyId, projectsPath, configPath }));
  }

  function setRole(role: UserRole | null) {
    setState(s => ({
      ...s,
      role,
      isReadOnly: role === 'view',
      isAdmin: !!s.companyId && role === 'admin',
    }));
  }

  async function refreshConfig() {
    if (!state.uid) return;

    const apiKey = await loadApiKey(state.uid);
    setApiKey(apiKey);

    const configPath = state.configPath || `users/${state.uid}/config`;
    const pricingConfig = await loadPricingConfig(configPath) || { ...PRICING_DEFAULTS };

    setState(s => ({ ...s, apiKey, pricingConfig }));
  }

  // Load user profile when uid changes
  useEffect(() => {
    if (!state.uid) return;

    (async () => {
      const profile = await loadUserProfile(state.uid!);
      if (profile.companyId) {
        setCompanyId(profile.companyId);
        setRole(profile.role as UserRole);
      } else {
        setCompanyId(null);
        setRole(null);
        setState(s => ({
          ...s,
          projectsPath: `users/${state.uid}/projects`,
          configPath: `users/${state.uid}/config`,
        }));
      }
      await refreshConfig();
    })();
  }, [state.uid]);

  return (
    <AppContext.Provider value={{ ...state, setUid, setCompanyId, setRole, refreshConfig }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}
