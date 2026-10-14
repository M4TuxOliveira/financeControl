import { beforeEach, describe, expect, it, vi } from 'vitest';

beforeEach(() => { vi.resetModules(); });

describe('prefs', () => {
  it('defaults to system theme and empty name', async () => {
    const { getPrefs } = await import('../src/prefs');
    expect(getPrefs()).toEqual({ theme: 'system', userName: '' });
  });
  it('seeds from legacy state once, then persists changes', async () => {
    localStorage.setItem('financeControl:v1', JSON.stringify({ v: 1, theme: 'dark', userName: 'Matheus', accounts: [] }));
    const { getPrefs, setPrefs } = await import('../src/prefs');
    expect(getPrefs()).toEqual({ theme: 'dark', userName: 'Matheus' });
    setPrefs({ theme: 'light' });
    expect(JSON.parse(localStorage.getItem('financeControl:prefs')!)).toEqual({ theme: 'light', userName: 'Matheus' });
  });
  it('ignores corrupted storage', async () => {
    localStorage.setItem('financeControl:prefs', '{nope');
    const { getPrefs } = await import('../src/prefs');
    expect(getPrefs().theme).toBe('system');
  });
});
