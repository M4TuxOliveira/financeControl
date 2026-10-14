import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { en, type Key } from './en';
import { ptBR } from './pt-BR';
import {
  formatDate, formatDateShort, formatMoney, formatMonth, moneyToInput, parseMoney, parseSignedMoney, todayIn, type Locale,
} from './format';

export type { Locale } from './format';
export type { Key } from './en';

export type I18n = {
  locale: Locale; currency: string; timezone: string; today: string;
  t: (key: Key, vars?: Record<string, string | number>) => string;
  tOr: (key: string, fallback: string) => string;
  money: (cents: number) => string;
  date: (iso: string) => string;
  dateShort: (iso: string) => string;
  month: (key: string, long?: boolean) => string;
  parseMoney: (s: string) => number | null;
  parseSigned: (s: string) => number | null;
  moneyInput: (cents: number) => string;
};

const catalogs: Record<Locale, Record<Key, string>> = { en, 'pt-BR': ptBR };
export const hasKey = (k: string): k is Key => k in en;

export function browserLocale(): Locale {
  return (typeof navigator !== 'undefined' ? navigator.language : 'en').toLowerCase().startsWith('pt') ? 'pt-BR' : 'en';
}

const Ctx = createContext<I18n | null>(null);

export function I18nProvider({ locale, currency = 'BRL', timezone = 'America/Sao_Paulo', today, children }: {
  locale: Locale; currency?: string; timezone?: string; today?: string; children: ReactNode;
}) {
  const value = useMemo<I18n>(() => {
    const cat = catalogs[locale];
    const t: I18n['t'] = (key, vars) => (vars ? cat[key].replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? '')) : cat[key]);
    return {
      locale, currency, timezone, today: today ?? todayIn(timezone),
      t, tOr: (key, fallback) => (hasKey(key) ? t(key) : fallback),
      money: c => formatMoney(c, locale, currency),
      date: d => formatDate(d, locale),
      dateShort: d => formatDateShort(d, locale),
      month: (k, long) => formatMonth(k, locale, long),
      parseMoney: s => parseMoney(s, locale),
      parseSigned: s => parseSignedMoney(s, locale),
      moneyInput: c => moneyToInput(c, locale),
    };
  }, [locale, currency, timezone, today]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useI18n(): I18n {
  const v = useContext(Ctx);
  if (!v) throw new Error('useI18n must be used inside <I18nProvider>');
  return v;
}
