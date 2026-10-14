import { describe, expect, it } from 'vitest';
import { clearLegacy, readLegacy } from '../src/legacy';

const put = (o: unknown) => localStorage.setItem('financeControl:v1', JSON.stringify(o));
const base = { v: 1, accounts: [], cards: [], categories: [], transactions: [], budgets: [], goals: [] };

describe('readLegacy', () => {
  it('returns null when nothing is stored', () => expect(readLegacy()).toBeNull());
  it('returns null for corrupted, wrong-version or all-empty data', () => {
    localStorage.setItem('financeControl:v1', '{x');
    expect(readLegacy()).toBeNull();
    put({ ...base, v: 2, accounts: [{}] });
    expect(readLegacy()).toBeNull();
    put(base);
    expect(readLegacy()).toBeNull();
  });
  it('returns the state and counts when there is user data', () => {
    put({ ...base, accounts: [{ id: 'a' }], transactions: [{ id: 't1' }, { id: 't2' }] });
    const r = readLegacy()!;
    expect(r.counts).toEqual({ accounts: 1, cards: 0, transactions: 2, budgets: 0, goals: 0 });
    expect((r.state as { v: number }).v).toBe(1);
  });
  it('clearLegacy removes it', () => {
    put({ ...base, accounts: [{ id: 'a' }] });
    clearLegacy();
    expect(readLegacy()).toBeNull();
    expect(localStorage.getItem('financeControl:v1')).toBeNull();
  });
});
