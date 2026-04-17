// ─── BC Context ──────────────────────────────────────────────────────────────
// Replaces global _bcToken, _bcCompanyId, _msalInstance, _vendorMapCache.

import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';
import { acquireToken, setBcConfig, hasToken, clearToken } from '@/services/businessCentral/auth';
import { setClientConfig } from '@/services/businessCentral/client';
import { loadBcConfig, saveBcConfig } from '@/services/firebase/firestore';
import type { BCConfig } from '@/services/businessCentral/types';

interface BCContextValue {
  bcConfig: BCConfig | null;
  isConnected: boolean;
  isLoading: boolean;
  loadConfig: (companyId: string) => Promise<void>;
  saveConfig: (companyId: string, config: BCConfig) => Promise<void>;
  connect: () => Promise<boolean>;
  disconnect: () => void;
}

const BCContext = createContext<BCContextValue | null>(null);

export function BCProvider({ children }: { children: ReactNode }) {
  const [bcConfig, setBcConfigState] = useState<BCConfig | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const loadConfig = useCallback(async (companyId: string) => {
    const config = await loadBcConfig(companyId);
    if (config) {
      setBcConfigState(config);
      setBcConfig(config);
      setClientConfig(config);
    }
  }, []);

  const saveConfigFn = useCallback(async (companyId: string, config: BCConfig) => {
    await saveBcConfig(companyId, config);
    setBcConfigState(config);
    setBcConfig(config);
    setClientConfig(config);
    setIsConnected(false);
  }, []);

  const connect = useCallback(async (): Promise<boolean> => {
    if (!bcConfig) return false;
    setIsLoading(true);
    try {
      const token = await acquireToken(true);
      setIsConnected(!!token);
      return !!token;
    } finally {
      setIsLoading(false);
    }
  }, [bcConfig]);

  const disconnect = useCallback(() => {
    clearToken();
    setIsConnected(false);
  }, []);

  return (
    <BCContext.Provider value={{ bcConfig, isConnected, isLoading, loadConfig, saveConfig: saveConfigFn, connect, disconnect }}>
      {children}
    </BCContext.Provider>
  );
}

export function useBC(): BCContextValue {
  const ctx = useContext(BCContext);
  if (!ctx) throw new Error('useBC must be used within BCProvider');
  return ctx;
}
