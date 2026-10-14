import { describe, expect, it } from 'vitest';
import { amountColor, signedAmount } from '../../src/components/txFormat';

const money = (c: number) => `R$ ${(c / 100).toFixed(2)}`;
describe('txFormat', () => {
  it('signs income and expense, leaves transfers unsigned', () => {
    expect(signedAmount({ type: 'income', amount: 1000 }, money)).toBe('+ R$ 10.00');
    expect(signedAmount({ type: 'expense', amount: 1000 }, money)).toBe('− R$ 10.00');
    expect(signedAmount({ type: 'transfer', amount: 1000 }, money)).toBe('R$ 10.00');
  });
  it('picks the semantic colors', () => {
    expect(amountColor('income')).toBe('var(--pos)');
    expect(amountColor('expense')).toBe('var(--neg)');
    expect(amountColor('transfer')).toBe('var(--ink)');
  });
});
