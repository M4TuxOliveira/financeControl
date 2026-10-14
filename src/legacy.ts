export const LEGACY_KEY = 'financeControl:v1';

export type LegacyCounts = { accounts: number; cards: number; transactions: number; budgets: number; goals: number };

const len = (v: unknown) => (Array.isArray(v) ? v.length : 0);

/** The pre-API localStorage state, if it holds anything worth importing. */
export function readLegacy(): { state: unknown; counts: LegacyCounts } | null {
  try {
    const raw = localStorage.getItem(LEGACY_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as Record<string, unknown> | null;
    if (!s || s.v !== 1) return null;
    const counts: LegacyCounts = {
      accounts: len(s.accounts), cards: len(s.cards), transactions: len(s.transactions), budgets: len(s.budgets), goals: len(s.goals),
    };
    return Object.values(counts).some(n => n > 0) ? { state: s, counts } : null;
  } catch {
    return null;
  }
}

export function clearLegacy(): void {
  try { localStorage.removeItem(LEGACY_KEY); } catch { /* storage unavailable */ }
}
