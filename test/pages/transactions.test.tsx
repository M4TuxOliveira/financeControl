import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../src/api/client';
import * as api from '../../src/api/endpoints';
import * as receipt from '../../src/api/receipt';
import { Transactions } from '../../src/pages/Transactions';
import { renderWithProviders } from '../utils';
import { account, CATS, card, mockApi, tx } from './fixtures';

vi.mock('../../src/api/endpoints');
vi.mock('../../src/api/receipt');

const list = (items = [tx(), tx({ id: 't2', type: 'income', amount: 980000, desc: 'Salário', accountId: 'a1', categoryId: undefined, date: '2026-10-10' })]) =>
  ({ items, totals: { income: 980000, expense: 8690, net: 971310 } });

beforeEach(() => {
  location.hash = '#/transactions';
  mockApi({ listTransactions: list(), listAccounts: [account(), account({ id: 'a2', name: 'Caixinha' })], listCards: [card()] });
});

describe('Transactions list', () => {
  it('queries the current month and renders signed pt-BR amounts and translated categories', async () => {
    renderWithProviders(<Transactions />);
    const expenseRow = (await screen.findByText('iFood')).closest('.trow') as HTMLElement;
    expect(within(expenseRow).getByText('− R$ 86,90')).toBeInTheDocument();
    expect(within(screen.getByText('Salário').closest('.trow') as HTMLElement).getByText('+ R$ 9.800,00')).toBeInTheDocument();
    expect(screen.getByText('Alimentação › Delivery')).toBeInTheDocument();
    expect(api.listTransactions).toHaveBeenCalledWith({ month: '2026-10' });
    expect(screen.getByText(/outubro de 2026 · 2 transações/)).toBeInTheDocument();
  });
  it('search, month switch and all-time map to query params', async () => {
    renderWithProviders(<Transactions />);
    await screen.findByText('iFood');
    expect(screen.getAllByText('− R$ 86,90')).toHaveLength(2); // the row and the expenses KPI
    await userEvent.type(screen.getByLabelText('Buscar descrição, tag, observação'), 'ifood');
    await waitFor(() => expect(api.listTransactions).toHaveBeenCalledWith({ month: '2026-10', q: 'ifood' }));
    await userEvent.click(screen.getByRole('button', { name: 'Mês anterior' }));
    await waitFor(() => expect(api.listTransactions).toHaveBeenCalledWith({ month: '2026-09', q: 'ifood' }));
    await userEvent.click(screen.getByRole('button', { name: 'Todo o período' }));
    await waitFor(() => expect(api.listTransactions).toHaveBeenCalledWith({ q: 'ifood' }));
  });
  it('tag filter is normalized to start with #; type and account selects are sent', async () => {
    renderWithProviders(<Transactions />);
    await screen.findByText('iFood');
    expect(screen.getAllByText('− R$ 86,90')).toHaveLength(2); // the row and the expenses KPI
    await userEvent.type(screen.getByLabelText('Tag (ex.: #viagem)'), 'trip');
    await userEvent.selectOptions(screen.getByLabelText('Tipo'), 'income');
    await userEvent.selectOptions(screen.getByLabelText('Conta'), 'a2');
    await waitFor(() => expect(api.listTransactions).toHaveBeenCalledWith({ month: '2026-10', tag: '#trip', type: 'income', account: 'a2' }));
  });
  it('system transfers have no Edit; a series row deletes with a scope', async () => {
    mockApi({
      listTransactions: list([
        tx({ id: 'sys', type: 'transfer', desc: 'Nubank', source: 'card_payment', accountId: 'a1', toId: 'k1', categoryId: undefined }),
        tx({ id: 's1', desc: 'TV', groupId: 'g', inst: { i: 2, n: 3 } }),
      ]),
      listAccounts: [account()], listCards: [card()],
    });
    vi.mocked(api.deleteTransaction).mockResolvedValue();
    renderWithProviders(<Transactions />);
    const sysRow = (await screen.findByText('Pagamento de fatura · Nubank')).closest('.trow') as HTMLElement;
    expect(within(sysRow).queryByRole('button', { name: 'Editar' })).not.toBeInTheDocument();
    const row = screen.getByText('TV').closest('.trow') as HTMLElement;
    expect(within(row).getByText(/Parcela 2\/3/)).toBeInTheDocument();
    await userEvent.click(within(row).getByRole('button', { name: 'Excluir' }));
    const dlg = screen.getByRole('dialog');
    await userEvent.click(within(dlg).getByLabelText('Esta e todas as futuras'));
    await userEvent.click(within(dlg).getByRole('button', { name: 'Excluir' }));
    expect(api.deleteTransaction).toHaveBeenCalledWith('s1', 'future');
  });
  it('shows the receipt link', async () => {
    mockApi({ listTransactions: list([tx({ receiptUrl: 'https://s3.test/r' })]), listAccounts: [account()], listCards: [] });
    renderWithProviders(<Transactions />);
    expect(await screen.findByRole('link', { name: 'Ver comprovante' })).toHaveAttribute('href', 'https://s3.test/r');
  });
  it('opens the form when the hash asks for a new transaction (mobile +)', async () => {
    location.hash = '#/transactions?new';
    renderWithProviders(<Transactions />);
    expect(await screen.findByRole('dialog')).toHaveTextContent('Nova transação');
    expect(location.hash).toBe('#/transactions');
  });
  it('no accounts → asks to add one first', async () => {
    mockApi({ listAccounts: [], listCards: [] });
    renderWithProviders(<Transactions />);
    await userEvent.click(await screen.findByRole('button', { name: /Nova transação/ }));
    expect(screen.getByRole('dialog')).toHaveTextContent('Adicione uma conta primeiro');
  });
});

