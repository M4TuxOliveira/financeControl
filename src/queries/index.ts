import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as api from '../api/endpoints';
import { uploadReceipt } from '../api/receipt';
import type {
  AccountInput, BudgetInput, CardInput, CategoryInput, ContributeInput, DeleteScope, GoalInput, Me, PayInput, TxCreateInput, TxFilters, TxInput,
} from '../api/types';
import { INVALIDATES, qk } from './keys';

export { qk, INVALIDATES } from './keys';

/* ---------- queries ---------- */
export const useAccounts = () => useQuery({ queryKey: qk.accounts, queryFn: api.listAccounts });
export const useCards = () => useQuery({ queryKey: qk.cards, queryFn: api.listCards });
export const useCategories = () => useQuery({ queryKey: qk.categories, queryFn: api.listCategories });
export const useGoals = () => useQuery({ queryKey: qk.goals, queryFn: api.listGoals });
export const useMe = () => useQuery({ queryKey: qk.me, queryFn: api.getMe, staleTime: Infinity });
export const useTransactions = (filters: TxFilters) => useQuery({ queryKey: [...qk.transactions, filters], queryFn: () => api.listTransactions(filters) });
export const useBudgets = (month?: string) => useQuery({ queryKey: [...qk.budgets, month ?? null], queryFn: () => api.listBudgets(month) });
export const useOverview = (month?: string) => useQuery({ queryKey: [...qk.overview, month ?? null], queryFn: () => api.getOverview(month) });

/* ---------- mutations ---------- */
function useApiMutation<V, R>(fn: (v: V) => Promise<R>, keys: readonly (readonly string[])[]) {
  const qc = useQueryClient();
  return useMutation<R, Error, V>({
    mutationFn: fn,
    onSuccess: async () => { await Promise.all(keys.map(k => qc.invalidateQueries({ queryKey: k as string[] }))); },
  });
}
type Upd<B> = { id: string; body: B };

export const useCreateAccount = () => useApiMutation((v: AccountInput) => api.createAccount(v), INVALIDATES.account);
export const useUpdateAccount = () => useApiMutation((v: Upd<Partial<AccountInput>>) => api.updateAccount(v.id, v.body), INVALIDATES.account);
export const useDeleteAccount = () => useApiMutation((v: { id: string; moveTo?: string }) => api.deleteAccount(v.id, v.moveTo), INVALIDATES.account);

export const useCreateCard = () => useApiMutation((v: CardInput) => api.createCard(v), INVALIDATES.card);
export const useUpdateCard = () => useApiMutation((v: Upd<Partial<CardInput>>) => api.updateCard(v.id, v.body), INVALIDATES.card);
export const useDeleteCard = () => useApiMutation((id: string) => api.deleteCard(id), INVALIDATES.card);
export const usePayCard = () => useApiMutation((v: Upd<PayInput>) => api.payCard(v.id, v.body), INVALIDATES.payCard);

export const useCreateCategory = () => useApiMutation((v: CategoryInput) => api.createCategory(v), INVALIDATES.category);
export const useUpdateCategory = () => useApiMutation((v: Upd<Partial<CategoryInput>>) => api.updateCategory(v.id, v.body), INVALIDATES.category);
export const useDeleteCategory = () => useApiMutation((v: { id: string; moveTo?: string }) => api.deleteCategory(v.id, v.moveTo), INVALIDATES.category);

export const useCreateTransactions = () => useApiMutation((v: TxCreateInput) => api.createTransactions(v), INVALIDATES.transaction);
export const useUpdateTransaction = () => useApiMutation((v: Upd<TxInput>) => api.updateTransaction(v.id, v.body), INVALIDATES.transaction);
export const useDeleteTransaction = () => useApiMutation((v: { id: string; scope: DeleteScope }) => api.deleteTransaction(v.id, v.scope), INVALIDATES.transaction);
export const useUploadReceipt = () => useApiMutation((v: { txId: string; file: File }) => uploadReceipt(v.txId, v.file), INVALIDATES.receipt);

export const useCreateBudget = () => useApiMutation((v: BudgetInput) => api.createBudget(v), INVALIDATES.budget);
export const useUpdateBudget = () => useApiMutation((v: Upd<Partial<BudgetInput>>) => api.updateBudget(v.id, v.body), INVALIDATES.budget);
export const useDeleteBudget = () => useApiMutation((id: string) => api.deleteBudget(id), INVALIDATES.budget);

export const useCreateGoal = () => useApiMutation((v: GoalInput) => api.createGoal(v), INVALIDATES.goal);
export const useUpdateGoal = () => useApiMutation((v: Upd<Partial<GoalInput>>) => api.updateGoal(v.id, v.body), INVALIDATES.goal);
export const useDeleteGoal = () => useApiMutation((id: string) => api.deleteGoal(id), INVALIDATES.goal);
export const useContributeGoal = () => useApiMutation((v: Upd<ContributeInput>) => api.contributeGoal(v.id, v.body), INVALIDATES.contribute);

export const useUpdateMe = () => useApiMutation((v: Me) => api.putMe(v), INVALIDATES.me);
export const useImportState = () => useApiMutation((v: unknown) => api.importState(v), INVALIDATES.import);
