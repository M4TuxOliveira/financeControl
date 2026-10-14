import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '../../src/auth/AuthProvider';
import { LoginPage } from '../../src/auth/LoginPage';
import type { AuthBackend } from '../../src/auth/types';
import { I18nProvider } from '../../src/i18n';

function fake(over: Partial<AuthBackend> = {}): AuthBackend {
  return { restore: async () => false, signIn: vi.fn(async () => 'ok' as const), completeNewPassword: vi.fn(async () => {}),
    getAccessToken: async () => null, refresh: async () => null, signOut: vi.fn(), ...over };
}
const mount = (b: AuthBackend, dev: boolean, locale: 'pt-BR' | 'en' = 'pt-BR') =>
  render(<QueryClientProvider client={new QueryClient()}><AuthProvider backend={b} devMode={dev}><I18nProvider locale={locale}><LoginPage /></I18nProvider></AuthProvider></QueryClientProvider>);

describe('LoginPage', () => {
  it('cognito mode: submits email and password (pt-BR labels)', async () => {
    const b = fake();
    mount(b, false);
    await userEvent.type(await screen.findByLabelText('E-mail'), 'me@x.com');
    await userEvent.type(screen.getByLabelText('Senha'), 'secret');
    await userEvent.click(screen.getByRole('button', { name: 'Entrar' }));
    expect(b.signIn).toHaveBeenCalledWith('me@x.com', 'secret');
  });
  it('shows a translated error for wrong credentials', async () => {
    const b = fake({ signIn: vi.fn(async () => { throw new Error('NotAuthorizedException'); }) });
    mount(b, false, 'en');
    await userEvent.type(await screen.findByLabelText('Email'), 'me@x.com');
    await userEvent.type(screen.getByLabelText('Password'), 'bad');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Wrong email or password.');
  });
  it('dev mode: user id + enter button and the DEV banner', async () => {
    const b = fake();
    mount(b, true);
    expect(await screen.findByText(/AUTENTICAÇÃO DE TESTE/)).toBeInTheDocument();
    const id = screen.getByLabelText('ID do usuário de teste');
    await userEvent.clear(id);
    await userEvent.type(id, 'alice');
    await userEvent.click(screen.getByRole('button', { name: 'Entrar como usuário de teste' }));
    expect(b.signIn).toHaveBeenCalledWith('alice', undefined);
  });
  it('new-password challenge shows the set-password form', async () => {
    const b = fake({ signIn: vi.fn(async () => 'newPassword' as const) });
    mount(b, false);
    await userEvent.type(await screen.findByLabelText('E-mail'), 'me@x.com');
    await userEvent.type(screen.getByLabelText('Senha'), 'tmp');
    await userEvent.click(screen.getByRole('button', { name: 'Entrar' }));
    await userEvent.type(await screen.findByLabelText('Nova senha'), 'Perm4nent!pass');
    await userEvent.click(screen.getByRole('button', { name: 'Definir senha' }));
    await waitFor(() => expect(b.completeNewPassword).toHaveBeenCalledWith('Perm4nent!pass'));
  });
});
