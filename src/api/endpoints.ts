import { request } from './client';
import type {
  Account, AccountInput, Budget, BudgetInput, Card, CardInput, CreatedCard, SavedBudget, Category, CategoryInput, ContributeInput, DeleteScope, Goal, GoalInput,
  ImportResult, Me, Overview, PayInput, ReceiptUpload, Tx, TxCreateInput, TxFilters, TxInput, TxList,
} from './types';

// accounts
export const listAccounts = () => request<Account[]>('GET', '/accounts');
export const createAccount = (body: AccountInput) => request<Account>('POST', '/accounts', { body });
export const updateAccount = (id: string, body: Partial<AccountInput>) => request<Account>('PUT', `/accounts/${id}`, { body });
export const deleteAccount = (id: string, moveTo?: string) => request<void>('DELETE', `/accounts/${id}`, { query: { moveTo } });
// cards
export const listCards = () => request<Card[]>('GET', '/cards');
export const createCard = (body: CardInput) => request<CreatedCard>('POST', '/cards', { body });
export const updateCard = (id: string, body: Partial<CardInput>) => request<Card>('PUT', `/cards/${id}`, { body });
export const deleteCard = (id: string) => request<void>('DELETE', `/cards/${id}`);
export const payCard = (id: string, body: PayInput) => request<Tx>('POST', `/cards/${id}/pay`, { body });
// categories
export const listCategories = () => request<Category[]>('GET', '/categories');
export const createCategory = (body: CategoryInput) => request<Category>('POST', '/categories', { body });
export const updateCategory = (id: string, body: Partial<CategoryInput>) => request<Category>('PUT', `/categories/${id}`, { body });
export const deleteCategory = (id: string, moveTo?: string) => request<void>('DELETE', `/categories/${id}`, { query: { moveTo } });
// transactions
export const listTransactions = (f: TxFilters = {}) => request<TxList>('GET', '/transactions', { query: { ...f } });
export const createTransactions = (body: TxCreateInput) => request<Tx[]>('POST', '/transactions', { body });
export const updateTransaction = (id: string, body: TxInput) => request<Tx>('PUT', `/transactions/${id}`, { body });
export const deleteTransaction = (id: string, scope: DeleteScope = 'one') => request<void>('DELETE', `/transactions/${id}`, { query: { scope } });
export const issueReceipt = (id: string, contentType: string) => request<ReceiptUpload>('POST', `/transactions/${id}/receipt`, { body: { contentType } });
// budgets
export const listBudgets = (month?: string) => request<Budget[]>('GET', '/budgets', { query: { month } });
export const createBudget = (body: BudgetInput) => request<SavedBudget>('POST', '/budgets', { body });
export const updateBudget = (id: string, body: Partial<BudgetInput>) => request<SavedBudget>('PUT', `/budgets/${id}`, { body });
export const deleteBudget = (id: string) => request<void>('DELETE', `/budgets/${id}`);
// goals
export const listGoals = () => request<Goal[]>('GET', '/goals');
export const createGoal = (body: GoalInput) => request<Goal>('POST', '/goals', { body });
export const updateGoal = (id: string, body: Partial<GoalInput>) => request<Goal>('PUT', `/goals/${id}`, { body });
export const deleteGoal = (id: string) => request<void>('DELETE', `/goals/${id}`);
export const contributeGoal = (id: string, body: ContributeInput) => request<Goal>('POST', `/goals/${id}/contribute`, { body });
// overview, profile, import
export const getOverview = (month?: string) => request<Overview>('GET', '/overview', { query: { month } });
export const getMe = () => request<Me>('GET', '/me');
export const putMe = (body: Me) => request<Me>('PUT', '/me', { body });
export const importState = (body: unknown) => request<ImportResult>('POST', '/import', { body });
