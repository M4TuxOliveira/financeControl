import { describe, expect, it } from 'vitest';
import { assertSafeEnv } from '../vite.env-guard';

const DEV = { VITE_DEV_AUTH: 'true' };

describe('assertSafeEnv (review focus 5)', () => {
  it('rejects dev auth in a production build', () => {
    expect(() => assertSafeEnv('production', DEV, 'build')).toThrow(/VITE_DEV_AUTH/);
  });
  it('rejects dev auth in any non-development build (e.g. --mode staging)', () => {
    expect(() => assertSafeEnv('staging', DEV, 'build')).toThrow(/VITE_DEV_AUTH/);
    expect(() => assertSafeEnv('test', DEV, 'build')).toThrow(/VITE_DEV_AUTH/);
  });
  it('rejects dev auth whenever the mode is production, even when serving', () => {
    expect(() => assertSafeEnv('production', DEV, 'serve')).toThrow(/VITE_DEV_AUTH/);
  });
  it('allows dev auth when serving in any non-production mode', () => {
    for (const mode of ['development', 'staging', 'test']) expect(() => assertSafeEnv(mode, DEV, 'serve')).not.toThrow();
  });
  it('allows dev auth in a --mode development build', () => {
    expect(() => assertSafeEnv('development', DEV, 'build')).not.toThrow();
  });
  it('never throws without the flag', () => {
    for (const mode of ['production', 'staging', 'development']) {
      for (const command of ['build', 'serve'] as const) {
        expect(() => assertSafeEnv(mode, {}, command)).not.toThrow();
        expect(() => assertSafeEnv(mode, { VITE_DEV_AUTH: 'false' }, command)).not.toThrow();
      }
    }
  });
});
