import type { Tx, TxType } from '../api/types';

export const signedAmount = (tx: Pick<Tx, 'type' | 'amount'>, money: (c: number) => string): string =>
  tx.type === 'income' ? `+ ${money(tx.amount)}` : tx.type === 'expense' ? `− ${money(tx.amount)}` : money(tx.amount);

export const amountColor = (type: TxType): string =>
  type === 'income' ? 'var(--pos)' : type === 'expense' ? 'var(--neg)' : 'var(--ink)';
