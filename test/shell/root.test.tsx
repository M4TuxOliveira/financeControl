import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import * as api from '../../src/api/endpoints';
import { AuthProvider } from '../../src/auth/AuthProvider';
import type { AuthBackend } from '../../src/auth/types';
import { Root } from '../../src/Root';

vi.mock('../../src/api/endpoints');
vi.mock('../../src/pages/Overview', () => ({ Overview: () => <div>overview-stub</div> }));

const fake = (restore: boolean, over: Partial<AuthBackend> = {}): AuthBackend => ({
  restore: async () => restore, signIn: vi.fn(async () => 'ok' as const), completeNewPassword: async () => {},
  getAccessToken: async () => 't', refresh: async () => 't', signOut: vi.fn(), ...over,
});
const mount = (b: AuthBackend, dev = false) => render(
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><AuthProvider backend={b} devMode={dev}><Root /></AuthProvider></QueryClientProvider>);

describe('Root', () => {
  it('shows the login page when signed out', async () => {
    mount(fake(false));
    expect(await screen.findByRole('button', { name: /Entrar|Sign in/ })).toBeInTheDocument();
  });
  it('signed in: loads the profile and renders the app in the profile locale (pt-BR nav)', async () => {
    vi.mocked(api.getMe).mockResolvedValue({ locale: 'pt-BR', currency: 'BRL', timezone: 'America/Sao_Paulo' });
    mount(fake(true));
    expect(await screen.findByText('overview-stub')).toBeInTheDocument();
    expect(screen.getAllByText('Visão geral').length).toBeGreaterThan(0);
    expect(document.documentElement.lang).toBe('pt-BR');
  });
  it('uses the English catalog when the profile says en', async () => {
    vi.mocked(api.getMe).mockResolvedValue({ locale: 'en', currency: 'USD', timezone: 'UTC' });
    mount(fake(true));
    expect(await screen.findByText('overview-stub')).toBeInTheDocument();
    expect(screen.getAllByText('Overview').length).toBeGreaterThan(0);
    expect(document.documentElement.lang).toBe('en');
  });
  it('profile load failure shows a retryable error', async () => {
    vi.mocked(api.getMe).mockRejectedValue(new Error('x'));
    mount(fake(true));
    expect(await screen.findByRole('alert')).toBeInTheDocument();
  });
  it('log out calls the backend and returns to the login page', async () => {
    vi.mocked(api.getMe).mockResolvedValue({ locale: 'pt-BR', currency: 'BRL', timezone: 'America/Sao_Paulo' });
    const b = fake(true);
    mount(b);
    await screen.findByText('overview-stub');
    await userEvent.click(screen.getAllByRole('button', { name: 'Sair' })[0]);
    expect(b.signOut).toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByText('overview-stub')).not.toBeInTheDocument());
  });
  it('dev mode shows the DEV banner over the app', async () => {
    vi.mocked(api.getMe).mockResolvedValue({ locale: 'pt-BR', currency: 'BRL', timezone: 'America/Sao_Paulo' });
    mount(fake(true), true);
    expect(await screen.findByText(/AUTENTICAÇÃO DE TESTE/)).toBeInTheDocument();
  });
});
