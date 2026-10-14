import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { en } from '../../src/i18n/en';
import { ptBR } from '../../src/i18n/pt-BR';
import { errorMessage } from '../../src/i18n/errors';

describe('catalogs', () => {
  it('have identical key sets and no empty values', () => {
    expect(Object.keys(ptBR).sort()).toEqual(Object.keys(en).sort());
    for (const [k, v] of Object.entries(en)) expect(v.trim(), `en ${k}`).not.toBe('');
    for (const [k, v] of Object.entries(ptBR)) expect((v as string).trim(), `pt-BR ${k}`).not.toBe('');
  });
  it('interpolation placeholders match between locales', () => {
    const vars = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort();
    for (const k of Object.keys(en) as (keyof typeof en)[]) expect(vars(ptBR[k]), k).toEqual(vars(en[k]));
  });
  it('every t("literal.key") used under src exists in the catalog', () => {
    const files: string[] = [];
    const walk = (d: string) => readdirSync(d).forEach(f => { const p = join(d, f); statSync(p).isDirectory() ? walk(p) : /\.tsx?$/.test(p) && files.push(p); });
    walk('src');
    const missing: string[] = [];
    for (const f of files) {
      for (const m of readFileSync(f, 'utf8').matchAll(/\bt\(\s*'([a-zA-Z0-9_.]+)'/g)) {
        if (!(m[1] in en)) missing.push(`${f}: ${m[1]}`);
      }
    }
    expect(missing).toEqual([]);
  });
  it('has a translation for every default category key the backend seeds', () => {
    const keys = ['groceries', 'groceries.supermarket', 'groceries.bakery', 'groceries.butcher', 'housing', 'housing.rent', 'housing.condo_fee', 'housing.utilities',
      'transport', 'transport.fuel', 'transport.ride_apps', 'transport.parking', 'food', 'food.restaurants', 'food.delivery', 'subscriptions', 'electronics',
      'health', 'health.pharmacy', 'health.doctor', 'travel', 'sports', 'sports.equipment', 'sports.gym', 'income', 'income.salary', 'income.other_income'];
    for (const k of keys) expect(`categories.${k}` in en, k).toBe(true);
    expect(keys).toHaveLength(27);
  });
});

describe('errorMessage', () => {
  const t = (k: string, v?: Record<string, string | number>) => `${k}${v ? JSON.stringify(v) : ''}`;
  it('translates known codes', () => {
    expect(errorMessage({ code: 'BUDGET_EXISTS', status: 409 }, t as never)).toBe('errors.BUDGET_EXISTS');
  });
  it('falls back to a generic message with the request id for unknown codes', () => {
    expect(errorMessage({ code: 'WHAT', status: 500, requestId: 'abc' }, t as never)).toBe('errors.generic{"id":"abc"}');
  });
  it('handles non-API errors', () => {
    expect(errorMessage(new Error('x'), t as never)).toBe('errors.generic{"id":"-"}');
  });
});
