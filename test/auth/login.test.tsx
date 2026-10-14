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
  it.each([
    [{ name: 'NotAuthorizedException' }, 'Wrong email or password.'],
    [{ name: 'NotAuthorizedException', code: 'NotAuthorizedException', message: 'Incorrect username or password.' }, 'Wrong email or password.'],
    [{ code: 'NotAuthorizedException', message: 'User is disabled.' }, 'This account is disabled. Contact the administrator.'],
    [{ name: 'NotAuthorizedException', message: 'Password attempts exceeded' }, 'Too many attempts. Wait a few minutes and try again.'],
    [{ name: 'NotAuthorizedException', message: 'Temporary password has expired and must be reset by an administrator.' }, 'The temporary password has expired. Ask the administrator for a new one.'],
    [{ name: 'UserNotFoundException' }, 'Wrong email or password.'],
    [{ name: 'TooManyRequestsException', message: 'Too many requests' }, 'Too many attempts. Wait a few minutes and try again.'],
    [{ code: 'LimitExceededException', message: 'Attempt limit exceeded' }, 'Too many attempts. Wait a few minutes and try again.'],
    [{ name: 'PasswordResetRequiredException', message: 'Password reset required for the user' }, 'This account is not ready to sign in yet. Contact the administrator.'],
    [{ name: 'UserNotConfirmedException', message: 'User is not confirmed.' }, 'This account is not ready to sign in yet. Contact the administrator.'],
    [{ message: 'UNSUPPORTED_CHALLENGE' }, 'This account requires a sign-in step this app does not support yet (MFA).'],
    [{ message: 'CONFIG' }, 'Cognito is not configured (missing VITE_COGNITO_* variables).'],
    [{ name: 'NetworkError', code: 'NetworkError', message: 'Network error' }, 'Could not reach the server. Check your connection.'],
    [{ name: 'TypeError', message: 'Failed to fetch' }, 'Could not reach the server. Check your connection.'],
    [{ message: 'Failed to fetch' }, 'Could not reach the server. Check your connection.'],
    [{ message: 'boom' }, 'Could not sign in. Please try again.'],
  ])('maps error %j to a message', async (props, text) => {
    const b = fake({ signIn: vi.fn(async () => { throw Object.assign(new Error(''), props); }) });
    mount(b, false, 'en');
    await userEvent.type(await screen.findByLabelText('Email'), 'me@x.com');
    await userEvent.type(screen.getByLabelText('Password'), 'pw');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(text);
  });
  it('maps InvalidPasswordException on the new-password form to the password policy', async () => {
    const b = fake({ signIn: vi.fn(async () => 'newPassword' as const),
      completeNewPassword: vi.fn(async () => { throw Object.assign(new Error('Password does not conform to policy'), { name: 'InvalidPasswordException', code: 'InvalidPasswordException' }); }) });
    mount(b, false, 'en');
    await userEvent.type(await screen.findByLabelText('Email'), 'me@x.com');
    await userEvent.type(screen.getByLabelText('Password'), 'tmp');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    await userEvent.type(await screen.findByLabelText('New password'), 'short');
    await userEvent.click(screen.getByRole('button', { name: 'Set password' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('That password does not meet the requirements (at least 10 characters with upper case, lower case and numbers).');
  });
  it('pt-BR: neutral generic error and a disabled-account message', async () => {
    const b = fake({ signIn: vi.fn().mockRejectedValueOnce(new Error('boom')).mockRejectedValueOnce(Object.assign(new Error('User is disabled.'), { name: 'NotAuthorizedException' })) });
    mount(b, false);
    await userEvent.type(await screen.findByLabelText('E-mail'), 'me@x.com');
    await userEvent.type(screen.getByLabelText('Senha'), 'pw');
    await userEvent.click(screen.getByRole('button', { name: 'Entrar' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível entrar. Tente novamente.');
    await userEvent.click(screen.getByRole('button', { name: 'Entrar' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Esta conta está desativada. Fale com o administrador.');
  });
  it('maps INVALID_DEV_ID in dev mode', async () => {
    const b = fake({ signIn: vi.fn(async () => { throw new Error('INVALID_DEV_ID'); }) });
    mount(b, true, 'en');
    await userEvent.click(await screen.findByRole('button', { name: 'Enter as dev user' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Use 1–40 letters');
  });
});
