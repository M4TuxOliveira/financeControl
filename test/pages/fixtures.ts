import { vi } from 'vitest';
import * as api from '../../src/api/endpoints';
import type { Account, Budget, Card, Category, Goal, Overview, Statement, Tx } from '../../src/api/types';

export const CATS: Category[] = [
  { id: 'sys:food', name: 'Food', parentId: null, icon: 'Food', color: '#C2410C', system: true, key: 'food' },
  { id: 'sys:food.delivery', name: 'Delivery', parentId: 'sys:food', icon: 'Food', color: '#C2410C', system: true, key: 'food.delivery' },
  { id: 'sys:groceries', name: 'Groceries', parentId: null, icon: 'Cart', color: '#3D5A0E', system: true, key: 'groceries' },
  { id: 'sys:groceries.bakery', name: 'Bakery', parentId: 'sys:groceries', icon: 'Cart', color: '#3D5A0E', system: true, key: 'groceries.bakery' },
  { id: 'c-pets', name: 'Pets', parentId: null, icon: 'Paw', color: '#6E3FA0', system: false },
];
export const account = (o: Partial<Account> = {}): Account => ({
  id: 'a1', name: 'Itaú', kind: 'checking', bank: 'Itaú Unibanco', opening: 100000, color: '#1F4E79', inTotal: true, archived: false, balance: 721455, ...o,
});
export const statement = (o: Partial<Statement> = {}): Statement => ({
  key: '2026-10', total: 231844, paid: 0, status: 'open', due: '2026-10-10', range: { start: '2026-09-04', end: '2026-10-03' }, items: [], ...o,
});
export const card = (o: Partial<Card> = {}): Card => ({
  id: 'k1', name: 'Nubank', network: 'Mastercard', limit: 600000, closeDay: 3, dueDay: 10, color: '#6E3FA0', payAccountId: 'a1',
  used: 231844, statements: [statement()], ...o,
});
export const tx = (o: Partial<Tx> = {}): Tx => ({
  id: 't1', type: 'expense', amount: 8690, date: '2026-10-13', desc: 'iFood', accountId: 'k1', categoryId: 'sys:food.delivery', tags: [], note: '', ...o,
});
export const budget = (o: Partial<Budget> = {}): Budget => ({ id: 'b1', categoryId: 'sys:food', limit: 50000, alertPct: 85, spent: 25000, pct: 50, ...o });
export const goal = (o: Partial<Goal> = {}): Goal => ({
  id: 'g1', name: 'Viagem', accountId: 'a2', target: 300000, targetDate: '2027-01', saved: 90000, pct: 30, left: 210000, monthsLeft: 3, monthlyNeeded: 70000, ...o,
});
export const overview = (o: Partial<Overview> = {}): Overview => ({
  month: '2026-10', totalBalance: 1843290, income: 980000, expense: 421537, net: 558463, openStatementsTotal: 231844, recent: [], ...o,
});

type Fn = keyof typeof api;
/** Resets the auto-mocked endpoints module with empty defaults; `over` maps function name → resolved value. */
export function mockApi(over: Partial<Record<Fn, unknown>> = {}) {
  const mocked = api as unknown as Record<string, ReturnType<typeof vi.fn>>;
  const defaults: Partial<Record<Fn, unknown>> = {
    listAccounts: [], listCards: [], listCategories: CATS, listGoals: [], listBudgets: [],
    listTransactions: { items: [], totals: { income: 0, expense: 0, net: 0 } }, getOverview: overview(),
    getMe: { locale: 'pt-BR', currency: 'BRL', timezone: 'America/Sao_Paulo' },
  };
  for (const [k, v] of Object.entries({ ...defaults, ...over })) mocked[k].mockReset().mockResolvedValue(v);
  for (const k of Object.keys(mocked)) if (!(k in defaults) && !(k in over)) mocked[k].mockReset().mockResolvedValue(undefined);
}
