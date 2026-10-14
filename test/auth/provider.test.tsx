import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AuthProvider, useAuth } from '../../src/auth/AuthProvider';
import type { AuthBackend } from '../../src/auth/types';
import * as client from '../../src/api/client';

function fake(over: Partial<AuthBackend> = {}): AuthBackend {
  return {
    restore: vi.fn(async () => false), signIn: vi.fn(async () => 'ok' as const), completeNewPassword: vi.fn(async () => {}),
    getAccessToken: vi.fn(async () => 'tok'), refresh: vi.fn(async () => 'tok2'), signOut: vi.fn(), ...over,
  };
}
function Probe() {
  const a = useAuth();
  return (<div><span data-testid="s">{a.status}</span><span data-testid="e">{String(a.expired)}</span>
    <button onClick={() => a.signIn('u', 'p')}>in</button><button onClick={() => a.signOut()}>out</button></div>);
}
const mount = (b: AuthBackend) => render(<QueryClientProvider client={new QueryClient()}><AuthProvider backend={b}><Probe /></AuthProvider></QueryClientProvider>);

describe('AuthProvider', () => {
  it('starts loading, then signedOut when nothing to restore', async () => {
    mount(fake());
    expect(screen.getByTestId('s')).toHaveTextContent('loading');
    await waitFor(() => expect(screen.getByTestId('s')).toHaveTextContent('signedOut'));
  });
  it('restores a session', async () => {
    mount(fake({ restore: async () => true }));
    await waitFor(() => expect(screen.getByTestId('s')).toHaveTextContent('signedIn'));
  });
  it('signIn → signedIn, new-password challenge → newPassword, signOut → signedOut', async () => {
    const b = fake({ signIn: vi.fn(async () => 'newPassword' as const) });
    mount(b);
    await waitFor(() => expect(screen.getByTestId('s')).toHaveTextContent('signedOut'));
    await act(async () => { screen.getByText('in').click(); });
    expect(screen.getByTestId('s')).toHaveTextContent('newPassword');
    (b.signIn as ReturnType<typeof vi.fn>).mockResolvedValue('ok');
    await act(async () => { screen.getByText('in').click(); });
    expect(screen.getByTestId('s')).toHaveTextContent('signedIn');
    await act(async () => { screen.getByText('out').click(); });
    expect(b.signOut).toHaveBeenCalled();
    expect(screen.getByTestId('s')).toHaveTextContent('signedOut');
  });
  it('wires the api token provider; an auth failure signs out and flags the session as expired', async () => {
    const spy = vi.spyOn(client, 'setTokenProvider');
    const b = fake({ restore: async () => true });
    mount(b);
    await waitFor(() => expect(screen.getByTestId('s')).toHaveTextContent('signedIn'));
    const tp = spy.mock.calls.at(-1)![0]!;
    expect(await tp.getAccessToken()).toBe('tok');
    await act(async () => { tp.onAuthFailure(); });
    expect(screen.getByTestId('s')).toHaveTextContent('signedOut');
    expect(screen.getByTestId('e')).toHaveTextContent('true');
    expect(b.signOut).toHaveBeenCalled();
  });
  it('a late restore() does not overwrite a state set by signIn()', async () => {
    let release: (v: boolean) => void = () => {};
    const b = fake({ restore: () => new Promise<boolean>(r => { release = r; }) });
    mount(b);
    await act(async () => { screen.getByText('in').click(); });
    expect(screen.getByTestId('s')).toHaveTextContent('signedIn');
    await act(async () => { release(false); });
    expect(screen.getByTestId('s')).toHaveTextContent('signedIn');
  });
});
