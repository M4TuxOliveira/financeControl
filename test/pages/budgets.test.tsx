import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../src/api/client';
import * as api from '../../src/api/endpoints';
import { Budgets } from '../../src/pages/Budgets';
import { renderWithProviders } from '../utils';
import { budget, mockApi } from './fixtures';

vi.mock('../../src/api/endpoints');
beforeEach(() => { mockApi({ listBudgets: [budget({ spent: 60000, pct: 120 }), budget({ id: 'b2', categoryId: 'sys:groceries', limit: 100000, spent: 20000, pct: 20 })] }); });

describe('Budgets', () => {
  it('shows server pct, over/left amounts and the summary for the current month', async () => {
    renderWithProviders(<Budgets />);
    expect(await screen.findByText('120%')).toBeInTheDocument();
    expect(screen.getByText('20%')).toBeInTheDocument();
    expect(screen.getByText(/R\$ 100,00 acima/)).toBeInTheDocument();
    expect(screen.getByText(/R\$ 800,00 restantes/)).toBeInTheDocument();
    expect(screen.getByText(/de R\$ 1\.500,00 · 53%/)).toBeInTheDocument();
    expect(api.listBudgets).toHaveBeenCalledWith('2026-10');
    expect(screen.getByRole('heading', { name: 'Alimentação' })).toBeInTheDocument();
  });
  it('month switcher re-queries the previous month', async () => {
    renderWithProviders(<Budgets />);
    await screen.findByText('120%');
    await userEvent.click(screen.getByRole('button', { name: 'Mês anterior' }));
    expect(api.listBudgets).toHaveBeenCalledWith('2026-09');
  });
  it('create offers only categories without a budget and sends cents', async () => {
    vi.mocked(api.createBudget).mockResolvedValue(budget());
    renderWithProviders(<Budgets />);
    await userEvent.click(await screen.findByRole('button', { name: /Novo orçamento/ }));
    const sel = screen.getByLabelText('Categoria') as HTMLSelectElement;
    expect([...sel.options].map(o => o.value)).toEqual(['c-pets']);
    await userEvent.type(screen.getByLabelText('Limite mensal'), '350,50');
    await userEvent.click(screen.getByRole('button', { name: 'Criar orçamento' }));
    expect(api.createBudget).toHaveBeenCalledWith({ categoryId: 'c-pets', limit: 35050, alertPct: 85 });
  });
  it('requires a limit and surfaces BUDGET_EXISTS translated', async () => {
    vi.mocked(api.createBudget).mockRejectedValue(new ApiError(409, 'BUDGET_EXISTS', 'x'));
    renderWithProviders(<Budgets />);
    await userEvent.click(await screen.findByRole('button', { name: /Novo orçamento/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Criar orçamento' }));
    expect(screen.getByText('Informe um limite mensal.')).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Limite mensal'), '10');
    await userEvent.click(screen.getByRole('button', { name: 'Criar orçamento' }));
    expect(await screen.findByText('Esta categoria já tem um orçamento.')).toBeInTheDocument();
  });
  it('edit and delete', async () => {
    vi.mocked(api.updateBudget).mockResolvedValue(budget());
    vi.mocked(api.deleteBudget).mockResolvedValue();
    renderWithProviders(<Budgets />);
    const card = (await screen.findByRole('heading', { name: 'Alimentação' })).closest('section') as HTMLElement;
    await userEvent.click(within(card).getByRole('button', { name: 'Editar' }));
    const lim = screen.getByLabelText('Limite mensal');
    await userEvent.clear(lim);
    await userEvent.type(lim, '600,00');
    await userEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }));
    expect(api.updateBudget).toHaveBeenCalledWith('b1', { categoryId: 'sys:food', limit: 60000, alertPct: 85 });
    await userEvent.click(within(card).getByRole('button', { name: 'Excluir' }));
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Excluir orçamento' }));
    expect(api.deleteBudget).toHaveBeenCalledWith('b1');
  });
  it('empty state', async () => {
    mockApi();
    renderWithProviders(<Budgets />);
    expect(await screen.findByText('Nenhum orçamento ainda.')).toBeInTheDocument();
  });
  it('garbage or zero limit shows the error under the limit field and makes no API call', async () => {
    renderWithProviders(<Budgets />);
    await userEvent.click(await screen.findByRole('button', { name: /Novo orçamento/ }));
    for (const txt of ['abc', '0']) {
      const lim = screen.getByLabelText('Limite mensal');
      await userEvent.clear(lim);
      await userEvent.type(lim, txt);
      await userEvent.click(screen.getByRole('button', { name: 'Criar orçamento' }));
      expect(within(screen.getByRole('dialog')).getByRole('alert')).toHaveTextContent('Informe um limite mensal.');
    }
    expect(api.createBudget).not.toHaveBeenCalled();
  });
  it('with no free category, save shows a translated error and never calls the API', async () => {
    mockApi({ listBudgets: [budget(), budget({ id: 'b2', categoryId: 'sys:groceries' }), budget({ id: 'b3', categoryId: 'c-pets' })] });
    renderWithProviders(<Budgets />);
    await userEvent.click(await screen.findByRole('button', { name: /Novo orçamento/ }));
    await userEvent.type(screen.getByLabelText('Limite mensal'), '10');
    await userEvent.click(screen.getByRole('button', { name: 'Criar orçamento' }));
    expect(within(screen.getByRole('dialog')).getByRole('alert')).toHaveTextContent('Escolha uma categoria sem orçamento.');
    expect(api.createBudget).not.toHaveBeenCalled();
  });
});
