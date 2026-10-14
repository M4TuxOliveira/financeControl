import { AuthenticationDetails, CognitoUser, CognitoUserPool, type CognitoUserSession } from 'amazon-cognito-identity-js';
import { createDevBackend, DEV_AUTH } from './dev';
import type { AuthBackend } from './types';

/**
 * A REAL invalid/expired session: Cognito rejected the refresh token or there is nothing usable stored. Everything else
 * (NetworkError, TypeError 'Failed to fetch', timeouts, throttling, 5xx…) is transient and must not end the session.
 */
export function isInvalidSession(e: unknown): boolean {
  const err = e as { name?: string; code?: string; message?: string } | null;
  if (!err) return false;
  if (err.name === 'NotAuthorizedException' || err.code === 'NotAuthorizedException') return true;
  return /Refresh Token has expired|Invalid Refresh Token|invalid session|Please authenticate|Username is null/i.test(err.message ?? '');
}

const unsupported = (reject: (e: Error) => void) => () => reject(new Error('UNSUPPORTED_CHALLENGE'));

export function createCognitoBackend(cfg: { userPoolId: string; clientId: string }): AuthBackend {
  const pool = new CognitoUserPool({ UserPoolId: cfg.userPoolId, ClientId: cfg.clientId });
  let pending: CognitoUser | null = null;
  /**
   * Resolves the session, `null` when it is really invalid/expired (or missing), and REJECTS with the original error
   * on anything transient (offline, timeout, 5xx…) so callers never mistake a network blip for a dead session.
   */
  const session = (u: CognitoUser) => new Promise<CognitoUserSession | null>((res, rej) => u.getSession((e: Error | null, s: CognitoUserSession | null) => {
    if (e) return isInvalidSession(e) ? res(null) : rej(e);
    res(s && typeof s.isValid === 'function' && s.isValid() ? s : null);
  }));

  return {
    async restore() {
      const u = pool.getCurrentUser();
      if (!u) return false;
      let s: CognitoUserSession | null;
      try { s = await session(u); } catch { return true; } // transient: keep the stored session, the API call retries
      if (!s) { u.signOut(); return false; }
      return true;
    },
    signIn(email, password) {
      return new Promise((resolve, reject) => {
        const user = new CognitoUser({ Username: email, Pool: pool });
        user.authenticateUser(new AuthenticationDetails({ Username: email, Password: password ?? '' }), {
          onSuccess: () => resolve('ok'),
          onFailure: reject,
          newPasswordRequired: () => { pending = user; resolve('newPassword'); },
          mfaRequired: unsupported(reject),
          totpRequired: unsupported(reject),
          mfaSetup: unsupported(reject),
          selectMFAType: unsupported(reject),
          customChallenge: unsupported(reject),
        });
      });
    },
    completeNewPassword(pw) {
      return new Promise<void>((resolve, reject) => {
        if (!pending) return reject(new Error('No pending password challenge'));
        pending.completeNewPasswordChallenge(pw, {}, {
          onSuccess: () => { pending = null; resolve(); },
          onFailure: reject,
          mfaRequired: unsupported(reject),
          totpRequired: unsupported(reject),
          mfaSetup: unsupported(reject),
          selectMFAType: unsupported(reject),
          customChallenge: unsupported(reject),
        });
      });
    },
    async getAccessToken() {
      const u = pool.getCurrentUser();
      const s = u ? await session(u) : null;
      return s ? s.getAccessToken().getJwtToken() : null;
    },
    refresh() {
      return new Promise((resolve, reject) => {
        const u = pool.getCurrentUser();
        if (!u) return resolve(null);
        u.getSession((e: Error | null, s: CognitoUserSession | null) => {
          if (e) return isInvalidSession(e) ? resolve(null) : reject(e);
          if (!s) return resolve(null);
          u.refreshSession(s.getRefreshToken(), (e2: Error | null, s2: CognitoUserSession | null) => {
            if (e2) return isInvalidSession(e2) ? resolve(null) : reject(e2);
            resolve(s2 ? s2.getAccessToken().getJwtToken() : null);
          });
        });
      });
    },
    signOut() { pool.getCurrentUser()?.signOut(); },
  };
}

export function createMissingConfigBackend(): AuthBackend {
  return {
    async restore() { return false; },
    async signIn() { throw new Error('CONFIG'); },
    async completeNewPassword() { throw new Error('CONFIG'); },
    async getAccessToken() { return null; },
    async refresh() { return null; },
    signOut() {},
  };
}

export function pickBackend(): AuthBackend {
  if (DEV_AUTH) return createDevBackend();
  const userPoolId = import.meta.env.VITE_COGNITO_USER_POOL_ID;
  const clientId = import.meta.env.VITE_COGNITO_CLIENT_ID;
  return userPoolId && clientId ? createCognitoBackend({ userPoolId, clientId }) : createMissingConfigBackend();
}
