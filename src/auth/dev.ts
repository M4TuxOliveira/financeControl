import type { AuthBackend } from './types';

export const DEV_AUTH = import.meta.env.VITE_DEV_AUTH === 'true';
const KEY = 'fc:dev-user';
const b64 = (o: object) => btoa(JSON.stringify(o)).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');

/** Unsigned JWT (alg none). Only serverless-offline accepts it; the deployed API rejects it. */
export function mintDevToken(sub: string, nowMs: number = Date.now()): string {
  const iat = Math.floor(nowMs / 1000);
  const header = btoa(JSON.stringify({ alg: 'none', typ: 'JWT' })).replace(/=+$/, '');
  return `${header}.${b64({ sub, iss: 'http://localhost/dev', aud: 'dev', token_use: 'access', iat, exp: iat + 3600 })}.`;
}

export function createDevBackend(): AuthBackend {
  const user = () => sessionStorage.getItem(KEY);
  return {
    async restore() { return user() !== null; },
    async signIn(id) {
      if (!/^[A-Za-z0-9_-]{1,40}$/.test(id)) throw new Error('INVALID_DEV_ID');
      sessionStorage.setItem(KEY, id);
      return 'ok';
    },
    async completeNewPassword() { /* not applicable */ },
    async getAccessToken() { const u = user(); return u ? mintDevToken(u) : null; },
    async refresh() { const u = user(); return u ? mintDevToken(u) : null; },
    signOut() { sessionStorage.removeItem(KEY); },
  };
}
