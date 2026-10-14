import { useQueryClient } from '@tanstack/react-query';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { setTokenProvider } from '../api/client';
import { DEV_AUTH } from './dev';
import type { AuthBackend, AuthStatus } from './types';

type AuthValue = {
  status: AuthStatus; expired: boolean; devMode: boolean;
  signIn: (id: string, secret?: string) => Promise<void>;
  completeNewPassword: (pw: string) => Promise<void>;
  signOut: () => void;
};
const Ctx = createContext<AuthValue | null>(null);

export function AuthProvider({ backend, devMode = DEV_AUTH, children }: { backend: AuthBackend; devMode?: boolean; children: ReactNode }) {
  const qc = useQueryClient();
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [expired, setExpired] = useState(false);

  useEffect(() => {
    setTokenProvider({
      getAccessToken: () => backend.getAccessToken(),
      refresh: () => backend.refresh(),
      onAuthFailure: () => { backend.signOut(); qc.clear(); setExpired(true); setStatus('signedOut'); },
    });
    let live = true;
    backend.restore().then(ok => { if (live) setStatus(ok ? 'signedIn' : 'signedOut'); }, () => { if (live) setStatus('signedOut'); });
    return () => { live = false; setTokenProvider(null); };
  }, [backend, qc]);

  const signIn = useCallback(async (id: string, secret?: string) => {
    const r = await backend.signIn(id, secret);
    setExpired(false);
    setStatus(r === 'ok' ? 'signedIn' : 'newPassword');
  }, [backend]);
  const completeNewPassword = useCallback(async (pw: string) => { await backend.completeNewPassword(pw); setStatus('signedIn'); }, [backend]);
  const signOut = useCallback(() => { backend.signOut(); qc.clear(); setExpired(false); setStatus('signedOut'); }, [backend, qc]);

  const value = useMemo(() => ({ status, expired, devMode, signIn, completeNewPassword, signOut }), [status, expired, devMode, signIn, completeNewPassword, signOut]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAuth must be used inside <AuthProvider>');
  return v;
}
