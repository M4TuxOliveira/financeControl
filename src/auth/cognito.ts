import { AuthenticationDetails, CognitoUser, CognitoUserPool, type CognitoUserSession } from 'amazon-cognito-identity-js';
import { createDevBackend, DEV_AUTH } from './dev';
import type { AuthBackend } from './types';

export function createCognitoBackend(cfg: { userPoolId: string; clientId: string }): AuthBackend {
  const pool = new CognitoUserPool({ UserPoolId: cfg.userPoolId, ClientId: cfg.clientId });
  let pending: CognitoUser | null = null;
  const session = (u: CognitoUser) => new Promise<CognitoUserSession | null>(res => u.getSession((e: Error | null, s: CognitoUserSession | null) => res(e ? null : s)));

  return {
    async restore() {
      const u = pool.getCurrentUser();
      return u ? !!(await session(u)) : false;
    },
    signIn(email, password) {
      return new Promise((resolve, reject) => {
        const user = new CognitoUser({ Username: email, Pool: pool });
        user.authenticateUser(new AuthenticationDetails({ Username: email, Password: password ?? '' }), {
          onSuccess: () => resolve('ok'),
          onFailure: reject,
          newPasswordRequired: () => { pending = user; resolve('newPassword'); },
        });
      });
    },
    completeNewPassword(pw) {
      return new Promise<void>((resolve, reject) => {
        if (!pending) return reject(new Error('No pending password challenge'));
        pending.completeNewPasswordChallenge(pw, {}, { onSuccess: () => { pending = null; resolve(); }, onFailure: reject });
      });
    },
    async getAccessToken() {
      const u = pool.getCurrentUser();
      const s = u ? await session(u) : null;
      return s ? s.getAccessToken().getJwtToken() : null;
    },
    refresh() {
      return new Promise(resolve => {
        const u = pool.getCurrentUser();
        if (!u) return resolve(null);
        u.getSession((e: Error | null, s: CognitoUserSession | null) => {
          if (e || !s) return resolve(null);
          u.refreshSession(s.getRefreshToken(), (e2: Error | null, s2: CognitoUserSession | null) => resolve(e2 || !s2 ? null : s2.getAccessToken().getJwtToken()));
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
