import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../src/api/client';
import * as api from '../../src/api/endpoints';
import { Settings } from '../../src/pages/Settings';
import { renderWithProviders } from '../utils';
import { mockApi } from './fixtures';

vi.mock('../../src/api/endpoints');

const legacy = { v: 1, userName: '', theme: 'system', accounts: [{ id: 'a' }], cards: [], categories: [], transactions: [{ id: 't1' }, { id: 't2' }], budgets: [], goals: [] };
beforeEach(() => { mockApi(); });

describe('Settings', () => {
  it('changing the language saves the full triple to /me', async () => {
    vi.mocked(api.putMe).mockResolvedValue({ locale: 'en', currency: 'BRL', timezone: 'America/Sao_Paulo' });
    renderWithProviders(<Settings />);
    await userEvent.selectOptions(await screen.findByLabelText('Idioma'), 'en');
    expect(api.putMe).toHaveBeenCalledWith({ locale: 'en', currency: 'BRL', timezone: 'America/Sao_Paulo' });
  });
  it('an unlisted profile currency is prepended and kept selected (never shown as another currency)', async () => {
    vi.mocked(api.putMe).mockResolvedValue({ locale: 'pt-BR', currency: 'GBP', timezone: 'UTC' });
    renderWithProviders(<Settings />, { currency: 'GBP' });
    const sel = await screen.findByLabelText('Moeda') as HTMLSelectElement;
    expect([...sel.options].map(o => o.value)).toEqual(['GBP', 'BRL', 'USD', 'EUR']);
    expect(sel.value).toBe('GBP');
    await userEvent.selectOptions(screen.getByLabelText('Fuso horário'), 'UTC');
    expect(api.putMe).toHaveBeenLastCalledWith({ locale: 'pt-BR', currency: 'GBP', timezone: 'UTC' });
  });
  it('currency and timezone changes keep the other values', async () => {
    vi.mocked(api.putMe).mockResolvedValue({ locale: 'pt-BR', currency: 'USD', timezone: 'UTC' });
    renderWithProviders(<Settings />);
    await userEvent.selectOptions(await screen.findByLabelText('Moeda'), 'USD');
    expect(api.putMe).toHaveBeenLastCalledWith({ locale: 'pt-BR', currency: 'USD', timezone: 'America/Sao_Paulo' });
    await userEvent.selectOptions(screen.getByLabelText('Fuso horário'), 'UTC');
    expect(api.putMe).toHaveBeenLastCalledWith({ locale: 'pt-BR', currency: 'BRL', timezone: 'UTC' });
  });
  it('theme and display name are local preferences', async () => {
    renderWithProviders(<Settings />);
    await userEvent.click(await screen.findByRole('button', { name: 'Escuro' }));
    await userEvent.type(screen.getByLabelText('Seu nome'), 'Matheus');
    expect(JSON.parse(localStorage.getItem('financeControl:prefs')!)).toMatchObject({ theme: 'dark', userName: 'Matheus' });
    expect(api.putMe).not.toHaveBeenCalled();
  });
  it('no legacy data → no import card', async () => {
    renderWithProviders(<Settings />);
    await screen.findByLabelText('Idioma');
    expect(screen.queryByText('Importar deste navegador')).not.toBeInTheDocument();
  });
  it('legacy data: import posts the stored state, shows counts, then offers to delete the local copy', async () => {
    localStorage.setItem('financeControl:v1', JSON.stringify(legacy));
    vi.mocked(api.importState).mockResolvedValue({ accounts: 1, cards: 0, categories: 0, transactions: 1, budgets: 0, goals: 0, receiptsSkipped: 0, skippedTransactions: 1, skippedBudgets: 0 });
    renderWithProviders(<Settings />);
    expect(await screen.findByText(/Encontramos 1 contas, 0 cartões, 2 transações/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Importar' }));
    expect(api.importState).toHaveBeenCalledWith(legacy);
    expect(await screen.findByText(/Importado: 1 contas, 0 cartões, 0 categorias novas, 1 transações/)).toBeInTheDocument();
    expect(screen.getByText(/Ignorados: 1 transações, 0 orçamentos, 0 comprovantes/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Apagar a cópia local' }));
    expect(localStorage.getItem('financeControl:v1')).toBeNull();
    expect(screen.queryByText('Importar deste navegador')).not.toBeInTheDocument();
  });
  it('ALREADY_HAS_DATA is shown translated and the local copy is kept', async () => {
    localStorage.setItem('financeControl:v1', JSON.stringify(legacy));
    vi.mocked(api.importState).mockRejectedValue(new ApiError(409, 'ALREADY_HAS_DATA', 'x'));
    renderWithProviders(<Settings />);
    await userEvent.click(await screen.findByRole('button', { name: 'Importar' }));
    expect(await screen.findByText('Sua conta já tem dados, então a importação não é permitida.')).toBeInTheDocument();
    expect(localStorage.getItem('financeControl:v1')).not.toBeNull();
  });
  it('log out', async () => {
    const { backend } = renderWithProviders(<Settings />);
    await userEvent.click(await screen.findByRole('button', { name: 'Sair' }));
    expect(backend.signOut).toHaveBeenCalled();
  });
});

describe('Settings robustness', () => {
  it('a failed PUT /me shows a translated alert and never claims Saved', async () => {
    vi.mocked(api.putMe).mockRejectedValue(new ApiError(500, 'INTERNAL', 'x'));
    renderWithProviders(<Settings />);
    await userEvent.selectOptions(await screen.findByLabelText('Moeda'), 'USD');
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.queryByText('Salvo.')).not.toBeInTheDocument();
  });
  it('a successful save shows Saved. and a new failing attempt clears it', async () => {
    vi.mocked(api.putMe).mockResolvedValueOnce({ locale: 'pt-BR', currency: 'USD', timezone: 'America/Sao_Paulo' });
    renderWithProviders(<Settings />);
    await userEvent.selectOptions(await screen.findByLabelText('Moeda'), 'USD');
    expect(await screen.findByText('Salvo.')).toBeInTheDocument();
    vi.mocked(api.putMe).mockRejectedValueOnce(new ApiError(500, 'INTERNAL', 'x'));
    await userEvent.selectOptions(screen.getByLabelText('Moeda'), 'EUR');
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.queryByText('Salvo.')).not.toBeInTheDocument();
  });
  it('the selects are disabled while a save is pending', async () => {
    vi.mocked(api.putMe).mockReturnValue(new Promise(() => {}));
    renderWithProviders(<Settings />);
    await userEvent.selectOptions(await screen.findByLabelText('Moeda'), 'USD');
    for (const l of ['Idioma', 'Moeda', 'Fuso horário']) expect(screen.getByLabelText(l)).toBeDisabled();
    expect(api.putMe).toHaveBeenCalledTimes(1);
  });
  it('a double click on Import posts once and the button is disabled while pending', async () => {
    localStorage.setItem('financeControl:v1', JSON.stringify(legacy));
    vi.mocked(api.importState).mockReturnValue(new Promise(() => {}));
    renderWithProviders(<Settings />);
    const btn = await screen.findByRole('button', { name: 'Importar' });
    await userEvent.dblClick(btn);
    expect(api.importState).toHaveBeenCalledTimes(1);
    expect(btn).toBeDisabled();
  });
  it('skipped line is hidden when nothing was skipped', async () => {
    localStorage.setItem('financeControl:v1', JSON.stringify(legacy));
    vi.mocked(api.importState).mockResolvedValue({ accounts: 1, cards: 0, categories: 0, transactions: 2, budgets: 0, goals: 0, receiptsSkipped: 0, skippedTransactions: 0, skippedBudgets: 0 });
    renderWithProviders(<Settings />);
    await userEvent.click(await screen.findByRole('button', { name: 'Importar' }));
    expect(await screen.findByText(/Importado: 1 contas, 0 cartões, 0 categorias novas, 2 transações/)).toBeInTheDocument();
    expect(screen.queryByText(/Ignorados/)).not.toBeInTheDocument();
  });
});
