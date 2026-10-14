import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import * as api from '../../src/api/endpoints';
import { I18nProvider } from '../../src/i18n';
import { txTitle } from '../../src/i18n/txTitle';
import { useAccountLookup, useCategoryLookup } from '../../src/queries/lookups';

vi.mock('../../src/api/endpoints');

const cat = (o: object) => ({ id: 'c', name: 'N', parentId: null, icon: 'Paw', color: '#111111', system: false, ...o });
const wrap = (locale: 'pt-BR' | 'en') => ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><I18nProvider locale={locale}>{children}</I18nProvider></QueryClientProvider>);

describe('useCategoryLookup', () => {
  it('translates system categories by key and keeps custom names', async () => {
    vi.mocked(api.listCategories).mockResolvedValue([
      cat({ id: 'sys:groceries', name: 'Groceries', system: true, key: 'groceries', color: '#3D5A0E' }),
      cat({ id: 'sys:groceries.bakery', name: 'Bakery', parentId: 'sys:groceries', system: true, key: 'groceries.bakery' }),
      cat({ id: 'u1', name: 'Pets' }),
      cat({ id: 'sys:weird', name: 'Weird', system: true, key: 'weird.unknown' }),
    ] as never);
    const { result } = renderHook(() => useCategoryLookup(), { wrapper: wrap('pt-BR') });
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.label('sys:groceries.bakery')).toBe('Mercado › Padaria');
    expect(result.current.label('u1')).toBe('Pets');
    expect(result.current.label('sys:weird')).toBe('Weird');
    expect(result.current.label(undefined)).toBe('Sem categoria');
    expect(result.current.color('sys:groceries')).toBe('#3D5A0E');
    expect(result.current.tops.map(c => c.id)).toContain('u1');
    expect(result.current.subsOf('sys:groceries').map(c => c.id)).toEqual(['sys:groceries.bakery']);
  });
});

describe('useAccountLookup', () => {
  it('names accounts and cards, dash for unknown', async () => {
    vi.mocked(api.listAccounts).mockResolvedValue([{ id: 'a', name: 'Itaú' }] as never);
    vi.mocked(api.listCards).mockResolvedValue([{ id: 'k', name: 'Nubank' }] as never);
    const { result } = renderHook(() => useAccountLookup(), { wrapper: wrap('en') });
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.name('a')).toBe('Itaú');
    expect(result.current.name('k')).toBe('Nubank');
    expect(result.current.name('zzz')).toBe('—');
  });
});

describe('txTitle', () => {
  const t = (k: string) => ({ 'source.card_payment': 'Pagamento de fatura', 'source.goal': 'Meta' } as Record<string, string>)[k];
  it('prefixes system transfers with their translated source', () => {
    expect(txTitle(t as never, { desc: 'Nubank', source: 'card_payment' })).toBe('Pagamento de fatura · Nubank');
    expect(txTitle(t as never, { desc: 'Viagem', source: 'goal' })).toBe('Meta · Viagem');
    expect(txTitle(t as never, { desc: 'iFood' })).toBe('iFood');
  });
});
