import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('amazon-cognito-identity-js', () => {
  const state = { current: null as unknown, result: 'success' as string, valid: true, signedOutCalled: false };
  class CognitoUserPool { constructor(public cfg: unknown) {} getCurrentUser() { return state.current; } }
  class CognitoUser {
    constructor(public o: unknown) {}
    authenticateUser(_d: unknown, cb: { onSuccess: (r: unknown) => void; onFailure: (e: Error) => void; newPasswordRequired: (a: unknown) => void }) {
      if (state.result === 'success') { state.current = this; cb.onSuccess({}); }
      else if (state.result === 'fail') cb.onFailure(new Error('NotAuthorizedException'));
      else if (state.result === 'newPassword') cb.newPasswordRequired({});
      else (cb as unknown as Record<string, (a: unknown) => void>)[state.result]({});
    }
    completeNewPasswordChallenge(_p: string, _a: unknown, cb: { onSuccess: (r: unknown) => void }) {
      if (state.result.startsWith('c:')) return (cb as unknown as Record<string, () => void>)[state.result.slice(2)]();
      state.current = this; cb.onSuccess({});
    }
    signedOut = false;
    getSession(cb: (e: Error | null, s: unknown) => void) {
      cb(null, { isValid: () => state.valid, getAccessToken: () => ({ getJwtToken: () => 'access-1' }), getRefreshToken: () => ({}) });
    }
    refreshSession(_t: unknown, cb: (e: Error | null, s: unknown) => void) { cb(null, { getAccessToken: () => ({ getJwtToken: () => 'access-2' }) }); }
    signOut() { state.current = null; state.signedOutCalled = true; }
  }
  class AuthenticationDetails { constructor(public d: unknown) {} }
  return { CognitoUserPool, CognitoUser, AuthenticationDetails, __state: state };
});

import * as lib from 'amazon-cognito-identity-js';
import { createCognitoBackend, createMissingConfigBackend } from '../../src/auth/cognito';

const st = (lib as unknown as { __state: { current: unknown; result: string; valid: boolean; signedOutCalled: boolean } }).__state;
const make = () => createCognitoBackend({ userPoolId: 'sa-east-1_x', clientId: 'c' });
beforeEach(() => { st.current = null; st.result = 'success'; st.valid = true; st.signedOutCalled = false; });

describe('cognito backend', () => {
  it.each(['mfaRequired', 'totpRequired', 'mfaSetup', 'selectMFAType', 'customChallenge'])('sign-in %s rejects instead of hanging', async name => {
    st.result = name;
    await expect(make().signIn('a@b.c', 'pw')).rejects.toThrow('UNSUPPORTED_CHALLENGE');
  }, 1000);
  it.each(['mfaRequired', 'totpRequired', 'mfaSetup', 'selectMFAType', 'customChallenge'])('new-password %s rejects instead of hanging', async name => {
    st.result = 'newPassword';
    const b = make();
    await b.signIn('a@b.c', 'tmp');
    st.result = 'c:' + name;
    await expect(b.completeNewPassword('x')).rejects.toThrow('UNSUPPORTED_CHALLENGE');
  }, 1000);
  it('restore removes a dead stored user when the session is invalid', async () => {
    const b = make();
    await b.signIn('a@b.c', 'pw');
    st.valid = false;
    expect(await b.restore()).toBe(false);
    expect(st.signedOutCalled).toBe(true);
  });
  it('restore is false with no current user, true once signed in', async () => {
    const b = make();
    expect(await b.restore()).toBe(false);
    expect(await b.signIn('a@b.c', 'pw')).toBe('ok');
    expect(await b.restore()).toBe(true);
    expect(await b.getAccessToken()).toBe('access-1');
  });
  it('failed sign-in rejects', async () => {
    st.result = 'fail';
    await expect(make().signIn('a@b.c', 'bad')).rejects.toThrow('NotAuthorizedException');
  });
  it('new-password challenge is surfaced and completed', async () => {
    st.result = 'newPassword';
    const b = make();
    expect(await b.signIn('a@b.c', 'tmp')).toBe('newPassword');
    await b.completeNewPassword('Perm4nent!pass');
    expect(await b.getAccessToken()).toBe('access-1');
  });
  it('completeNewPassword without a pending challenge rejects', async () => {
    await expect(make().completeNewPassword('x')).rejects.toThrow();
  });
  it('refresh returns a new access token; signOut clears the session', async () => {
    const b = make();
    await b.signIn('a@b.c', 'pw');
    expect(await b.refresh()).toBe('access-2');
    b.signOut();
    expect(await b.getAccessToken()).toBeNull();
    expect(await b.refresh()).toBeNull();
  });
  it('missing-config backend never signs in', async () => {
    const b = createMissingConfigBackend();
    expect(await b.restore()).toBe(false);
    await expect(b.signIn('a', 'b')).rejects.toThrow('CONFIG');
  });
});