describe('Transaction form', () => {
  const open = async () => {
    renderWithProviders(<Transactions />);
    await userEvent.click(await screen.findByRole('button', { name: /Nova transação/ }));
    return screen.getByRole('dialog');
  };

  it('creates an expense: pt-BR amount → cents, ISO date, category and subcategory', async () => {
    vi.mocked(api.createTransactions).mockResolvedValue([tx()]);
    const dlg = await open();
    await userEvent.type(within(dlg).getByLabelText('Valor'), '86,90');
    await userEvent.type(within(dlg).getByLabelText('Descrição'), 'iFood');
    await userEvent.selectOptions(within(dlg).getByLabelText('Categoria'), 'sys:food');
    await userEvent.selectOptions(within(dlg).getByLabelText('Subcategoria'), 'sys:food.delivery');
    await userEvent.type(within(dlg).getByLabelText('Tags'), 'fim, #casa');
    await userEvent.click(within(dlg).getByRole('button', { name: 'Salvar' }));
    expect(api.createTransactions).toHaveBeenCalledWith({
      type: 'expense', amount: 8690, date: '2026-10-13', desc: 'iFood', accountId: 'a1', categoryId: 'sys:food.delivery', tags: ['#fim', '#casa'], note: '',
    });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });
  it('installments: the stepper sets n and the payload carries installments, not repeat', async () => {
    vi.mocked(api.createTransactions).mockResolvedValue([tx()]);
    const dlg = await open();
    await userEvent.type(within(dlg).getByLabelText('Valor'), '300,00');
    await userEvent.type(within(dlg).getByLabelText('Descrição'), 'TV');
    await userEvent.selectOptions(within(dlg).getByLabelText('Conta ou cartão'), 'k1');
    await userEvent.click(within(dlg).getByLabelText('Dividir em parcelas'));
    await userEvent.click(within(dlg).getByRole('button', { name: 'Mais parcelas' }));
    expect(within(dlg).getByText('4 × R$ 75,00, uma por mês')).toBeInTheDocument();
    await userEvent.click(within(dlg).getByRole('button', { name: 'Salvar' }));
    const body = vi.mocked(api.createTransactions).mock.calls[0][0];
    expect(body).toMatchObject({ amount: 30000, accountId: 'k1', installments: 4 });
    expect(body).not.toHaveProperty('repeat');
  });
  it('repeat monthly is sent as repeat', async () => {
    vi.mocked(api.createTransactions).mockResolvedValue([tx()]);
    const dlg = await open();
    await userEvent.type(within(dlg).getByLabelText('Valor'), '40,90');
    await userEvent.type(within(dlg).getByLabelText('Descrição'), 'Spotify');
    await userEvent.selectOptions(within(dlg).getByLabelText('Repetir'), 'monthly');
    await userEvent.click(within(dlg).getByRole('button', { name: 'Salvar' }));
    expect(vi.mocked(api.createTransactions).mock.calls[0][0]).toMatchObject({ repeat: 'monthly' });
  });
  it('transfer needs two different accounts and sends toId without a category', async () => {
    vi.mocked(api.createTransactions).mockResolvedValue([tx()]);
    const dlg = await open();
    await userEvent.click(within(dlg).getByRole('button', { name: 'Transferência' }));
    await userEvent.type(within(dlg).getByLabelText('Valor'), '20,00');
    await userEvent.type(within(dlg).getByLabelText('Descrição'), 'Reserva');
    await userEvent.click(within(dlg).getByRole('button', { name: 'Salvar' }));
    expect(within(dlg).getByText('Escolha duas contas diferentes.')).toBeInTheDocument();
    await userEvent.selectOptions(within(dlg).getByLabelText('Para'), 'a2');
    await userEvent.click(within(dlg).getByRole('button', { name: 'Salvar' }));
    const body = vi.mocked(api.createTransactions).mock.calls[0][0];
    expect(body).toMatchObject({ type: 'transfer', amount: 2000, accountId: 'a1', toId: 'a2' });
    expect(body.categoryId).toBeUndefined();
  });
  it('validates amount and description before calling the API; shows translated API errors', async () => {
    vi.mocked(api.createTransactions).mockRejectedValue(new ApiError(409, 'INCOME_ON_CARD', 'x'));
    const dlg = await open();
    await userEvent.click(within(dlg).getByRole('button', { name: 'Salvar' }));
    expect(within(dlg).getByText('Informe um valor.')).toBeInTheDocument();
    await userEvent.type(within(dlg).getByLabelText('Valor'), '5');
    await userEvent.click(within(dlg).getByRole('button', { name: 'Salvar' }));
    expect(within(dlg).getByText('Adicione uma descrição.')).toBeInTheDocument();
    await userEvent.type(within(dlg).getByLabelText('Descrição'), 'x');
    await userEvent.click(within(dlg).getByRole('button', { name: 'Salvar' }));
    expect(await within(dlg).findByText('Receitas não podem ser lançadas em cartão de crédito.')).toBeInTheDocument();
  });
  it('save & add another keeps the dialog open and clears the amount/description', async () => {
    vi.mocked(api.createTransactions).mockResolvedValue([tx()]);
    const dlg = await open();
    await userEvent.type(within(dlg).getByLabelText('Valor'), '5,00');
    await userEvent.type(within(dlg).getByLabelText('Descrição'), 'Café');
    await userEvent.click(within(dlg).getByRole('button', { name: 'Salvar e adicionar outra' }));
    await waitFor(() => expect(api.createTransactions).toHaveBeenCalledTimes(1));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(within(screen.getByRole('dialog')).getByLabelText('Valor')).toHaveValue('');
    expect(within(screen.getByRole('dialog')).getByLabelText('Descrição')).toHaveValue('');
  });
  it('edit is a full replacement via PUT', async () => {
    vi.mocked(api.updateTransaction).mockResolvedValue(tx());
    renderWithProviders(<Transactions />);
    const row = (await screen.findByText('iFood')).closest('.trow') as HTMLElement;
    await userEvent.click(within(row).getByRole('button', { name: 'Editar' }));
    const dlg = screen.getByRole('dialog');
    expect(within(dlg).getByLabelText('Valor')).toHaveValue('86,90');
    const desc = within(dlg).getByLabelText('Descrição');
    await userEvent.clear(desc);
    await userEvent.type(desc, 'iFood jantar');
    await userEvent.click(within(dlg).getByRole('button', { name: 'Salvar alterações' }));
    expect(api.updateTransaction).toHaveBeenCalledWith('t1', {
      type: 'expense', amount: 8690, date: '2026-10-13', desc: 'iFood jantar', accountId: 'k1', categoryId: 'sys:food.delivery', tags: [], note: '',
    });
  });
});

