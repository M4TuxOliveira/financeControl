import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, type RenderResult } from '@testing-library/react';
import type { ReactElement } from 'react';
import { I18nProvider, type Locale } from '../src/i18n';

export function renderWithProviders(ui: ReactElement, o: { locale?: Locale; currency?: string; timezone?: string; today?: string } = {}): RenderResult & { qc: QueryClient } {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 0 }, mutations: { retry: false } } });
  const r = render(
    <QueryClientProvider client={qc}>
      <I18nProvider locale={o.locale ?? 'pt-BR'} currency={o.currency ?? 'BRL'} timezone={o.timezone} today={o.today ?? '2026-10-13'}>{ui}</I18nProvider>
    </QueryClientProvider>,
  );
  return Object.assign(r, { qc });
}
