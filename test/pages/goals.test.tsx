import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as api from '../../src/api/endpoints';
import { Goals } from '../../src/pages/Goals';
import { renderWithProviders } from '../utils';
import { account, goal, mockApi } from './fixtures';

vi.mock('../../src/api/endpoints');
beforeEach(() => {
  mockApi({
    listGoals: [goal(), goal({ id: 'g2', name: 'Reserva', target: 100000, saved: 100000, pct: 100, left: 0, monthlyNeeded: 0, targetDate: '', accountId: '' })],
    listAccounts: [account(), account({ id: 'a2', name: 'Caixinha', kind: 'savings' })],
  });
});

describe('Goals', () => {
  it('shows server progress and the monthly need', async () => {
    renderWithProviders(<Goals />);
    expect(await screen.findByText('Viagem')).toBeInTheDocument();
    expect(screen.getByText('30%')).toBeInTheDocument();
    expect(screen.getByText(/R\$ 700,00 por mês · faltam 3 m/)).toBeInTheDocument();
    expect(screen.getByText('Meta atingida')).toBeInTheDocument();
    expect(screen.getByText(/de R\$ 4\.000,00 · 48%/)).toBeInTheDocument();
  });
  it('creates a goal with cents and a yyyy-mm target month', async () => {
    vi.mocked(api.createGoal).mockResolvedValue(goal());
    renderWithProviders(<Goals />);
    await userEvent.click(await screen.findByRole('button', { name: /Nova meta/ }));
    await userEvent.type(screen.getByLabelText('Nome da meta'), 'Japão');
    await userEvent.selectOptions(screen.getByLabelText('Conta poupança vinculada'), 'a2');
    await userEvent.type(screen.getByLabelText('Valor alvo'), '15.000,00');
    await userEvent.type(screen.getByLabelText('Mês alvo'), '2027-06');
    await userEvent.type(screen.getByLabelText('Já guardado'), '100');
    await userEvent.click(screen.getByRole('button', { name: 'Criar meta' }));
    expect(api.createGoal).toHaveBeenCalledWith({ name: 'Japão', accountId: 'a2', target: 1500000, targetDate: '2027-06', saved: 10000 });
  });
  it('validates name and target', async () => {
    renderWithProviders(<Goals />);
    await userEvent.click(await screen.findByRole('button', { name: /Nova meta/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Criar meta' }));
    expect(screen.getByText('Dê um nome à meta.')).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Nome da meta'), 'X');
    await userEvent.click(screen.getByRole('button', { name: 'Criar meta' }));
    expect(screen.getByText('Informe o valor alvo.')).toBeInTheDocument();
    expect(api.createGoal).not.toHaveBeenCalled();
  });
  it('add money from another account sends the contribution without a date', async () => {
    vi.mocked(api.contributeGoal).mockResolvedValue(goal());
    renderWithProviders(<Goals />);
    const card = (await screen.findByText('Viagem')).closest('section') as HTMLElement;
    await userEvent.click(within(card).getByRole('button', { name: 'Adicionar dinheiro' }));
    const dlg = screen.getByRole('dialog');
    expect(within(dlg).getByLabelText('Da conta')).toHaveValue('a1');
    expect(dlg).toHaveTextContent('Registra uma transferência para Caixinha.');
    await userEvent.type(within(dlg).getByLabelText('Valor'), '100,00');
    await userEvent.click(within(dlg).getByRole('button', { name: 'Adicionar à meta' }));
    expect(api.contributeGoal).toHaveBeenCalledWith('g1', { amount: 10000, fromAccountId: 'a1' });
  });
  it('edit and delete', async () => {
    vi.mocked(api.updateGoal).mockResolvedValue(goal());
    vi.mocked(api.deleteGoal).mockResolvedValue();
    renderWithProviders(<Goals />);
    const card = (await screen.findByText('Viagem')).closest('section') as HTMLElement;
    await userEvent.click(within(card).getByRole('button', { name: 'Editar' }));
    const name = screen.getByLabelText('Nome da meta');
    await userEvent.clear(name);
    await userEvent.type(name, 'Japão 2027');
    await userEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }));
    expect(api.updateGoal).toHaveBeenCalledWith('g1', { name: 'Japão 2027', accountId: 'a2', target: 300000, targetDate: '2027-01', saved: 90000 });
    await userEvent.click(within(card).getByRole('button', { name: 'Excluir' }));
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Excluir meta' }));
    expect(api.deleteGoal).toHaveBeenCalledWith('g1');
  });
  it('empty state', async () => {
    mockApi();
    renderWithProviders(<Goals />);
    expect(await screen.findByText('Nenhuma meta ainda.')).toBeInTheDocument();
  });

  const openNew = async () => {
    renderWithProviders(<Goals />);
    await userEvent.click(await screen.findByRole('button', { name: /Nova meta/ }));
    await screen.findByRole('option', { name: 'Caixinha' });
  };
  it('garbage saved on create shows invalidAmount under that field and does not call the API', async () => {
    await openNew();
    await userEvent.type(screen.getByLabelText('Nome da meta'), 'X');
    await userEvent.type(screen.getByLabelText('Valor alvo'), '1000');
    await userEvent.type(screen.getByLabelText('Já guardado'), 'abc');
    await userEvent.click(screen.getByRole('button', { name: 'Criar meta' }));
    expect(screen.getByText('Informe um valor válido.')).toBeInTheDocument();
    expect(api.createGoal).not.toHaveBeenCalled();
  });
  it('empty saved on create means 0', async () => {
    vi.mocked(api.createGoal).mockResolvedValue(goal());
    await openNew();
    await userEvent.type(screen.getByLabelText('Nome da meta'), 'X');
    await userEvent.type(screen.getByLabelText('Valor alvo'), '1000');
    await userEvent.click(screen.getByRole('button', { name: 'Criar meta' }));
    expect(api.createGoal).toHaveBeenCalledWith({ name: 'X', accountId: '', target: 100000, targetDate: '', saved: 0 });
  });
  it.each(['', 'abc', '0'])('target %j is rejected under the target field', async txt => {
    await openNew();
    await userEvent.type(screen.getByLabelText('Nome da meta'), 'X');
    if (txt) await userEvent.type(screen.getByLabelText('Valor alvo'), txt);
    await userEvent.click(screen.getByRole('button', { name: 'Criar meta' }));
    expect(screen.getByText('Informe o valor alvo.')).toBeInTheDocument();
    expect(api.createGoal).not.toHaveBeenCalled();
  });
  it('edit: garbage or empty saved is invalid', async () => {
    renderWithProviders(<Goals />);
    const card = (await screen.findByText('Viagem')).closest('section') as HTMLElement;
    await userEvent.click(within(card).getByRole('button', { name: 'Editar' }));
    const saved = screen.getByLabelText('Já guardado');
    await userEvent.clear(saved);
    await userEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }));
    expect(screen.getByText('Informe um valor válido.')).toBeInTheDocument();
    await userEvent.type(saved, 'abc');
    await userEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }));
    expect(screen.getByText('Informe um valor válido.')).toBeInTheDocument();
    expect(api.updateGoal).not.toHaveBeenCalled();
  });
  it('edit with saved 0 starts as 0 and is submitted unchanged', async () => {
    mockApi({ listGoals: [goal({ saved: 0, pct: 0, left: 300000 })], listAccounts: [account(), account({ id: 'a2', name: 'Caixinha' })] });
    vi.mocked(api.updateGoal).mockResolvedValue(goal());
    renderWithProviders(<Goals />);
    const card = (await screen.findByText('Viagem')).closest('section') as HTMLElement;
    await userEvent.click(within(card).getByRole('button', { name: 'Editar' }));
    expect(screen.getByLabelText('Já guardado')).toHaveValue('0');
    await screen.findByRole('option', { name: 'Caixinha' });
    await userEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }));
    expect(api.updateGoal).toHaveBeenCalledWith('g1', { name: 'Viagem', accountId: 'a2', target: 300000, targetDate: '2027-01', saved: 0 });
  });
  it('linked account that is archived stays selectable (marked archived) and the link is kept', async () => {
    mockApi({
      listGoals: [goal({ accountId: 'a2' })],
      listAccounts: [account(), account({ id: 'a2', name: 'Caixinha', archived: true }), account({ id: 'a3', name: 'Velha', archived: true })],
    });
    vi.mocked(api.updateGoal).mockResolvedValue(goal());
    renderWithProviders(<Goals />);
    const card = (await screen.findByText('Viagem')).closest('section') as HTMLElement;
    await userEvent.click(within(card).getByRole('button', { name: 'Editar' }));
    await screen.findByRole('option', { name: 'Caixinha · Arquivada' });
    expect(screen.getByLabelText('Conta poupança vinculada')).toHaveValue('a2');
    expect(screen.queryByRole('option', { name: /Velha/ })).not.toBeInTheDocument();
    expect(screen.queryByText(/não existe mais/)).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }));
    expect(api.updateGoal).toHaveBeenCalledWith('g1', expect.objectContaining({ accountId: 'a2' }));
  });
  it('linked account that no longer exists falls back to none with a note and is never submitted', async () => {
    mockApi({
      listGoals: [goal({ accountId: 'gone' })],
      listAccounts: [account(), account({ id: 'a2', name: 'Caixinha', archived: true })],
    });
    vi.mocked(api.updateGoal).mockResolvedValue(goal());
    renderWithProviders(<Goals />);
    const card = (await screen.findByText('Viagem')).closest('section') as HTMLElement;
    await userEvent.click(within(card).getByRole('button', { name: 'Editar' }));
    await screen.findByRole('option', { name: 'Itaú' });
    expect(screen.getByLabelText('Conta poupança vinculada')).toHaveValue('');
    expect(screen.queryByRole('option', { name: /Caixinha/ })).not.toBeInTheDocument();
    expect(screen.getByText('A conta vinculada não existe mais; a meta será salva sem conta.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }));
    expect(api.updateGoal).toHaveBeenCalledWith('g1', expect.objectContaining({ accountId: '' }));
  });
  it('add money: garbage and zero amounts are rejected', async () => {
    renderWithProviders(<Goals />);
    const card = (await screen.findByText('Viagem')).closest('section') as HTMLElement;
    await userEvent.click(within(card).getByRole('button', { name: 'Adicionar dinheiro' }));
    const dlg = screen.getByRole('dialog');
    await userEvent.click(within(dlg).getByRole('button', { name: 'Adicionar à meta' }));
    expect(within(dlg).getByText('Informe um valor.')).toBeInTheDocument();
    await userEvent.type(within(dlg).getByLabelText('Valor'), 'abc');
    await userEvent.click(within(dlg).getByRole('button', { name: 'Adicionar à meta' }));
    expect(within(dlg).getByText('Informe um valor válido.')).toBeInTheDocument();
    expect(api.contributeGoal).not.toHaveBeenCalled();
  });
  it('add money with a stale linked account and only archived others never sends an unlisted id', async () => {
    mockApi({
      listGoals: [goal({ accountId: 'gone' })],
      listAccounts: [account(), account({ id: 'a2', name: 'Caixinha', archived: true })],
    });
    vi.mocked(api.contributeGoal).mockResolvedValue(goal());
    renderWithProviders(<Goals />);
    const card = (await screen.findByText('Viagem')).closest('section') as HTMLElement;
    await userEvent.click(within(card).getByRole('button', { name: 'Adicionar dinheiro' }));
    const dlg = screen.getByRole('dialog');
    await within(dlg).findByRole('option', { name: 'Itaú' });
    expect(within(dlg).getByLabelText('Da conta')).toHaveValue('a1');
    await userEvent.type(within(dlg).getByLabelText('Valor'), '10');
    await userEvent.click(within(dlg).getByRole('button', { name: 'Adicionar à meta' }));
    expect(api.contributeGoal).toHaveBeenCalledWith('g1', { amount: 1000, fromAccountId: 'a1' });
  });
  it('add money with no listed account shows needAccount and does not call the API', async () => {
    mockApi({ listGoals: [goal()], listAccounts: [account({ archived: true })] });
    renderWithProviders(<Goals />);
    const card = (await screen.findByText('Viagem')).closest('section') as HTMLElement;
    await userEvent.click(within(card).getByRole('button', { name: 'Adicionar dinheiro' }));
    const dlg = screen.getByRole('dialog');
    await userEvent.type(within(dlg).getByLabelText('Valor'), '10');
    await userEvent.click(within(dlg).getByRole('button', { name: 'Adicionar à meta' }));
    expect(within(dlg).getByText('Adicione uma conta primeiro.')).toBeInTheDocument();
    expect(api.contributeGoal).not.toHaveBeenCalled();
  });
  it('accounts query failing does not block creating a goal', async () => {
    vi.mocked(api.listAccounts).mockRejectedValue(new Error('boom'));
    vi.mocked(api.createGoal).mockResolvedValue(goal());
    renderWithProviders(<Goals />);
    await userEvent.click(await screen.findByRole('button', { name: /Nova meta/ }));
    const dlg = await screen.findByRole('dialog');
    await within(dlg).findByRole('button', { name: 'Tentar novamente' });
    const create = within(dlg).getByRole('button', { name: 'Criar meta' });
    expect(create).toBeEnabled();
    await userEvent.type(within(dlg).getByLabelText('Nome da meta'), 'X');
    await userEvent.type(within(dlg).getByLabelText('Valor alvo'), '1000');
    await userEvent.click(create);
    expect(api.createGoal).toHaveBeenCalledWith({ name: 'X', accountId: '', target: 100000, targetDate: '', saved: 0 });
  });
  it('accounts failing blocks editing a linked goal until retry succeeds', async () => {
    vi.mocked(api.listAccounts).mockRejectedValue(new Error('boom'));
    renderWithProviders(<Goals />);
    const card = (await screen.findByText('Viagem')).closest('section') as HTMLElement;
    await userEvent.click(within(card).getByRole('button', { name: 'Editar' }));
    const dlg = screen.getByRole('dialog');
    const retry = await within(dlg).findByRole('button', { name: 'Tentar novamente' });
    expect(within(dlg).getAllByRole('alert').length).toBeGreaterThan(0);
    expect(within(dlg).getByRole('button', { name: 'Salvar alterações' })).toBeDisabled();
    vi.mocked(api.listAccounts).mockResolvedValue([account(), account({ id: 'a2', name: 'Caixinha' })]);
    await userEvent.click(retry);
    await waitFor(() => expect(within(dlg).getByRole('button', { name: 'Salvar alterações' })).toBeEnabled());
  });
  it('accounts pending disables Save', async () => {
    vi.mocked(api.listAccounts).mockReturnValue(new Promise(() => {}));
    renderWithProviders(<Goals />);
    await userEvent.click(await screen.findByRole('button', { name: /Nova meta/ }));
    expect(within(screen.getByRole('dialog')).getByRole('button', { name: 'Criar meta' })).toBeDisabled();
  });
  it('add money with accounts pending disables Add and shows no needAccount', async () => {
    vi.mocked(api.listAccounts).mockReturnValue(new Promise(() => {}));
    renderWithProviders(<Goals />);
    const card = (await screen.findByText('Viagem')).closest('section') as HTMLElement;
    await userEvent.click(within(card).getByRole('button', { name: 'Adicionar dinheiro' }));
    const dlg = screen.getByRole('dialog');
    expect(within(dlg).getByRole('button', { name: 'Adicionar à meta' })).toBeDisabled();
    expect(within(dlg).queryByText('Adicione uma conta primeiro.')).not.toBeInTheDocument();
  });
  it('add money with accounts failing shows error and retry', async () => {
    vi.mocked(api.listAccounts).mockRejectedValue(new Error('boom'));
    renderWithProviders(<Goals />);
    const card = (await screen.findByText('Viagem')).closest('section') as HTMLElement;
    await userEvent.click(within(card).getByRole('button', { name: 'Adicionar dinheiro' }));
    const dlg = screen.getByRole('dialog');
    expect(await within(dlg).findByRole('button', { name: 'Tentar novamente' })).toBeInTheDocument();
    expect(within(dlg).getByRole('button', { name: 'Adicionar à meta' })).toBeDisabled();
  });
  it('add money with a loaded empty list shows needAccount', async () => {
    mockApi({ listGoals: [goal()], listAccounts: [] });
    renderWithProviders(<Goals />);
    const card = (await screen.findByText('Viagem')).closest('section') as HTMLElement;
    await userEvent.click(within(card).getByRole('button', { name: 'Adicionar dinheiro' }));
    const dlg = screen.getByRole('dialog');
    await waitFor(() => expect(within(dlg).getByRole('button', { name: 'Adicionar à meta' })).toBeEnabled());
    await userEvent.type(within(dlg).getByLabelText('Valor'), '10');
    await userEvent.click(within(dlg).getByRole('button', { name: 'Adicionar à meta' }));
    expect(within(dlg).getByText('Adicione uma conta primeiro.')).toBeInTheDocument();
  });
  it('reached goal with a linked account shows the account', async () => {
    mockApi({ listGoals: [goal({ left: 0, pct: 100, saved: 300000 })], listAccounts: [account({ id: 'a2', name: 'Caixinha' })] });
    renderWithProviders(<Goals />);
    expect(await screen.findByText('Meta atingida · em Caixinha')).toBeInTheDocument();
  });
});
