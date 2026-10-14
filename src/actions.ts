import type { Account, Budget, Card, Category, Goal, Repeat, Tx } from './types';
import { addDays, addMonths, uid } from './lib';
import { update } from './store';

const upsert = <T extends { id: string }>(xs: T[], x: T) =>
  xs.some(e => e.id === x.id) ? xs.map(e => (e.id === x.id ? x : e)) : [...xs, x];

/* ---------- accounts ---------- */
export const saveAccount = (a: Account) => update(s => ({ ...s, accounts: upsert(s.accounts, a) }));

export function deleteAccount(id: string, targetId: string | null) {
  update(s => {
    const remap = (x: string) => (x === id ? targetId ?? '' : x);
    return {
      ...s,
      accounts: s.accounts.filter(a => a.id !== id),
      transactions: targetId
        ? s.transactions.map(t => ({ ...t, accountId: remap(t.accountId), toId: t.toId ? remap(t.toId) : t.toId }))
        : s.transactions.filter(t => t.accountId !== id && t.toId !== id),
      cards: s.cards.map(c => ({ ...c, payAccountId: remap(c.payAccountId) })),
      goals: s.goals.map(g => ({ ...g, accountId: remap(g.accountId) })),
    };
  });
}

/* ---------- cards ---------- */
export const saveCard = (c: Card) => update(s => ({ ...s, cards: upsert(s.cards, c) }));
export const deleteCard = (id: string) =>
  update(s => ({
    ...s,
    cards: s.cards.filter(c => c.id !== id),
    transactions: s.transactions.filter(t => t.accountId !== id && t.toId !== id),
  }));

export function payStatement(cardId: string, fromId: string, amount: number, date: string, label: string) {
  const tx: Tx = {
    id: uid(), type: 'transfer', amount, date, desc: `Card payment · ${label}`,
    accountId: fromId, toId: cardId, tags: [], note: '',
  };
  update(s => ({ ...s, transactions: [...s.transactions, tx] }));
}

/* ---------- categories ---------- */
export const saveCategory = (c: Category) => update(s => ({ ...s, categories: upsert(s.categories, c) }));

/** Deletes the category and its subcategories; their transactions move to `targetId` (or become uncategorized). */
export function deleteCategory(id: string, targetId: string | null) {
  update(s => {
    const gone = new Set([id, ...s.categories.filter(c => c.parentId === id).map(c => c.id)]);
    return {
      ...s,
      categories: s.categories.filter(c => !gone.has(c.id)),
      budgets: s.budgets.filter(b => !gone.has(b.categoryId)),
      transactions: s.transactions.map(t =>
        t.categoryId && gone.has(t.categoryId) ? { ...t, categoryId: targetId ?? undefined } : t),
    };
  });
}

/* ---------- budgets ---------- */
export const saveBudget = (b: Budget) => update(s => ({ ...s, budgets: upsert(s.budgets, b) }));
export const deleteBudget = (id: string) => update(s => ({ ...s, budgets: s.budgets.filter(b => b.id !== id) }));

/* ---------- goals ---------- */
export const saveGoal = (g: Goal) => update(s => ({ ...s, goals: upsert(s.goals, g) }));
export const deleteGoal = (id: string) => update(s => ({ ...s, goals: s.goals.filter(g => g.id !== id) }));

export function contribute(goal: Goal, amount: number, fromId: string, date: string) {
  update(s => {
    const move: Tx[] = fromId && fromId !== goal.accountId
      ? [{ id: uid(), type: 'transfer', amount, date, desc: `Goal · ${goal.name}`, accountId: fromId, toId: goal.accountId, tags: [], note: '' }]
      : [];
    return {
      ...s,
      goals: s.goals.map(g => (g.id === goal.id ? { ...g, saved: g.saved + amount } : g)),
      transactions: [...s.transactions, ...move],
    };
  });
}

/* ---------- transactions ---------- */
export type TxDraft = Omit<Tx, 'id' | 'groupId' | 'inst' | 'repeat'>;

/** Expands a draft into one transaction, an installment plan or a repeating series. */
export function createTransactions(d: TxDraft, opts: { installments?: number; repeat?: Repeat }): Tx[] {
  const n = opts.installments ?? 0;
  if (n > 1) {
    const groupId = uid();
    const base = Math.floor(d.amount / n);
    const rest = d.amount - base * n;
    return Array.from({ length: n }, (_, i) => ({
      ...d, id: uid(), groupId, inst: { i: i + 1, n },
      amount: base + (i === 0 ? rest : 0), date: addMonths(d.date, i),
    }));
  }
  if (opts.repeat) {
    const groupId = uid();
    const count = { weekly: 26, monthly: 12, yearly: 3 }[opts.repeat];
    return Array.from({ length: count }, (_, i) => ({
      ...d, id: uid(), groupId, repeat: opts.repeat,
      date: opts.repeat === 'weekly' ? addDays(d.date, 7 * i) : addMonths(d.date, i * (opts.repeat === 'yearly' ? 12 : 1)),
    }));
  }
  return [{ ...d, id: uid() }];
}

export const addTransactions = (txs: Tx[]) => update(s => ({ ...s, transactions: [...s.transactions, ...txs] }));
export const saveTx = (t: Tx) => update(s => ({ ...s, transactions: upsert(s.transactions, t) }));

export type DeleteScope = 'one' | 'future' | 'all';
export function deleteTx(t: Tx, scope: DeleteScope) {
  update(s => ({
    ...s,
    transactions: s.transactions.filter(x => {
      if (x.id === t.id) return false;
      if (!t.groupId || x.groupId !== t.groupId || scope === 'one') return true;
      return scope === 'future' ? x.date < t.date : false;
    }),
  }));
}
