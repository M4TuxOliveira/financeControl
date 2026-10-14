import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, type RenderResult } from '@testing-library/react';
import type { ReactElement } from 'react';
import { vi } from 'vitest';
import { AuthProvider } from '../src/auth/AuthProvider';
import type { AuthBackend } from '../src/auth/types';
import { I18nProvider, type Locale } from '../src/i18n';

type Opts = { locale?: Locale; currency?: string; timezone?: string; today?: string; devMode?: boolean; backend?: Partial<AuthBackend> };

export function renderWithProviders(ui: ReactElement, o: Opts = {}): RenderResult & { qc: QueryClient; backend: AuthBackend } {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 0 }, mutations: { retry: false } } });
  const backend: AuthBackend = {
    restore: async () => true, signIn: async () => 'ok', completeNewPassword: async () => {},
    getAccessToken: async () => 'tok', refresh: async () => 'tok', signOut: vi.fn(), ...o.backend,
  };
  const r = render(
    <QueryClientProvider client={qc}>
      <AuthProvider backend={backend} devMode={o.devMode ?? false}>
        <I18nProvider locale={o.locale ?? 'pt-BR'} currency={o.currency ?? 'BRL'} timezone={o.timezone} today={o.today ?? '2026-10-13'}>{ui}</I18nProvider>
      </AuthProvider>
    </QueryClientProvider>,
  );
  return Object.assign(r, { qc, backend });
}
