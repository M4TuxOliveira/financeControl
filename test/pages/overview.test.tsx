import { screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as api from '../../src/api/endpoints';
import { Overview } from '../../src/pages/Overview';
import { renderWithProviders } from '../utils';
import { account, budget, card, goal, mockApi, overview, tx } from './fixtures';

vi.mock('../../src/api/endpoints');

beforeEach(() => {
  mockApi({
    getOverview: overview({ recent: [
      tx(),
      tx({ id: 't2', type: 'transfer', amount: 200000, date: '2026-10-10', desc: 'Nubank', accountId: 'a1', toId: 'k1', categoryId: undefined, source: 'card_payment' }),
    ] }),
    listAccounts: [account(), account({ id: 'a2', name: 'Caixinha', kind: 'savings', archived: true })],
    listCards: [card()], listBudgets: [budget({ pct: 90, spent: 45000 })], listGoals: [goal()],
  });
});

describe('Overview', () => {
  it('renders server-provided totals formatted for pt-BR', async () => {
    renderWithProviders(<Overview />);
    expect(await screen.findByText('R$ 18.432,90')).toBeInTheDocument();
    expect(screen.getByText('+ R$ 9.800,00')).toBeInTheDocument();
    expect(screen.getByText('− R$ 4.215,37')).toBeInTheDocument();
    expect(screen.getByText('R$ 2.318,44')).toBeInTheDocument();
    expect(api.getOverview).toHaveBeenCalledWith('2026-10');
  });
  it('lists non-archived accounts with translated kind, recent transactions with translated labels', async () => {
    renderWithProviders(<Overview />);
    expect(await screen.findByText('Itaú')).toBeInTheDocument();
    expect(screen.queryByText(/Caixinha/)).not.toBeInTheDocument();
    expect(screen.getByText(/Conta corrente/)).toBeInTheDocument();
    expect(await screen.findByText('Pagamento de fatura · Nubank')).toBeInTheDocument();
    expect(screen.getByText(/Alimentação › Delivery/)).toBeInTheDocument();
    expect(screen.getAllByText('13/10').length).toBeGreaterThan(0);
  });
  it('shows server budget percentage and goal progress', async () => {
    renderWithProviders(<Overview />);
    expect(await screen.findByText('90%')).toBeInTheDocument();
    expect(await screen.findByText('Viagem')).toBeInTheDocument();
  });
  it('English locale uses its own formats', async () => {
    renderWithProviders(<Overview />, { locale: 'en', currency: 'USD' });
    expect(await screen.findByText('$18,432.90')).toBeInTheDocument();
    expect(screen.getByText('Total balance')).toBeInTheDocument();
  });
  it('shows a retryable error when the overview fails', async () => {
    vi.mocked(api.getOverview).mockRejectedValue(new Error('x'));
    renderWithProviders(<Overview />);
    expect(await screen.findAllByRole('alert')).not.toHaveLength(0);
  });
});
