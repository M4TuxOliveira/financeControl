import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { More } from '../../src/pages/More';
import { renderWithProviders } from '../utils';

describe('More', () => {
  it('links to the secondary pages with translated descriptions', () => {
    renderWithProviders(<More />);
    expect(screen.getByRole('link', { name: /Cartões de crédito/ })).toHaveAttribute('href', '#/cards');
    expect(screen.getByRole('link', { name: /Configurações/ })).toHaveAttribute('href', '#/settings');
    expect(screen.getByText('Conta corrente, poupança e dinheiro')).toBeInTheDocument();
  });
  it('has a log out button for mobile', async () => {
    const { backend } = renderWithProviders(<More />);
    await userEvent.click(screen.getByRole('button', { name: 'Sair' }));
    expect(backend.signOut).toHaveBeenCalled();
  });
});
