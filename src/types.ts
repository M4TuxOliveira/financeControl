export type AccountKind = 'checking' | 'savings' | 'cash';
export type TxType = 'expense' | 'income' | 'transfer';
export type Repeat = 'weekly' | 'monthly' | 'yearly';

export type Account = {
  id: string; name: string; kind: AccountKind; bank: string;
  opening: number; color: string; inTotal: boolean; archived: boolean;
};
export type Card = {
  id: string; name: string; network: string; limit: number;
  closeDay: number; dueDay: number; color: string; payAccountId: string;
};
export type Category = {
  id: string; name: string; parentId: string | null; icon: string; color: string; system: boolean;
};
export type Tx = {
  id: string; type: TxType; amount: number; date: string; desc: string;
  accountId: string; toId?: string; categoryId?: string; tags: string[]; note: string;
  receipt?: string; groupId?: string; inst?: { i: number; n: number }; repeat?: Repeat;
};
export type Budget = { id: string; categoryId: string; limit: number; alertPct: number };
export type Goal = { id: string; name: string; accountId: string; target: number; targetDate: string; saved: number };
export type Theme = 'system' | 'light' | 'dark';

export type State = {
  v: 1;
  userName: string;
  theme: Theme;
  accounts: Account[]; cards: Card[]; categories: Category[];
  transactions: Tx[]; budgets: Budget[]; goals: Goal[];
};