describe('Receipts', () => {
  it('uploads the chosen file after the transaction is saved; failure keeps it saved and retries only the upload', async () => {
    vi.mocked(api.createTransactions).mockResolvedValue([tx({ id: 'new1' })]);
    vi.mocked(receipt.uploadReceipt).mockRejectedValueOnce(new Error('s3 down')).mockResolvedValueOnce();
    renderWithProviders(<Transactions />);
    await userEvent.click(await screen.findByRole('button', { name: /Nova transação/ }));
    const dlg = screen.getByRole('dialog');
    await userEvent.type(within(dlg).getByLabelText('Valor'), '9,90');
    await userEvent.type(within(dlg).getByLabelText('Descrição'), 'Padaria');
    const file = new File(['x'], 'r.png', { type: 'image/png' });
    await userEvent.upload(within(dlg).getByLabelText(/Clique para escolher uma imagem/), file);
    await userEvent.click(within(dlg).getByRole('button', { name: 'Salvar' }));
    expect(await within(dlg).findByText(/envio do comprovante falhou/)).toBeInTheDocument();
    expect(api.createTransactions).toHaveBeenCalledTimes(1);
    await userEvent.click(within(dlg).getByRole('button', { name: 'Salvar' }));
    await waitFor(() => expect(receipt.uploadReceipt).toHaveBeenCalledTimes(2));
    expect(receipt.uploadReceipt).toHaveBeenLastCalledWith('new1', file);
    expect(api.createTransactions).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });
  it('dev mode disables the receipt input and explains why', async () => {
    renderWithProviders(<Transactions />, { devMode: true });
    await userEvent.click(await screen.findByRole('button', { name: /Nova transação/ }));
    const dlg = screen.getByRole('dialog');
    expect(within(dlg).getByText(/não há S3 no ambiente local/)).toBeInTheDocument();
    expect(within(dlg).getByLabelText(/Clique para escolher uma imagem/)).toBeDisabled();
  });
});

