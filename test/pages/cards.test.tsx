import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as api from '../../src/api/endpoints';
import { Cards } from '../../src/pages/Cards';
import { renderWithProviders } from '../utils';
import { account, card, mockApi, statement, tx } from './fixtures';

vi.mock('../../src/api/endpoints');

const nu = () => card({
  statements: [
    statement({ key: '2026-09', total: 310410, paid: 310410, status: 'paid', due: '2026-09-10', range: { start: '2026-08-04', end: '2026-09-03' } }),
    statement({ key: '2026-10', total: 231844, paid: 50000, status: 'open', items: [tx({ id: 'i1', amount: 31250, desc: 'TV', inst: { i: 4, n: 12 }, date: '2026-10-04' })] }),
    statement({ key: '2026-11', total: 0, status: 'upcoming', due: '2026-11-10' }),
  ],
});

beforeEach(() => { mockApi({ listCards: [nu()], listAccounts: [account(), account({ id: 'a2', name: 'Caixinha' })] }); });

describe('Cards', () => {
  it('shows used/limit and the open statement with pt-BR formatting', async () => {
    renderWithProviders(<Cards />);
    const tile = await screen.findByRole('button', { name: /Nubank/ });
    expect(within(tile).getByText('R$ 2.318,44')).toBeInTheDocument(); // used on the card tile
    expect(screen.getAllByText('R$ 2.318,44')).toHaveLength(2); // tile + open statement total
    expect(screen.getByText(/Limite R\$ 6.000,00 · fecha dia 3 · vence dia 10/)).toBeInTheDocument();
    expect(screen.getByText('Aberta')).toBeInTheDocument();
    expect(screen.getByText(/Vence em 10\/10\/2026/)).toBeInTheDocument();
    expect(screen.getByText(/pago R\$ 500,00/)).toBeInTheDocument();
    expect(screen.getByText(/04\/09 – 03\/10|04\/09\/2026 – 03\/10\/2026/)).toBeInTheDocument();
    expect(screen.getByText('TV (4/12)')).toBeInTheDocument();
  });
  it('switching statements shows that statement (paid has no pay button)', async () => {
    renderWithProviders(<Cards />);
    await screen.findByText('Aberta');
    expect(screen.getByRole('button', { name: 'Pagar fatura' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('tab', { name: /set/i }));
    expect(await screen.findByText('Paga')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Pagar fatura' })).not.toBeInTheDocument();
  });
  it('pay statement defaults to the remaining amount and the card pay account, then calls the API', async () => {
    vi.mocked(api.payCard).mockResolvedValue(tx());
    renderWithProviders(<Cards />);
    await userEvent.click(await screen.findByRole('button', { name: 'Pagar fatura' }));
    const dlg = screen.getByRole('dialog');
    expect(within(dlg).getByLabelText('Valor')).toHaveValue('1818,44');
    expect(within(dlg).getByLabelText('Da conta')).toHaveValue('a1');
    await userEvent.click(within(dlg).getByRole('button', { name: 'Confirmar pagamento' }));
    expect(api.payCard).toHaveBeenCalledWith('k1', { amount: 181844, fromAccountId: 'a1', date: '2026-10-13' });
  });
  it('creates a card with numeric days and cents', async () => {
    vi.mocked(api.createCard).mockResolvedValue(card());
    renderWithProviders(<Cards />);
    await userEvent.click(await screen.findByRole('button', { name: /Novo cartão/ }));
    await userEvent.type(screen.getByLabelText('Nome do cartão'), 'Itaú Visa');
    await userEvent.selectOptions(screen.getByLabelText('Bandeira'), 'Visa');
    await userEvent.type(screen.getByLabelText('Limite de crédito'), '8.000,00');
    await userEvent.clear(screen.getByLabelText('Dia de fechamento'));
    await userEvent.type(screen.getByLabelText('Dia de fechamento'), '20');
    await userEvent.clear(screen.getByLabelText('Dia de vencimento'));
    await userEvent.type(screen.getByLabelText('Dia de vencimento'), '28');
    await userEvent.selectOptions(screen.getByLabelText('Paga com a conta'), 'a2');
    await userEvent.click(screen.getByRole('button', { name: 'Criar cartão' }));
    expect(api.createCard).toHaveBeenCalledWith({ name: 'Itaú Visa', network: 'Visa', limit: 800000, closeDay: 20, dueDay: 28, color: '#6E3FA0', payAccountId: 'a2' });
  });
  it('delete asks for confirmation and calls the API', async () => {
    vi.mocked(api.deleteCard).mockResolvedValue();
    renderWithProviders(<Cards />);
    await userEvent.click(await screen.findByRole('button', { name: 'Excluir' }));
    expect(screen.getByRole('dialog')).toHaveTextContent('Excluir Nubank?');
    await userEvent.click(screen.getByRole('button', { name: 'Excluir cartão' }));
    expect(api.deleteCard).toHaveBeenCalledWith('k1');
  });
  it('rejects a garbage limit on create without calling the API', async () => {
    renderWithProviders(<Cards />);
    await userEvent.click(await screen.findByRole('button', { name: /Novo cartão/ }));
    await userEvent.type(screen.getByLabelText('Nome do cartão'), 'X');
    await userEvent.type(screen.getByLabelText('Limite de crédito'), 'abc');
    await userEvent.click(screen.getByRole('button', { name: 'Criar cartão' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Informe um valor válido.');
    expect(api.createCard).not.toHaveBeenCalled();
  });
  it('creates with limit 0 when the limit is left empty', async () => {
    vi.mocked(api.createCard).mockResolvedValue(card());
    renderWithProviders(<Cards />);
    await userEvent.click(await screen.findByRole('button', { name: /Novo cartão/ }));
    await userEvent.type(screen.getByLabelText('Nome do cartão'), 'X');
    await userEvent.click(screen.getByRole('button', { name: 'Criar cartão' }));
    expect(api.createCard).toHaveBeenCalledWith(expect.objectContaining({ name: 'X', limit: 0 }));
  });
  it('rejects garbage or empty limit on edit without calling the API', async () => {
    renderWithProviders(<Cards />);
    await userEvent.click(await screen.findByRole('button', { name: 'Editar cartão' }));
    const limit = screen.getByLabelText('Limite de crédito');
    await userEvent.clear(limit);
    await userEvent.type(limit, 'abc');
    await userEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Informe um valor válido.');
    await userEvent.clear(limit);
    await userEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Informe um valor válido.');
    expect(api.updateCard).not.toHaveBeenCalled();
  });
  it('saves a zero-limit card unchanged on edit', async () => {
    mockApi({ listCards: [card({ limit: 0, used: 0 })], listAccounts: [account()] });
    vi.mocked(api.updateCard).mockResolvedValue(card({ limit: 0 }));
    renderWithProviders(<Cards />);
    await userEvent.click(await screen.findByRole('button', { name: 'Editar cartão' }));
    expect(screen.getByLabelText('Limite de crédito')).toHaveValue('0');
    await userEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }));
    expect(api.updateCard).toHaveBeenCalledWith('k1', expect.objectContaining({ limit: 0 }));
  });
  it.each(['', '0', '32', 'abc', '1.5', '-3'])('rejects invalid closing day %j with no API call', async bad => {
    renderWithProviders(<Cards />);
    await userEvent.click(await screen.findByRole('button', { name: /Novo cartão/ }));
    await userEvent.type(screen.getByLabelText('Nome do cartão'), 'X');
    const d = screen.getByLabelText('Dia de fechamento');
    await userEvent.clear(d);
    if (bad) await userEvent.type(d, bad);
    await userEvent.click(screen.getByRole('button', { name: 'Criar cartão' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Informe um dia de 1 a 31.');
    expect(api.createCard).not.toHaveBeenCalled();
  });
  it('rejects an invalid due day with no API call', async () => {
    renderWithProviders(<Cards />);
    await userEvent.click(await screen.findByRole('button', { name: /Novo cartão/ }));
    await userEvent.type(screen.getByLabelText('Nome do cartão'), 'X');
    const d = screen.getByLabelText('Dia de vencimento');
    await userEvent.clear(d);
    await userEvent.type(d, '32');
    await userEvent.click(screen.getByRole('button', { name: 'Criar cartão' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Informe um dia de 1 a 31.');
    expect(api.createCard).not.toHaveBeenCalled();
  });
  it.each(['1', '31', '20'])('accepts closing day %s', async ok => {
    vi.mocked(api.createCard).mockResolvedValue(card());
    renderWithProviders(<Cards />);
    await userEvent.click(await screen.findByRole('button', { name: /Novo cartão/ }));
    await userEvent.type(screen.getByLabelText('Nome do cartão'), 'X');
    const d = screen.getByLabelText('Dia de fechamento');
    await userEvent.clear(d);
    await userEvent.type(d, ok);
    await userEvent.click(screen.getByRole('button', { name: 'Criar cartão' }));
    expect(api.createCard).toHaveBeenCalledWith(expect.objectContaining({ closeDay: +ok }));
  });
  it('pay modal opened before accounts load preselects the first account and submits it', async () => {
    mockApi({ listCards: [card({ payAccountId: '' })] });
    let release!: (v: unknown) => void;
    vi.mocked(api.listAccounts).mockReturnValue(new Promise(r => { release = r; }) as never);
    vi.mocked(api.payCard).mockResolvedValue(tx());
    renderWithProviders(<Cards />);
    await userEvent.click(await screen.findByRole('button', { name: 'Pagar fatura' }));
    const dlg = screen.getByRole('dialog');
    release([account({ id: 'z', name: 'Old', archived: true }), account({ id: 'a2', name: 'Caixinha' })]);
    await within(dlg).findByRole('option', { name: 'Caixinha' });
    expect(within(dlg).queryByRole('option', { name: 'Old' })).not.toBeInTheDocument();
    expect(within(dlg).getByLabelText('Da conta')).toHaveValue('a2');
    await userEvent.click(within(dlg).getByRole('button', { name: 'Confirmar pagamento' }));
    expect(api.payCard).toHaveBeenCalledWith('k1', expect.objectContaining({ fromAccountId: 'a2' }));
  });
  it('pay modal ignores a stale card payAccountId and uses the live account', async () => {
    mockApi({ listCards: [card({ payAccountId: 'gone' })], listAccounts: [account({ id: 'a9', name: 'Live' })] });
    vi.mocked(api.payCard).mockResolvedValue(tx());
    renderWithProviders(<Cards />);
    await userEvent.click(await screen.findByRole('button', { name: 'Pagar fatura' }));
    const dlg = screen.getByRole('dialog');
    await within(dlg).findByRole('option', { name: 'Live' });
    expect(within(dlg).getByLabelText('Da conta')).toHaveValue('a9');
    await userEvent.click(within(dlg).getByRole('button', { name: 'Confirmar pagamento' }));
    expect(api.payCard).toHaveBeenCalledWith('k1', expect.objectContaining({ fromAccountId: 'a9' }));
  });
  it('pay modal with only archived accounts shows the need-account error and does not pay', async () => {
    mockApi({ listCards: [card({ payAccountId: 'a1' })], listAccounts: [account({ archived: true })] });
    renderWithProviders(<Cards />);
    await userEvent.click(await screen.findByRole('button', { name: 'Pagar fatura' }));
    const dlg = screen.getByRole('dialog');
    await userEvent.click(within(dlg).getByRole('button', { name: 'Confirmar pagamento' }));
    expect(await within(dlg).findByRole('alert')).toHaveTextContent('Adicione uma conta primeiro para pagar.');
    expect(api.payCard).not.toHaveBeenCalled();
  });
  it('pay modal falls back when an explicit pick disappears after a refetch', async () => {
    mockApi({ listCards: [card()], listAccounts: [account(), account({ id: 'a2', name: 'Caixinha' })] });
    vi.mocked(api.payCard).mockResolvedValue(tx());
    const { qc } = renderWithProviders(<Cards />);
    await userEvent.click(await screen.findByRole('button', { name: 'Pagar fatura' }));
    const dlg = screen.getByRole('dialog');
    await userEvent.selectOptions(within(dlg).getByLabelText('Da conta'), 'a2');
    vi.mocked(api.listAccounts).mockResolvedValue([account()]);
    await qc.invalidateQueries();
    await waitFor(() => expect(within(dlg).queryByRole('option', { name: 'Caixinha' })).not.toBeInTheDocument());
    expect(within(dlg).getByLabelText('Da conta')).toHaveValue('a1');
    await userEvent.click(within(dlg).getByRole('button', { name: 'Confirmar pagamento' }));
    expect(api.payCard).toHaveBeenCalledWith('k1', expect.objectContaining({ fromAccountId: 'a1' }));
  });
  it.each([[' 20 ', 20], ['05', 5]])('accepts day input %j as %i', async (typed, expected) => {
    vi.mocked(api.createCard).mockResolvedValue(card());
    renderWithProviders(<Cards />);
    await userEvent.click(await screen.findByRole('button', { name: /Novo cartão/ }));
    await userEvent.type(screen.getByLabelText('Nome do cartão'), 'X');
    const d = screen.getByLabelText('Dia de vencimento');
    await userEvent.clear(d);
    await userEvent.type(d, typed);
    await userEvent.click(screen.getByRole('button', { name: 'Criar cartão' }));
    expect(api.createCard).toHaveBeenCalledWith(expect.objectContaining({ dueDay: expected }));
  });
  it('deleting a card resets the selected statement tab', async () => {
    vi.mocked(api.deleteCard).mockResolvedValue();
    renderWithProviders(<Cards />);
    await screen.findByText('Aberta');
    await userEvent.click(screen.getByRole('tab', { name: /set/i }));
    expect(await screen.findByText('Paga')).toBeInTheDocument();
    vi.mocked(api.listCards).mockResolvedValue([{ ...nu(), id: 'k2', name: 'Outro' }]);
    await userEvent.click(screen.getByRole('button', { name: 'Excluir' }));
    await userEvent.click(screen.getByRole('button', { name: 'Excluir cartão' }));
    expect(await screen.findByText('Aberta')).toBeInTheDocument();
    expect(screen.queryByText('Paga')).not.toBeInTheDocument();
  });
  it('empty state', async () => {
    mockApi();
    renderWithProviders(<Cards />);
    expect(await screen.findByText('Nenhum cartão de crédito ainda.')).toBeInTheDocument();
  });
});
