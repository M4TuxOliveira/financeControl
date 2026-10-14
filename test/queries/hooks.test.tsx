import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as api from '../../src/api/endpoints';
import * as receipt from '../../src/api/receipt';
import * as q from '../../src/queries';

vi.mock('../../src/api/endpoints');
vi.mock('../../src/api/receipt');

function setup() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const spy = vi.spyOn(qc, 'invalidateQueries');
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  return { qc, spy, wrapper };
}
const prefixes = (spy: ReturnType<typeof vi.spyOn>) => spy.mock.calls.map((c: unknown[]) => (c[0] as { queryKey: string[] }).queryKey[0]).sort();

beforeEach(() => { vi.clearAllMocks(); });

describe('queries', () => {
  it('useTransactions passes filters and caches per filter set', async () => {
    vi.mocked(api.listTransactions).mockResolvedValue({ items: [], totals: { income: 0, expense: 0, net: 0 } });
    const { wrapper } = setup();
    const { result } = renderHook(() => q.useTransactions({ month: '2026-10', q: 'x' }), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(api.listTransactions).toHaveBeenCalledWith({ month: '2026-10', q: 'x' });
  });
  it('useBudgets / useOverview pass the month', async () => {
    vi.mocked(api.listBudgets).mockResolvedValue([]);
    vi.mocked(api.getOverview).mockResolvedValue({ month: '2026-10', totalBalance: 0, income: 0, expense: 0, net: 0, openStatementsTotal: 0, recent: [] });
    const { wrapper } = setup();
    renderHook(() => q.useBudgets('2026-10'), { wrapper });
    renderHook(() => q.useOverview('2026-10'), { wrapper });
    await waitFor(() => expect(api.listBudgets).toHaveBeenCalledWith('2026-10'));
    await waitFor(() => expect(api.getOverview).toHaveBeenCalledWith('2026-10'));
  });
});

const ALL = ['accounts', 'budgets', 'cards', 'categories', 'goals', 'me', 'overview', 'transactions'];
const matrix: [string, () => unknown, unknown, string[], () => void][] = [
  ['createTransactions', () => q.useCreateTransactions(), { type: 'expense', amount: 1, date: '2026-10-13', desc: 'x', accountId: 'a' }, ['accounts', 'budgets', 'cards', 'goals', 'overview', 'transactions'], () => vi.mocked(api.createTransactions).mockResolvedValue([])],
  ['updateTransaction', () => q.useUpdateTransaction(), { id: '1', body: {} }, ['accounts', 'budgets', 'cards', 'goals', 'overview', 'transactions'], () => vi.mocked(api.updateTransaction).mockResolvedValue({} as never)],
  ['deleteTransaction', () => q.useDeleteTransaction(), { id: '1', scope: 'one' }, ['accounts', 'budgets', 'cards', 'goals', 'overview', 'transactions'], () => vi.mocked(api.deleteTransaction).mockResolvedValue()],
  ['payCard', () => q.usePayCard(), { id: '1', body: { amount: 1, fromAccountId: 'a', date: '2026-10-13' } }, ['accounts', 'cards', 'overview', 'transactions'], () => vi.mocked(api.payCard).mockResolvedValue({} as never)],
  ['contributeGoal', () => q.useContributeGoal(), { id: '1', body: { amount: 1 } }, ['accounts', 'goals', 'overview', 'transactions'], () => vi.mocked(api.contributeGoal).mockResolvedValue({} as never)],
  ['createAccount', () => q.useCreateAccount(), { name: 'A', kind: 'cash', color: '#000000' }, ['accounts', 'cards', 'goals', 'overview', 'transactions'], () => vi.mocked(api.createAccount).mockResolvedValue({} as never)],
  ['updateAccount', () => q.useUpdateAccount(), { id: '1', body: {} }, ['accounts', 'cards', 'goals', 'overview', 'transactions'], () => vi.mocked(api.updateAccount).mockResolvedValue({} as never)],
  ['deleteAccount (review focus 4)', () => q.useDeleteAccount(), { id: '1', moveTo: '2' }, ['accounts', 'cards', 'goals', 'overview', 'transactions'], () => vi.mocked(api.deleteAccount).mockResolvedValue()],
  ['createCard', () => q.useCreateCard(), { name: 'C', network: 'Visa', limit: 1, closeDay: 1, dueDay: 2, color: '#000000' }, ['cards', 'overview', 'transactions'], () => vi.mocked(api.createCard).mockResolvedValue({} as never)],
  ['updateCard', () => q.useUpdateCard(), { id: '1', body: {} }, ['cards', 'overview', 'transactions'], () => vi.mocked(api.updateCard).mockResolvedValue({} as never)],
  ['deleteCard', () => q.useDeleteCard(), '1', ['cards', 'overview', 'transactions'], () => vi.mocked(api.deleteCard).mockResolvedValue()],
  ['createCategory', () => q.useCreateCategory(), { name: 'X', icon: 'Paw', color: '#000000' }, ['budgets', 'categories', 'overview', 'transactions'], () => vi.mocked(api.createCategory).mockResolvedValue({} as never)],
  ['updateCategory', () => q.useUpdateCategory(), { id: '1', body: {} }, ['budgets', 'categories', 'overview', 'transactions'], () => vi.mocked(api.updateCategory).mockResolvedValue({} as never)],
  ['deleteCategory', () => q.useDeleteCategory(), { id: '1' }, ['budgets', 'categories', 'overview', 'transactions'], () => vi.mocked(api.deleteCategory).mockResolvedValue()],
  ['createBudget', () => q.useCreateBudget(), { categoryId: 'c', limit: 1 }, ['budgets', 'overview'], () => vi.mocked(api.createBudget).mockResolvedValue({} as never)],
  ['updateBudget', () => q.useUpdateBudget(), { id: '1', body: {} }, ['budgets', 'overview'], () => vi.mocked(api.updateBudget).mockResolvedValue({} as never)],
  ['deleteBudget', () => q.useDeleteBudget(), '1', ['budgets', 'overview'], () => vi.mocked(api.deleteBudget).mockResolvedValue()],
  ['createGoal', () => q.useCreateGoal(), { name: 'G', target: 1 }, ['goals', 'overview'], () => vi.mocked(api.createGoal).mockResolvedValue({} as never)],
  ['updateGoal', () => q.useUpdateGoal(), { id: '1', body: {} }, ['goals', 'overview'], () => vi.mocked(api.updateGoal).mockResolvedValue({} as never)],
  ['deleteGoal', () => q.useDeleteGoal(), '1', ['goals', 'overview'], () => vi.mocked(api.deleteGoal).mockResolvedValue()],
  ['uploadReceipt', () => q.useUploadReceipt(), { txId: '1', file: new File(['x'], 'a.png', { type: 'image/png' }) }, ['transactions'], () => vi.mocked(receipt.uploadReceipt).mockResolvedValue()],
  ['updateMe', () => q.useUpdateMe(), { locale: 'en', currency: 'USD', timezone: 'UTC' }, ['me'], () => vi.mocked(api.putMe).mockResolvedValue({} as never)],
  ['importState', () => q.useImportState(), { v: 1 }, ALL, () => vi.mocked(api.importState).mockResolvedValue({} as never)],
];

describe('mutations invalidate the right prefixes (review focus 4)', () => {
  for (const [name, hook, vars, expected, arrange] of matrix) {
    it(name, async () => {
      arrange();
      const { spy, wrapper } = setup();
      const { result } = renderHook(() => hook() as ReturnType<typeof q.useCreateAccount>, { wrapper });
      await act(async () => { await result.current.mutateAsync(vars as never); });
      expect(prefixes(spy as never)).toEqual([...expected].sort());
    });
  }
  it('does not invalidate when the mutation fails', async () => {
    vi.mocked(api.deleteBudget).mockRejectedValue(new Error('boom'));
    const { spy, wrapper } = setup();
    const { result } = renderHook(() => q.useDeleteBudget(), { wrapper });
    await act(async () => { await result.current.mutateAsync('1').catch(() => {}); });
    expect(spy).not.toHaveBeenCalled();
  });
});