describe('Project rules', () => {
  const open = async () => {
    renderWithProviders(<Transactions />);
    await userEvent.click(await screen.findByRole('button', { name: /Nova transação/ }));
    const dlg = screen.getByRole('dialog');
    await within(dlg).findByLabelText('Valor');
    return dlg;
  };
  const fieldOf = (dlg: HTMLElement, label: string) => within(dlg).getByLabelText(label).closest('.fld') as HTMLElement;

  it.each([['abc', 'Informe um valor válido.'], ['0', 'Informe um valor.'], ['0,00', 'Informe um valor.']])(
    'amount %j is rejected under the amount field without calling the API', async (txt, msg) => {
      const dlg = await open();
      await userEvent.type(within(dlg).getByLabelText('Valor'), txt);
      await userEvent.type(within(dlg).getByLabelText('Descrição'), 'x');
      await userEvent.click(within(dlg).getByRole('button', { name: 'Salvar' }));
      expect(within(fieldOf(dlg, 'Valor')).getByRole('alert')).toHaveTextContent(msg);
      expect(api.createTransactions).not.toHaveBeenCalled();
    });
  it('validation errors sit under their own fields', async () => {
    const dlg = await open();
    await userEvent.click(within(dlg).getByRole('button', { name: 'Salvar' }));
    expect(within(fieldOf(dlg, 'Valor')).getByRole('alert')).toHaveTextContent('Informe um valor.');
    expect(within(fieldOf(dlg, 'Descrição')).getByRole('alert')).toHaveTextContent('Adicione uma descrição.');
    expect(api.createTransactions).not.toHaveBeenCalled();
  });
  it('an empty date is rejected under the date field', async () => {
    const dlg = await open();
    await userEvent.type(within(dlg).getByLabelText('Valor'), '5,00');
    await userEvent.type(within(dlg).getByLabelText('Descrição'), 'x');
    fireEvent.change(within(dlg).getByLabelText('Data'), { target: { value: '' } });
    await userEvent.click(within(dlg).getByRole('button', { name: 'Salvar' }));
    expect(within(fieldOf(dlg, 'Data')).getByRole('alert')).toHaveTextContent('Escolha uma data.');
    expect(api.createTransactions).not.toHaveBeenCalled();
  });
  it('a chosen date is sent as ISO', async () => {
    vi.mocked(api.createTransactions).mockResolvedValue([tx()]);
    const dlg = await open();
    await userEvent.type(within(dlg).getByLabelText('Valor'), '5,00');
    await userEvent.type(within(dlg).getByLabelText('Descrição'), 'x');
    fireEvent.change(within(dlg).getByLabelText('Data'), { target: { value: '2026-11-02' } });
    await userEvent.click(within(dlg).getByRole('button', { name: 'Salvar' }));
    expect(api.createTransactions).toHaveBeenCalledWith(expect.objectContaining({ date: '2026-11-02' }));
  });
  it('income with only cards: no listed account → account error under the account field', async () => {
    mockApi({ listTransactions: list(), listAccounts: [account({ archived: true })], listCards: [card()] });
    const dlg = await open();
    await userEvent.click(within(dlg).getByRole('button', { name: 'Receita' }));
    expect(within(dlg).queryByRole('option', { name: 'Itaú' })).not.toBeInTheDocument();
    await userEvent.type(within(dlg).getByLabelText('Valor'), '5,00');
    await userEvent.type(within(dlg).getByLabelText('Descrição'), 'x');
    await userEvent.click(within(dlg).getByRole('button', { name: 'Salvar' }));
    expect(within(fieldOf(dlg, 'Conta')).getByRole('alert')).toHaveTextContent('Escolha uma conta.');
    expect(api.createTransactions).not.toHaveBeenCalled();
  });
  it('switching from a card expense to income falls back to a listed account', async () => {
    vi.mocked(api.createTransactions).mockResolvedValue([tx()]);
    const dlg = await open();
    await userEvent.selectOptions(within(dlg).getByLabelText('Conta ou cartão'), 'k1');
    await userEvent.click(within(dlg).getByRole('button', { name: 'Receita' }));
    expect(within(dlg).getByLabelText('Conta')).toHaveValue('a1');
    await userEvent.type(within(dlg).getByLabelText('Valor'), '5,00');
    await userEvent.type(within(dlg).getByLabelText('Descrição'), 'x');
    await userEvent.click(within(dlg).getByRole('button', { name: 'Salvar' }));
    expect(api.createTransactions).toHaveBeenCalledWith(expect.objectContaining({ type: 'income', accountId: 'a1' }));
  });
  it('a new transaction never lists archived accounts', async () => {
    mockApi({ listTransactions: list(), listAccounts: [account({ archived: true }), account({ id: 'a2', name: 'Caixinha' })], listCards: [card()] });
    const dlg = await open();
    expect(within(dlg).queryByRole('option', { name: 'Itaú' })).not.toBeInTheDocument();
    expect(within(dlg).getByLabelText('Conta ou cartão')).toHaveValue('a2');
  });
  it('editing a transaction on an archived account keeps that account listed and unchanged', async () => {
    mockApi({
      listTransactions: list([tx({ accountId: 'a1' })]),
      listAccounts: [account({ archived: true }), account({ id: 'a2', name: 'Caixinha' })], listCards: [card()],
    });
    vi.mocked(api.updateTransaction).mockResolvedValue(tx());
    renderWithProviders(<Transactions />);
    const row = (await screen.findByText('iFood')).closest('.trow') as HTMLElement;
    await userEvent.click(within(row).getByRole('button', { name: 'Editar' }));
    const dlg = screen.getByRole('dialog');
    const sel = await within(dlg).findByLabelText('Conta ou cartão');
    expect(sel).toHaveValue('a1');
    expect(within(sel).getByRole('option', { name: 'Itaú' })).toBeInTheDocument();
    await userEvent.click(within(dlg).getByRole('button', { name: 'Salvar alterações' }));
    expect(api.updateTransaction).toHaveBeenCalledWith('t1', expect.objectContaining({ accountId: 'a1', categoryId: 'sys:food.delivery' }));
  });
  it('editing a transaction whose category no longer exists does not submit the dangling id', async () => {
    mockApi({ listTransactions: list([tx({ categoryId: 'gone' })]), listAccounts: [account()], listCards: [card()] });
    vi.mocked(api.updateTransaction).mockResolvedValue(tx());
    renderWithProviders(<Transactions />);
    const row = (await screen.findByText('iFood')).closest('.trow') as HTMLElement;
    await userEvent.click(within(row).getByRole('button', { name: 'Editar' }));
    const dlg = screen.getByRole('dialog');
    expect(await within(dlg).findByLabelText('Categoria')).toHaveValue('');
    expect(within(dlg).getByLabelText('Subcategoria')).toHaveValue('');
    await userEvent.click(within(dlg).getByRole('button', { name: 'Salvar alterações' }));
    const body = vi.mocked(api.updateTransaction).mock.calls[0][1];
    expect(body.categoryId).toBeUndefined();
  });
  it('a transfer edit keeps a listed destination and never submits an unlisted one', async () => {
    mockApi({
      listTransactions: list([tx({ id: 'tr', type: 'transfer', desc: 'Reserva', accountId: 'a1', toId: 'gone', categoryId: undefined })]),
      listAccounts: [account(), account({ id: 'a2', name: 'Caixinha' })], listCards: [card()],
    });
    renderWithProviders(<Transactions />);
    const row = (await screen.findByText('Reserva')).closest('.trow') as HTMLElement;
    await userEvent.click(within(row).getByRole('button', { name: 'Editar' }));
    const dlg = screen.getByRole('dialog');
    expect(await within(dlg).findByLabelText('Para')).toHaveValue('');
    await userEvent.click(within(dlg).getByRole('button', { name: 'Salvar alterações' }));
    expect(within(fieldOf(dlg, 'Para')).getByRole('alert')).toHaveTextContent('Escolha duas contas diferentes.');
    expect(api.updateTransaction).not.toHaveBeenCalled();
  });
  it('opening the form while the lists load shows a loading state', async () => {
    mockApi({ listTransactions: list() });
    vi.mocked(api.listAccounts).mockReturnValue(new Promise(() => {}));
    renderWithProviders(<Transactions />);
    await userEvent.click(await screen.findByRole('button', { name: /Nova transação/ }));
    const dlg = screen.getByRole('dialog');
    expect(within(dlg).getByRole('status')).toHaveTextContent('Carregando…');
    expect(within(dlg).queryByLabelText('Valor')).not.toBeInTheDocument();
    expect(dlg).not.toHaveTextContent('Adicione uma conta primeiro');
  });
  it.each(['listAccounts', 'listCards', 'listCategories'] as const)('%s failing shows the translated error and a retry that recovers', async fn => {
    mockApi({ listTransactions: list(), listAccounts: [account()], listCards: [card()] });
    const ok = { listAccounts: [account()], listCards: [card()], listCategories: CATS }[fn];
    vi.mocked(api[fn]).mockRejectedValue(new ApiError(500, 'INTERNAL', 'x'));
    renderWithProviders(<Transactions />);
    await userEvent.click(await screen.findByRole('button', { name: /Nova transação/ }));
    const dlg = screen.getByRole('dialog');
    expect(await within(dlg).findByRole('alert')).toHaveTextContent('O servidor teve um problema. Tente novamente em instantes.');
    expect(within(dlg).queryByLabelText('Valor')).not.toBeInTheDocument();
    expect(dlg).not.toHaveTextContent('Adicione uma conta primeiro');
    (vi.mocked(api[fn]) as unknown as { mockResolvedValue: (v: unknown) => void }).mockResolvedValue(ok);
    await userEvent.click(within(dlg).getByRole('button', { name: 'Tentar novamente' }));
    expect(await within(dlg).findByLabelText('Valor')).toBeInTheDocument();
  });
  it('series edit shows the series note; system transfers keep Delete', async () => {
    mockApi({
      listTransactions: list([
        tx({ id: 'sys', type: 'transfer', desc: 'Nubank', source: 'card_payment', accountId: 'a1', toId: 'k1', categoryId: undefined }),
        tx({ id: 's1', desc: 'TV', groupId: 'g', inst: { i: 2, n: 3 } }),
      ]),
      listAccounts: [account()], listCards: [card()],
    });
    renderWithProviders(<Transactions />);
    const sysRow = (await screen.findByText('Pagamento de fatura · Nubank')).closest('.trow') as HTMLElement;
    expect(within(sysRow).getByRole('button', { name: 'Excluir' })).toBeInTheDocument();
    const row = screen.getByText('TV').closest('.trow') as HTMLElement;
    await userEvent.click(within(row).getByRole('button', { name: 'Editar' }));
    expect(await within(screen.getByRole('dialog')).findByText(/faz parte de uma série/)).toBeInTheDocument();
  });

  it('the list shows a translated error with a retry that recovers', async () => {
    vi.mocked(api.listTransactions).mockRejectedValueOnce(new ApiError(500, 'INTERNAL', 'x'));
    renderWithProviders(<Transactions />);
    expect(await screen.findByRole('alert')).toHaveTextContent('O servidor teve um problema. Tente novamente em instantes.');
    await userEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }));
    expect(await screen.findByText('iFood')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
  it('installments: an amount below n cents is rejected under the amount field', async () => {
    const dlg = await open();
    await userEvent.type(within(dlg).getByLabelText('Valor'), '0,02');
    await userEvent.type(within(dlg).getByLabelText('Descrição'), 'x');
    await userEvent.click(within(dlg).getByLabelText('Dividir em parcelas'));
    await userEvent.click(within(dlg).getByRole('button', { name: 'Salvar' }));
    expect(within(fieldOf(dlg, 'Valor')).getByRole('alert')).toHaveTextContent('O valor deve ser de pelo menos 3 centavos para dividir em 3 parcelas.');
    expect(api.createTransactions).not.toHaveBeenCalled();
  });
  it('installments: an amount of exactly n cents is allowed', async () => {
    vi.mocked(api.createTransactions).mockResolvedValue([tx()]);
    const dlg = await open();
    await userEvent.type(within(dlg).getByLabelText('Valor'), '0,03');
    await userEvent.type(within(dlg).getByLabelText('Descrição'), 'x');
    await userEvent.click(within(dlg).getByLabelText('Dividir em parcelas'));
    await userEvent.click(within(dlg).getByRole('button', { name: 'Salvar' }));
    expect(api.createTransactions).toHaveBeenCalledWith(expect.objectContaining({ amount: 3, installments: 3 }));
  });
  it('a mobile "+" while an Edit dialog is open shows an empty new-transaction form', async () => {
    renderWithProviders(<Transactions />);
    const row = (await screen.findByText('iFood')).closest('.trow') as HTMLElement;
    await userEvent.click(within(row).getByRole('button', { name: 'Editar' }));
    expect(await within(screen.getByRole('dialog')).findByLabelText('Valor')).toHaveValue('86,90');
    location.hash = '#/transactions?new';
    await waitFor(() => expect(screen.getByRole('dialog')).toHaveTextContent('Nova transação'));
    const dlg = screen.getByRole('dialog');
    expect(await within(dlg).findByLabelText('Valor')).toHaveValue('');
    expect(within(dlg).getByLabelText('Descrição')).toHaveValue('');
    expect(within(dlg).getByRole('button', { name: 'Salvar' })).toBeInTheDocument();
    expect(location.hash).toBe('#/transactions');
  });
  it('only archived accounts and no cards → asks to add one first', async () => {
    mockApi({ listTransactions: list(), listAccounts: [account({ archived: true })], listCards: [] });
    renderWithProviders(<Transactions />);
    await userEvent.click(await screen.findByRole('button', { name: /Nova transação/ }));
    await waitFor(() => expect(screen.getByRole('dialog')).toHaveTextContent('Adicione uma conta primeiro'));
  });
  it('no usable accounts: the empty "Contas" group is not rendered', async () => {
    mockApi({ listTransactions: list(), listAccounts: [account({ archived: true })], listCards: [card()] });
    const dlg = await open();
    const sel = within(dlg).getByLabelText('Conta ou cartão');
    expect(sel.querySelector('optgroup[label="Contas"]')).toBeNull();
    expect(sel.querySelector('optgroup[label="Cartões de crédito"]')).not.toBeNull();
    expect(sel).toHaveValue('k1');
  });
  it('the delete dialog of a system transfer uses the translated title', async () => {
    mockApi({
      listTransactions: list([tx({ id: 'sys', type: 'transfer', desc: 'Nubank', source: 'card_payment', accountId: 'a1', toId: 'k1', categoryId: undefined })]),
      listAccounts: [account()], listCards: [card()],
    });
    renderWithProviders(<Transactions />);
    const row = (await screen.findByText('Pagamento de fatura · Nubank')).closest('.trow') as HTMLElement;
    await userEvent.click(within(row).getByRole('button', { name: 'Excluir' }));
    expect(screen.getByRole('dialog')).toHaveTextContent('Excluir “Pagamento de fatura · Nubank”?');
  });
  it('after a failed receipt upload the fields are locked and a note explains that only the upload is retried', async () => {
    vi.mocked(api.createTransactions).mockResolvedValue([tx({ id: 'new1' })]);
    vi.mocked(receipt.uploadReceipt).mockRejectedValueOnce(new Error('s3 down'));
    const dlg = await open();
    expect(within(dlg).queryByText('Salva. Só o envio do comprovante será repetido.')).not.toBeInTheDocument();
    await userEvent.type(within(dlg).getByLabelText('Valor'), '9,90');
    await userEvent.type(within(dlg).getByLabelText('Descrição'), 'Padaria');
    await userEvent.upload(within(dlg).getByLabelText(/Clique para escolher uma imagem/), new File(['x'], 'r.png', { type: 'image/png' }));
    await userEvent.click(within(dlg).getByRole('button', { name: 'Salvar' }));
    expect(await within(dlg).findByText('Salva. Só o envio do comprovante será repetido.')).toBeInTheDocument();
    for (const l of ['Valor', 'Data', 'Conta ou cartão', 'Descrição', 'Categoria', 'Tags', 'Repetir', 'Observações']) expect(within(dlg).getByLabelText(l)).toBeDisabled();
    expect(within(dlg).getByRole('button', { name: 'Receita' })).toBeDisabled();
    expect(within(dlg).getByLabelText(/r\.png/)).toBeEnabled();
    expect(within(dlg).getByRole('button', { name: 'Salvar' })).toBeEnabled();
  });
});
