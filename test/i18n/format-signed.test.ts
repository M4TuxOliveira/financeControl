import { describe, expect, it } from 'vitest';
import { moneyToInput, parseSignedMoney } from '../../src/i18n/format';

describe('parseSignedMoney', () => {
  it('accepts a leading minus', () => {
    expect(parseSignedMoney('-1.234,56', 'pt-BR')).toBe(-123456);
    expect(parseSignedMoney('-12.50', 'en')).toBe(-1250);
    expect(parseSignedMoney('  - 5', 'pt-BR')).toBe(-500);
  });
  it('positive and empty behave like parseMoney', () => {
    expect(parseSignedMoney('1.234,56', 'pt-BR')).toBe(123456);
    expect(parseSignedMoney('', 'pt-BR')).toBeNull();
    expect(parseSignedMoney('--5', 'pt-BR')).toBeNull();
    expect(parseSignedMoney('5-', 'pt-BR')).toBeNull();
  });
  it('rejects a lone minus and never returns -0', () => {
    expect(parseSignedMoney('-', 'pt-BR')).toBeNull();
    expect(Object.is(parseSignedMoney('-0', 'pt-BR'), 0)).toBe(true);
  });
  it('round-trips negative values through moneyToInput', () => {
    expect(moneyToInput(-1250, 'pt-BR')).toBe('-12,50');
    expect(parseSignedMoney(moneyToInput(-1250, 'pt-BR'), 'pt-BR')).toBe(-1250);
  });
});
