import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import type { Meta, PublicUser } from '../../shared/types';
import { setLocals } from '../../shared/locals';
import { api, getToken, setToken } from '../lib/api';

interface AuthContextValue {
  user: PublicUser | null;
  meta: Meta | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  refresh: () => Promise<void>;
  refreshMeta: () => Promise<Meta | null>;
  updateMeta: (next: Meta) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<PublicUser | null>(null);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [loading, setLoading] = useState(true);

  const updateMeta = useCallback((next: Meta) => {
    setMeta(next);
    setLocals(next.locals);
  }, []);

  const refreshMeta = useCallback(async (): Promise<Meta | null> => {
    try {
      const result = await api.getMeta();
      updateMeta(result.meta);
      return result.meta;
    } catch {
      return null;
    }
  }, [updateMeta]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const metaPromise = api.getMeta().catch(() => null);
      if (!getToken()) {
        const metaResult = await metaPromise;
        if (!cancelled) {
          if (metaResult) updateMeta(metaResult.meta);
          setLoading(false);
        }
        return;
      }
      try {
        const [meResult, metaResult] = await Promise.all([api.me(), metaPromise]);
        if (!cancelled) {
          setUser(meResult.user);
          if (metaResult) updateMeta(metaResult.meta);
        }
      } catch {
        setToken(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [updateMeta]);

  useEffect(() => {
    const handler = () => {
      setUser(null);
    };
    window.addEventListener('lbt:unauthorized', handler);
    return () => window.removeEventListener('lbt:unauthorized', handler);
  }, []);

  async function login(email: string, password: string) {
    const result = await api.login(email, password);
    setToken(result.token);
    setUser(result.user);
    await refreshMeta();
  }

  function logout() {
    setToken(null);
    setUser(null);
  }

  async function refresh() {
    const result = await api.me();
    setUser(result.user);
  }

  return (
    <AuthContext.Provider
      value={{ user, meta, loading, login, logout, refresh, refreshMeta, updateMeta }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth harus dipakai di dalam AuthProvider');
  return context;
}
