import { useQueryClient } from '@tanstack/react-query';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
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
  const touched = useRef(0);

  useEffect(() => {
    setTokenProvider({
      getAccessToken: () => backend.getAccessToken(),
      refresh: () => backend.refresh(),
      onAuthFailure: () => { touched.current++; backend.signOut(); qc.clear(); setExpired(true); setStatus('signedOut'); },
    });
    let live = true;
    const seq = touched.current;
    const settle = (v: AuthStatus) => { if (live && touched.current === seq) setStatus(v); };
    backend.restore().then(ok => settle(ok ? 'signedIn' : 'signedOut'), () => settle('signedOut'));
    return () => { live = false; setTokenProvider(null); };
  }, [backend, qc]);

  const signIn = useCallback(async (id: string, secret?: string) => {
    const r = await backend.signIn(id, secret);
    touched.current++;
    setExpired(false);
    setStatus(r === 'ok' ? 'signedIn' : 'newPassword');
  }, [backend]);
  const completeNewPassword = useCallback(async (pw: string) => { await backend.completeNewPassword(pw); touched.current++; setExpired(false); setStatus('signedIn'); }, [backend]);
  const signOut = useCallback(() => { touched.current++; backend.signOut(); qc.clear(); setExpired(false); setStatus('signedOut'); }, [backend, qc]);

  const value = useMemo(() => ({ status, expired, devMode, signIn, completeNewPassword, signOut }), [status, expired, devMode, signIn, completeNewPassword, signOut]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAuth must be used inside <AuthProvider>');
  return v;
}
