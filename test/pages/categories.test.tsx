import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as api from '../../src/api/endpoints';
import { Categories } from '../../src/pages/Categories';
import { renderWithProviders } from '../utils';
import { CATS, mockApi } from './fixtures';

vi.mock('../../src/api/endpoints');
beforeEach(() => { mockApi(); });

describe('Categories', () => {
  it('lists top-level categories with translated names and their subcategories', async () => {
    renderWithProviders(<Categories />);
    expect(await screen.findByRole('heading', { name: 'Alimentação' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Mercado' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Pets' })).toBeInTheDocument();
    expect(screen.getByText('Padaria')).toBeInTheDocument();
    expect(screen.getAllByText('Padrão').length).toBeGreaterThan(0);
    expect(screen.getByText('Personalizada')).toBeInTheDocument();
  });
  it('creates a custom category (icon and color from the pickers)', async () => {
    vi.mocked(api.createCategory).mockResolvedValue(CATS[4]);
    renderWithProviders(<Categories />);
    await userEvent.click(await screen.findByRole('button', { name: /Nova categoria/ }));
    await userEvent.type(screen.getByLabelText('Nome'), 'Viagens longas');
    await userEvent.click(screen.getByRole('radio', { name: 'Avião' }));
    await userEvent.click(screen.getByRole('radio', { name: 'Verde' }));
    await userEvent.click(screen.getByRole('button', { name: 'Criar' }));
    expect(api.createCategory).toHaveBeenCalledWith({ name: 'Viagens longas', parentId: null, icon: 'Plane', color: '#3D5A0E' });
  });
  it('adds a subcategory under its parent, inheriting icon and color', async () => {
    vi.mocked(api.createCategory).mockResolvedValue(CATS[1]);
    renderWithProviders(<Categories />);
    const card = (await screen.findByRole('heading', { name: 'Alimentação' })).closest('section') as HTMLElement;
    await userEvent.click(within(card).getByRole('button', { name: /Subcategoria/ }));
    expect(screen.getByRole('dialog')).toHaveTextContent('Nova subcategoria');
    await userEvent.type(screen.getByLabelText('Nome'), 'Lanches');
    await userEvent.click(screen.getByRole('button', { name: 'Criar' }));
    expect(api.createCategory).toHaveBeenCalledWith({ name: 'Lanches', parentId: 'sys:food', icon: 'Food', color: '#C2410C' });
  });
  it('edit sends only the editable fields', async () => {
    vi.mocked(api.updateCategory).mockResolvedValue(CATS[4]);
    renderWithProviders(<Categories />);
    const card = (await screen.findByRole('heading', { name: 'Pets' })).closest('section') as HTMLElement;
    await userEvent.click(within(card).getByRole('button', { name: 'Editar' }));
    const name = screen.getByLabelText('Nome');
    await userEvent.clear(name);
    await userEvent.type(name, 'Bichos');
    await userEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }));
    expect(api.updateCategory).toHaveBeenCalledWith('c-pets', { name: 'Bichos', parentId: null, icon: 'Paw', color: '#6E3FA0' });
  });
  it('saving an unchanged system category keeps its backend name', async () => {
    vi.mocked(api.updateCategory).mockResolvedValue(CATS[0]);
    renderWithProviders(<Categories />);
    const card = (await screen.findByRole('heading', { name: 'Alimentação' })).closest('section') as HTMLElement;
    await userEvent.click(within(card).getAllByRole('button', { name: 'Editar' })[0]);
    expect(screen.getByLabelText('Nome')).toHaveValue('Alimentação');
    await userEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }));
    expect(api.updateCategory).toHaveBeenCalledWith('sys:food', { name: 'Food', parentId: null, icon: 'Food', color: '#C2410C' });
  });
  it('delete moves transactions to the chosen category', async () => {
    vi.mocked(api.deleteCategory).mockResolvedValue();
    renderWithProviders(<Categories />);
    const card = (await screen.findByRole('heading', { name: 'Pets' })).closest('section') as HTMLElement;
    await userEvent.click(within(card).getByRole('button', { name: 'Excluir' }));
    await userEvent.selectOptions(screen.getByLabelText('Mover transações para'), 'sys:groceries');
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Excluir' }));
    expect(api.deleteCategory).toHaveBeenCalledWith('c-pets', 'sys:groceries');
  });
  it('delete without a target leaves transactions uncategorized', async () => {
    vi.mocked(api.deleteCategory).mockResolvedValue();
    renderWithProviders(<Categories />);
    const card = (await screen.findByRole('heading', { name: 'Pets' })).closest('section') as HTMLElement;
    await userEvent.click(within(card).getByRole('button', { name: 'Excluir' }));
    const dlg = screen.getByRole('dialog');
    await userEvent.click(within(dlg).getByRole('button', { name: 'Excluir' }));
    expect(api.deleteCategory).toHaveBeenCalledWith('c-pets', undefined);
  });
});
