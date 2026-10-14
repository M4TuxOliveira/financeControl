import { describe, expect, it } from 'vitest';
import { assertSafeEnv } from '../vite.env-guard';

describe('assertSafeEnv (review focus 5)', () => {
  it('rejects dev auth in a production build', () => {
    expect(() => assertSafeEnv('production', { VITE_DEV_AUTH: 'true' })).toThrow(/VITE_DEV_AUTH/);
  });
  it('allows dev auth in development and production without it', () => {
    expect(() => assertSafeEnv('development', { VITE_DEV_AUTH: 'true' })).not.toThrow();
    expect(() => assertSafeEnv('production', {})).not.toThrow();
    expect(() => assertSafeEnv('production', { VITE_DEV_AUTH: 'false' })).not.toThrow();
  });
});
