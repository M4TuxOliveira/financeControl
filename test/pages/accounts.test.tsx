import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../src/api/client';
import * as api from '../../src/api/endpoints';
import { Accounts } from '../../src/pages/Accounts';
import { renderWithProviders } from '../utils';
import { account, mockApi, overview } from './fixtures';

vi.mock('../../src/api/endpoints');

beforeEach(() => {
  mockApi({
    listAccounts: [account({ opening: 100000, balance: 90000 }), account({ id: 'a2', name: 'Caixinha', kind: 'savings', balance: 1088000, opening: 1088000 })],
    getOverview: overview({ totalBalance: 1178000 }),
  });
});

describe('Accounts list', () => {
  it('shows server balances in pt-BR, translated kinds and the overview total', async () => {
    renderWithProviders(<Accounts />);
    const itau = (await screen.findByText('Itaú')).closest('.trow') as HTMLElement;
    expect(within(itau).getByText('R$ 900,00')).toBeInTheDocument();
    const caixa = screen.getByText('Caixinha').closest('.trow') as HTMLElement;
    expect(within(caixa).getByText('R$ 10.880,00')).toBeInTheDocument();
    expect(await screen.findByText('R$ 11.780,00')).toBeInTheDocument();
    expect(screen.getAllByText('Poupança').length).toBeGreaterThan(0);
  });
  it('empty state offers to add an account', async () => {
    mockApi();
    renderWithProviders(<Accounts />);
    expect(await screen.findByText('Nenhuma conta ainda.')).toBeInTheDocument();
  });
});

describe('Account form', () => {
  it('create sends cents (pt-BR input) and defaults', async () => {
    vi.mocked(api.createAccount).mockResolvedValue(account());
    renderWithProviders(<Accounts />);
    await userEvent.click(await screen.findByRole('button', { name: /Nova conta/ }));
    await userEvent.type(screen.getByLabelText('Nome da conta'), 'Wallet');
    await userEvent.click(screen.getByRole('button', { name: 'Dinheiro' }));
    await userEvent.type(screen.getByLabelText('Saldo inicial'), '1.234,56');
    await userEvent.click(screen.getByRole('button', { name: 'Criar conta' }));
    expect(api.createAccount).toHaveBeenCalledWith({ name: 'Wallet', kind: 'cash', bank: '', color: '#1F4E79', inTotal: true, opening: 123456 });
  });
  it('negative opening balance is supported', async () => {
    vi.mocked(api.createAccount).mockResolvedValue(account());
    renderWithProviders(<Accounts />);
    await userEvent.click(await screen.findByRole('button', { name: /Nova conta/ }));
    await userEvent.type(screen.getByLabelText('Nome da conta'), 'Overdraft');
    await userEvent.type(screen.getByLabelText('Saldo inicial'), '-50,00');
    await userEvent.click(screen.getByRole('button', { name: 'Criar conta' }));
    expect(vi.mocked(api.createAccount).mock.calls[0][0].opening).toBe(-5000);
  });
  it('requires a name and shows the translated validation', async () => {
    renderWithProviders(<Accounts />);
    await userEvent.click(await screen.findByRole('button', { name: /Nova conta/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Criar conta' }));
    expect(screen.getByText('Dê um nome à conta.')).toBeInTheDocument();
    expect(api.createAccount).not.toHaveBeenCalled();
  });
  it('edit converts the typed current balance into an opening-balance adjustment', async () => {
    vi.mocked(api.updateAccount).mockResolvedValue(account());
    renderWithProviders(<Accounts />);
    const row = (await screen.findByText('Itaú')).closest('.trow') as HTMLElement;
    await userEvent.click(within(row).getByRole('button', { name: 'Editar' }));
    const bal = screen.getByLabelText('Saldo atual');
    expect(bal).toHaveValue('900,00');
    await userEvent.clear(bal);
    await userEvent.type(bal, '950,00');
    await userEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }));
    expect(api.updateAccount).toHaveBeenCalledWith('a1', { name: 'Itaú', kind: 'checking', bank: 'Itaú Unibanco', color: '#1F4E79', inTotal: true, opening: 105000 });
  });
  it('archive sends only the archived flag', async () => {
    vi.mocked(api.updateAccount).mockResolvedValue(account());
    renderWithProviders(<Accounts />);
    const row = (await screen.findByText('Itaú')).closest('.trow') as HTMLElement;
    await userEvent.click(within(row).getByRole('button', { name: 'Editar' }));
    await userEvent.click(screen.getByRole('button', { name: 'Arquivar' }));
    expect(api.updateAccount).toHaveBeenCalledWith('a1', { archived: true });
  });
  it('shows a translated API error and keeps the form open', async () => {
    vi.mocked(api.createAccount).mockRejectedValue(new ApiError(400, 'VALIDATION_FAILED', 'x'));
    renderWithProviders(<Accounts />);
    await userEvent.click(await screen.findByRole('button', { name: /Nova conta/ }));
    await userEvent.type(screen.getByLabelText('Nome da conta'), 'X');
    await userEvent.click(screen.getByRole('button', { name: 'Criar conta' }));
    expect(await screen.findByText('Alguns campos são inválidos.')).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
});

describe('Delete account', () => {
  it('moves transactions to the chosen account', async () => {
    vi.mocked(api.deleteAccount).mockResolvedValue();
    renderWithProviders(<Accounts />);
    const row = (await screen.findByText('Itaú')).closest('.trow') as HTMLElement;
    await userEvent.click(within(row).getByRole('button', { name: 'Excluir' }));
    expect(screen.getByRole('dialog')).toHaveTextContent('Excluir Itaú?');
    await userEvent.click(screen.getByRole('button', { name: 'Excluir conta' }));
    expect(api.deleteAccount).toHaveBeenCalledWith('a1', 'a2');
  });
  it('can delete with all transactions', async () => {
    vi.mocked(api.deleteAccount).mockResolvedValue();
    renderWithProviders(<Accounts />);
    const row = (await screen.findByText('Itaú')).closest('.trow') as HTMLElement;
    await userEvent.click(within(row).getByRole('button', { name: 'Excluir' }));
    await userEvent.click(screen.getByLabelText(/Excluir a conta e todas as suas transações/));
    await userEvent.click(screen.getByRole('button', { name: 'Excluir conta' }));
    expect(api.deleteAccount).toHaveBeenCalledWith('a1', undefined);
  });
  it('keeps the dialog open with a translated error when the delete fails', async () => {
    vi.mocked(api.deleteAccount).mockRejectedValue(new ApiError(409, 'MOVE_TARGET_INVALID', 'x'));
    renderWithProviders(<Accounts />);
    const row = (await screen.findByText('Itaú')).closest('.trow') as HTMLElement;
    await userEvent.click(within(row).getByRole('button', { name: 'Excluir' }));
    await userEvent.click(screen.getByRole('button', { name: 'Excluir conta' }));
    expect(await screen.findByText('Escolha outro destino para mover os dados.')).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
});
