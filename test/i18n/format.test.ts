import { describe, expect, it } from 'vitest';
import {
  formatDate, formatDateShort, formatMoney, formatMonth, moneyToInput, monthOf, parseDate, parseMoney, shiftMonth, todayIn,
} from '../../src/i18n/format';

describe('formatMoney', () => {
  it('pt-BR BRL', () => {
    expect(formatMoney(123456, 'pt-BR', 'BRL')).toBe('R$ 1.234,56');
    expect(formatMoney(0, 'pt-BR', 'BRL')).toBe('R$ 0,00');
    expect(formatMoney(-5000, 'pt-BR', 'BRL')).toBe('-R$ 50,00');
  });
  it('en USD', () => {
    expect(formatMoney(123456, 'en', 'USD')).toBe('$1,234.56');
  });
  it('never emits a non-breaking space', () => {
    expect(formatMoney(100, 'pt-BR', 'BRL')).not.toMatch(/[  ]/);
  });
});

describe('parseMoney (review focus 1)', () => {
  it('pt-BR: comma decimal, dot thousands', () => {
    expect(parseMoney('1.234,56', 'pt-BR')).toBe(123456);
    expect(parseMoney('R$ 1.234,56', 'pt-BR')).toBe(123456);
    expect(parseMoney('1234,5', 'pt-BR')).toBe(123450);
    expect(parseMoney('0,99', 'pt-BR')).toBe(99);
    expect(parseMoney('1.234', 'pt-BR')).toBe(123400);   // thousands grouping
    expect(parseMoney('12.5', 'pt-BR')).toBe(1250);      // a lone dot that is not a grouping is a decimal
    expect(parseMoney('10', 'pt-BR')).toBe(1000);
  });
  it('en: dot decimal, comma thousands', () => {
    expect(parseMoney('1,234.56', 'en')).toBe(123456);
    expect(parseMoney('$1,234', 'en')).toBe(123400);
    expect(parseMoney('12,5', 'en')).toBe(1250);
  });
  it('rejects empty, garbage and negatives', () => {
    expect(parseMoney('', 'pt-BR')).toBeNull();
    expect(parseMoney('abc', 'pt-BR')).toBeNull();
    expect(parseMoney('-5', 'pt-BR')).toBeNull();
    expect(parseMoney('1,2,3', 'pt-BR')).toBeNull();
  });
  it('rejects malformed, cross-locale and over-precise input instead of guessing', () => {
    for (const s of ['1e5', '1.234,5.6', '1,234.56', '0.001', '1.2345', '0,001', '10,999', '1,005', '1,234', '5-', '1.234.56']) {
      expect(parseMoney(s, 'pt-BR'), s).toBeNull();
    }
    expect(parseMoney('1.234,56', 'en')).toBeNull();
    expect(parseMoney('99999999999999999999', 'pt-BR')).toBeNull();
  });
  it('accepts well-formed variants', () => {
    expect(parseMoney('1.234.567,89', 'pt-BR')).toBe(123456789);
    expect(parseMoney('1 234,56', 'pt-BR')).toBe(123456);
    expect(parseMoney('  10,5  ', 'pt-BR')).toBe(1050);
    expect(parseMoney(',50', 'pt-BR')).toBe(50);
    expect(parseMoney('.50', 'en')).toBe(50);
    expect(parseMoney('1.000', 'pt-BR')).toBe(100000);
    expect(parseMoney('R$ 1.234,56', 'pt-BR')).toBe(123456);
    expect(parseMoney('US$ 1,234.56', 'en')).toBe(123456);
  });
  it('round-trips through moneyToInput', () => {
    for (const c of [1, 29, 99, 100, 1005, 123456, 100000000, 1000000001]) {
      for (const l of ['pt-BR', 'en'] as const) expect(parseMoney(moneyToInput(c, l), l)).toBe(c);
    }
    expect(moneyToInput(0, 'pt-BR')).toBe('');
    expect(moneyToInput(123456, 'pt-BR')).toBe('1234,56');
    expect(moneyToInput(123456, 'en')).toBe('1234.56');
  });
});

describe('dates (review focus 2)', () => {
  it('formats ISO without day shifts', () => {
    expect(formatDate('2026-10-13', 'pt-BR')).toBe('13/10/2026');
    expect(formatDate('2026-10-13', 'en')).toBe('10/13/2026');
    expect(formatDate('2026-01-01', 'pt-BR')).toBe('01/01/2026');
    expect(formatDate('2026-12-31', 'pt-BR')).toBe('31/12/2026');
    expect(formatDateShort('2026-10-13', 'pt-BR')).toBe('13/10');
    expect(formatDateShort('2026-10-13', 'en')).toBe('10/13');
  });
  it('formats months', () => {
    expect(formatMonth('2026-10', 'pt-BR', true)).toBe('outubro de 2026');
    expect(formatMonth('2026-10', 'en', true)).toBe('October 2026');
    expect(formatMonth('2026-10', 'en')).toBe('Oct 2026');
  });
  it('parseDate accepts locale format and ISO, rejects impossible dates', () => {
    expect(parseDate('13/10/2026', 'pt-BR')).toBe('2026-10-13');
    expect(parseDate('10/13/2026', 'en')).toBe('2026-10-13');
    expect(parseDate('2026-10-13', 'pt-BR')).toBe('2026-10-13');
    expect(parseDate('31/02/2026', 'pt-BR')).toBeNull();
    expect(parseDate('13/10/26', 'pt-BR')).toBeNull();
    expect(parseDate('', 'en')).toBeNull();
  });
  it('todayIn uses the given timezone, not UTC', () => {
    const now = new Date('2026-10-14T01:30:00Z');
    expect(todayIn('America/Sao_Paulo', now)).toBe('2026-10-13');
    expect(todayIn('UTC', now)).toBe('2026-10-14');
  });
  it('month helpers', () => {
    expect(monthOf('2026-10-13')).toBe('2026-10');
    expect(shiftMonth('2026-01', -1)).toBe('2025-12');
    expect(shiftMonth('2026-12', 1)).toBe('2027-01');
  });
});
