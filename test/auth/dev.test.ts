import { describe, expect, it } from 'vitest';
import { createDevBackend, mintDevToken } from '../../src/auth/dev';

const decode = (t: string) => JSON.parse(atob(t.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));

describe('mintDevToken', () => {
  it('is an unsigned JWT carrying the claims serverless-offline needs', () => {
    const t = mintDevToken('alice', 1_800_000_000_000);
    const [h, p, s] = t.split('.');
    expect(s).toBe('');
    expect(JSON.parse(atob(h))).toEqual({ alg: 'none', typ: 'JWT' });
    expect(decode(t)).toMatchObject({ sub: 'alice', iat: 1_800_000_000, exp: 1_800_003_600, token_use: 'access' });
    expect(p).not.toMatch(/[=+/]/);
  });
});

describe('dev backend (review focus 5)', () => {
  it('signs in with a valid id, restores from sessionStorage and signs out', async () => {
    const b = createDevBackend();
    expect(await b.restore()).toBe(false);
    expect(await b.signIn('dev-1')).toBe('ok');
    expect(decode((await b.getAccessToken())!).sub).toBe('dev-1');
    expect(await createDevBackend().restore()).toBe(true);
    b.signOut();
    expect(await b.getAccessToken()).toBeNull();
    expect(await createDevBackend().restore()).toBe(false);
  });
  it('rejects invalid ids', async () => {
    const b = createDevBackend();
    await expect(b.signIn('')).rejects.toThrow('INVALID_DEV_ID');
    await expect(b.signIn('a b')).rejects.toThrow('INVALID_DEV_ID');
    await expect(b.signIn('x'.repeat(41))).rejects.toThrow('INVALID_DEV_ID');
  });
  it('refresh re-mints for the same user', async () => {
    const b = createDevBackend();
    await b.signIn('bob');
    expect(decode((await b.refresh())!).sub).toBe('bob');
  });
});
