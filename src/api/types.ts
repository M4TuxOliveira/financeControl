export type Locale = 'pt-BR' | 'en';
export type AccountKind = 'checking' | 'savings' | 'cash';
export type TxType = 'expense' | 'income' | 'transfer';
export type Repeat = 'weekly' | 'monthly' | 'yearly';
export type TxSource = 'card_payment' | 'goal';
export type StatementStatus = 'paid' | 'open' | 'upcoming' | 'due';

type Stamped = { createdAt?: string; updatedAt?: string };

export type Account = Stamped & {
  id: string; name: string; kind: AccountKind; bank: string; opening: number; color: string; inTotal: boolean; archived: boolean;
  balance: number;
};
export type Tx = Stamped & {
  id: string; type: TxType; amount: number; date: string; desc: string; accountId: string; toId?: string; categoryId?: string;
  tags: string[]; note: string; receiptKey?: string; receiptUrl?: string; groupId?: string; inst?: { i: number; n: number };
  repeat?: Repeat; source?: TxSource;
};
export type Statement = {
  key: string; total: number; paid: number; status: StatementStatus; due: string; range: { start: string; end: string }; items: Tx[];
};
export type Card = Stamped & {
  id: string; name: string; network: string; limit: number; closeDay: number; dueDay: number; color: string; payAccountId: string;
  used: number; statements: Statement[];
};
export type CreatedCard = Omit<Card, 'statements'>;
export type Category = Stamped & {
  id: string; name: string; parentId: string | null; icon: string; color: string; system: boolean; key?: string;
};
export type Budget = Stamped & { id: string; categoryId: string; limit: number; alertPct: number; spent: number; pct: number };
export type SavedBudget = Omit<Budget, 'spent' | 'pct'>;
export type Goal = Stamped & {
  id: string; name: string; accountId: string; target: number; targetDate: string; saved: number;
  pct: number; left: number; monthsLeft: number; monthlyNeeded: number | null;
};
export type Overview = {
  month: string; totalBalance: number; income: number; expense: number; net: number; openStatementsTotal: number; recent: Tx[];
};
export type Me = { locale: Locale; currency: string; timezone: string };
export type Totals = { income: number; expense: number; net: number };
export type TxList = { items: Tx[]; totals: Totals };

export type AccountInput = { name: string; kind: AccountKind; bank?: string; opening?: number; color: string; inTotal?: boolean; archived?: boolean };
export type CardInput = { name: string; network: string; limit: number; closeDay: number; dueDay: number; color: string; payAccountId?: string };
export type CategoryInput = { name: string; parentId?: string | null; icon: string; color: string };
export type BudgetInput = { categoryId: string; limit: number; alertPct?: number };
export type GoalInput = { name: string; accountId?: string; target: number; targetDate?: string; saved?: number };
export type TxInput = {
  type: TxType; amount: number; date: string; desc: string; accountId: string; toId?: string; categoryId?: string; tags?: string[]; note?: string;
};
export type TxCreateInput = TxInput & { installments?: number; repeat?: Repeat };
export type PayInput = { amount: number; fromAccountId: string; date: string };
export type ContributeInput = { amount: number; fromAccountId?: string; date?: string };
export type TxFilters = { month?: string; account?: string; category?: string; type?: TxType; tag?: string; q?: string };
export type ReceiptUpload = { key: string; upload: { url: string; fields: Record<string, string> } };
export type ImportResult = {
  accounts: number; cards: number; categories: number; transactions: number; budgets: number; goals: number;
  receiptsSkipped: number; skippedTransactions: number; skippedBudgets: number;
};
export type DeleteScope = 'one' | 'future' | 'all';
