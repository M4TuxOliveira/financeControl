import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../src/api/client';
import { QueryState } from '../../src/components/QueryState';
import { I18nProvider } from '../../src/i18n';

function Harness({ fn, isEmpty }: { fn: () => Promise<number[]>; isEmpty?: (d: number[]) => boolean }) {
  const q = useQuery({ queryKey: ['x'], queryFn: fn, retry: false });
  return <QueryState q={q} isEmpty={isEmpty} empty={<span>vazio</span>}>{d => <ul>{d.map(n => <li key={n}>{n}</li>)}</ul>}</QueryState>;
}
const mount = (fn: () => Promise<number[]>, isEmpty?: (d: number[]) => boolean) =>
  render(<QueryClientProvider client={new QueryClient()}><I18nProvider locale="pt-BR"><Harness fn={fn} isEmpty={isEmpty} /></I18nProvider></QueryClientProvider>);

describe('QueryState', () => {
  it('shows loading, then the data', async () => {
    mount(async () => [1, 2]);
    expect(screen.getByRole('status')).toHaveTextContent('Carregando…');
    expect(await screen.findByText('2')).toBeInTheDocument();
  });
  it('shows a translated error and retries', async () => {
    const fn = vi.fn().mockRejectedValueOnce(new ApiError(500, 'INTERNAL', 'x')).mockResolvedValueOnce([7]);
    mount(fn);
    expect(await screen.findByRole('alert')).toHaveTextContent('O servidor teve um problema');
    await userEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }));
    expect(await screen.findByText('7')).toBeInTheDocument();
  });
  it('renders the empty node when isEmpty says so', async () => {
    mount(async () => [], d => d.length === 0);
    expect(await screen.findByText('vazio')).toBeInTheDocument();
  });
});
