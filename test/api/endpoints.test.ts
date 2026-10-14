import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as client from '../../src/api/client';
import * as api from '../../src/api/endpoints';

vi.mock('../../src/api/client', async importOriginal => ({ ...(await importOriginal<typeof client>()), request: vi.fn(async () => undefined) }));
const req = vi.mocked(client.request);
beforeEach(() => req.mockClear());

const cases: [string, () => unknown, string, string, object?][] = [
  ['listAccounts', () => api.listAccounts(), 'GET', '/accounts'],
  ['createAccount', () => api.createAccount({ name: 'A', kind: 'cash', color: '#000000' }), 'POST', '/accounts', { body: { name: 'A', kind: 'cash', color: '#000000' } }],
  ['updateAccount', () => api.updateAccount('1', { name: 'B' }), 'PUT', '/accounts/1', { body: { name: 'B' } }],
  ['deleteAccount', () => api.deleteAccount('1', '2'), 'DELETE', '/accounts/1', { query: { moveTo: '2' } }],
  ['listCards', () => api.listCards(), 'GET', '/cards'],
  ['createCard', () => api.createCard({ name: 'C', network: 'Visa', limit: 1, closeDay: 1, dueDay: 2, color: '#000000' }), 'POST', '/cards', { body: { name: 'C', network: 'Visa', limit: 1, closeDay: 1, dueDay: 2, color: '#000000' } }],
  ['updateCard', () => api.updateCard('1', { limit: 5 }), 'PUT', '/cards/1', { body: { limit: 5 } }],
  ['deleteCard', () => api.deleteCard('1'), 'DELETE', '/cards/1'],
  ['payCard', () => api.payCard('1', { amount: 5, fromAccountId: 'a', date: '2026-10-13' }), 'POST', '/cards/1/pay', { body: { amount: 5, fromAccountId: 'a', date: '2026-10-13' } }],
  ['listCategories', () => api.listCategories(), 'GET', '/categories'],
  ['createCategory', () => api.createCategory({ name: 'X', icon: 'Paw', color: '#000000' }), 'POST', '/categories', { body: { name: 'X', icon: 'Paw', color: '#000000' } }],
  ['updateCategory', () => api.updateCategory('1', { name: 'Y' }), 'PUT', '/categories/1', { body: { name: 'Y' } }],
  ['deleteCategory', () => api.deleteCategory('1', 'z'), 'DELETE', '/categories/1', { query: { moveTo: 'z' } }],
  ['listTransactions', () => api.listTransactions({ month: '2026-10', tag: '#a' }), 'GET', '/transactions', { query: { month: '2026-10', tag: '#a' } }],
  ['createTransactions', () => api.createTransactions({ type: 'expense', amount: 1, date: '2026-10-13', desc: 'x', accountId: 'a', installments: 3 }), 'POST', '/transactions', { body: { type: 'expense', amount: 1, date: '2026-10-13', desc: 'x', accountId: 'a', installments: 3 } }],
  ['updateTransaction', () => api.updateTransaction('1', { type: 'expense', amount: 1, date: '2026-10-13', desc: 'x', accountId: 'a' }), 'PUT', '/transactions/1', { body: { type: 'expense', amount: 1, date: '2026-10-13', desc: 'x', accountId: 'a' } }],
  ['deleteTransaction', () => api.deleteTransaction('1', 'future'), 'DELETE', '/transactions/1', { query: { scope: 'future' } }],
  ['issueReceipt', () => api.issueReceipt('1', 'image/png'), 'POST', '/transactions/1/receipt', { body: { contentType: 'image/png' } }],
  ['listBudgets', () => api.listBudgets('2026-10'), 'GET', '/budgets', { query: { month: '2026-10' } }],
  ['createBudget', () => api.createBudget({ categoryId: 'c', limit: 5 }), 'POST', '/budgets', { body: { categoryId: 'c', limit: 5 } }],
  ['updateBudget', () => api.updateBudget('1', { limit: 6 }), 'PUT', '/budgets/1', { body: { limit: 6 } }],
  ['deleteBudget', () => api.deleteBudget('1'), 'DELETE', '/budgets/1'],
  ['listGoals', () => api.listGoals(), 'GET', '/goals'],
  ['createGoal', () => api.createGoal({ name: 'G', target: 5 }), 'POST', '/goals', { body: { name: 'G', target: 5 } }],
  ['updateGoal', () => api.updateGoal('1', { saved: 2 }), 'PUT', '/goals/1', { body: { saved: 2 } }],
  ['deleteGoal', () => api.deleteGoal('1'), 'DELETE', '/goals/1'],
  ['contributeGoal', () => api.contributeGoal('1', { amount: 5 }), 'POST', '/goals/1/contribute', { body: { amount: 5 } }],
  ['getOverview', () => api.getOverview('2026-10'), 'GET', '/overview', { query: { month: '2026-10' } }],
  ['getMe', () => api.getMe(), 'GET', '/me'],
  ['putMe', () => api.putMe({ locale: 'en', currency: 'USD', timezone: 'UTC' }), 'PUT', '/me', { body: { locale: 'en', currency: 'USD', timezone: 'UTC' } }],
  ['importState', () => api.importState({ v: 1 }), 'POST', '/import', { body: { v: 1 } }],
];

describe('endpoints map to the 31 backend routes', () => {
  it('covers 31 routes', () => expect(cases).toHaveLength(31));
  for (const [name, call, method, path, opts] of cases) {
    it(name, async () => {
      await call();
      expect(req).toHaveBeenCalledWith(method, path, ...(opts ? [opts] : []));
    });
  }
});
