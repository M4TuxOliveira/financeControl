import { expect, test, type Page } from '@playwright/test';

// One scenario across the whole local stack (dev auth → serverless-offline → dynalite). Needs `npm run stack`.
// Fresh dev user ids on every run, so reruns never see earlier data.
const stamp = Date.now();
const U1 = `e2e-${stamp}-a`;
const U2 = `e2e-${stamp}-b`;
const U3 = `e2e-${stamp}-c`;

async function login(page: Page, id: string) {
  await page.goto('/');
  await page.getByLabel('ID do usuário de teste').fill(id);
  await page.getByRole('button', { name: 'Entrar como usuário de teste' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
}
async function logout(page: Page) {
  await page.getByRole('button', { name: 'Sair' }).first().click();
  await expect(page.getByLabel('ID do usuário de teste')).toBeVisible();
}
const go = (page: Page, route: string) => page.goto(`/#/${route}`);

test('full flow: accounts, cards, installments, payment, budgets, goals, i18n, import, isolation', async ({ page }) => {
  const nextYear = new Date().getFullYear() + 1;

  await test.step('dev login shows the DEV banner', async () => {
    await page.goto('/');
    await expect(page.getByText('AUTENTICAÇÃO DE TESTE — apenas uso local')).toBeVisible();
    await login(page, U1);
    await expect(page.getByRole('heading', { level: 1, name: 'Visão geral' })).toBeVisible();
    await expect(page.getByText('AUTENTICAÇÃO DE TESTE — apenas uso local')).toBeVisible();
  });

  await test.step('create an account with an opening balance (pt-BR input)', async () => {
    await go(page, 'accounts');
    await page.getByRole('button', { name: /Nova conta/ }).click();
    const dlg = page.getByRole('dialog');
    await dlg.getByLabel('Nome da conta').fill('Itaú');
    await dlg.getByLabel('Saldo inicial').fill('1.000,00');
    await dlg.getByRole('button', { name: 'Criar conta' }).click();
    await expect(dlg).toHaveCount(0);
    await expect(page.getByText('R$ 1.000,00').first()).toBeVisible();
  });

  await test.step('create a credit card paid from that account', async () => {
    await go(page, 'cards');
    await page.getByRole('button', { name: /Novo cartão/ }).first().click();
    const dlg = page.getByRole('dialog');
    await dlg.getByLabel('Nome do cartão').fill('Nubank');
    await dlg.getByLabel('Limite de crédito').fill('6.000,00');
    await dlg.getByLabel('Paga com a conta').selectOption({ label: 'Itaú' });
    await dlg.getByRole('button', { name: 'Criar cartão' }).click();
    await expect(page.getByRole('heading', { name: 'Nubank · faturas' })).toBeVisible();
  });

  await test.step('3x installment on the card: card used = full amount, the open statement holds the 1st installment', async () => {
    await go(page, 'transactions');
    await page.getByRole('button', { name: /Nova transação/ }).click();
    const dlg = page.getByRole('dialog');
    await dlg.getByLabel('Valor').fill('300,00');
    await dlg.getByLabel('Descrição').fill('TV');
    await dlg.getByLabel('Conta ou cartão').selectOption({ label: 'Nubank' });
    await dlg.getByLabel('Dividir em parcelas').check();
    await expect(dlg.getByText('3 × R$ 100,00, uma por mês')).toBeVisible();
    await dlg.getByRole('button', { name: 'Salvar', exact: true }).click();
    await expect(dlg).toHaveCount(0);
    await expect(page.getByText(/Parcela 1\/3/)).toBeVisible();
    await go(page, 'cards');
    await expect(page.getByText('Usado R$ 300,00 (5%)')).toBeVisible();
    await expect(page.getByText('Aberta', { exact: true })).toBeVisible();
    await expect(page.getByText('TV (1/3)')).toBeVisible();
  });

  await test.step('pay the open statement: it becomes Paga and the account balance drops by the installment', async () => {
    await page.getByRole('button', { name: 'Pagar fatura' }).click();
    const dlg = page.getByRole('dialog');
    await expect(dlg.getByLabel('Valor')).toHaveValue('100,00');
    await expect(dlg.getByLabel('Da conta')).toHaveValue(/.+/);
    await dlg.getByRole('button', { name: 'Confirmar pagamento' }).click();
    await expect(dlg).toHaveCount(0);
    await expect(page.getByText('Paga', { exact: true })).toBeVisible();
    await go(page, 'accounts');
    await expect(page.getByText('R$ 900,00').first()).toBeVisible();
  });

  await test.step('expense in a translated default category + budget progress', async () => {
    await go(page, 'transactions');
    await page.getByRole('button', { name: /Nova transação/ }).click();
    let dlg = page.getByRole('dialog');
    await dlg.getByLabel('Valor').fill('86,90');
    await dlg.getByLabel('Descrição').fill('iFood');
    await dlg.getByLabel('Conta ou cartão').selectOption({ label: 'Itaú' });
    await dlg.getByLabel('Categoria', { exact: true }).selectOption({ label: 'Alimentação' });
    await dlg.getByRole('button', { name: 'Salvar', exact: true }).click();
    await expect(dlg).toHaveCount(0);
    await expect(page.getByText('− R$ 86,90', { exact: true })).toBeVisible();
    await go(page, 'budgets');
    await page.getByRole('button', { name: /Novo orçamento/ }).click();
    dlg = page.getByRole('dialog');
    await dlg.getByLabel('Categoria', { exact: true }).selectOption({ label: 'Alimentação' });
    await dlg.getByLabel('Limite mensal').fill('500,00');
    await dlg.getByRole('button', { name: 'Criar orçamento' }).click();
    await expect(dlg).toHaveCount(0);
    const card = page.locator('section.card').filter({ has: page.getByRole('heading', { name: 'Alimentação' }) });
    await expect(card.getByText('17%', { exact: true })).toBeVisible();
    await expect(card.getByText('R$ 86,90 gastos')).toBeVisible();
  });

  await test.step('goal with a contribution', async () => {
    await go(page, 'goals');
    await page.getByRole('button', { name: /Nova meta/ }).click();
    let dlg = page.getByRole('dialog');
    await dlg.getByLabel('Nome da meta').fill('Viagem');
    await dlg.getByLabel('Valor alvo').fill('3.000,00');
    await dlg.getByLabel('Mês alvo').fill(`${nextYear}-06`);
    await dlg.getByRole('button', { name: 'Criar meta' }).click();
    await expect(dlg).toHaveCount(0);
    await page.getByRole('button', { name: 'Adicionar dinheiro' }).click();
    dlg = page.getByRole('dialog');
    await dlg.getByLabel('Valor').fill('100,00');
    await dlg.getByRole('button', { name: 'Adicionar à meta' }).click();
    await expect(dlg).toHaveCount(0);
    const card = page.locator('section.card').filter({ has: page.getByRole('heading', { name: 'Viagem' }) });
    await expect(card.getByText('3%', { exact: true })).toBeVisible();
    await expect(card.getByText('R$ 100,00 / R$ 3.000,00')).toBeVisible();
  });

  await test.step('switch language to English; it persists after a reload', async () => {
    await go(page, 'settings');
    await page.getByLabel('Idioma').selectOption('en');
    await expect(page.getByRole('link', { name: 'Overview' }).first()).toBeVisible();
    await page.reload();
    await expect(page.getByRole('link', { name: 'Overview' }).first()).toBeVisible();
    await go(page, 'settings');
    await page.getByLabel('Language').selectOption('pt-BR');
    await expect(page.getByRole('link', { name: 'Visão geral' }).first()).toBeVisible();
  });

  await test.step('legacy localStorage data is imported for a fresh user', async () => {
    await logout(page);
    await login(page, U2);
    await page.evaluate(() => localStorage.setItem('financeControl:v1', JSON.stringify({
      v: 1, userName: '', theme: 'system', categories: [], cards: [], budgets: [], goals: [],
      accounts: [{ id: 'la1', name: 'Legado', kind: 'checking', bank: '', opening: 5000, color: '#1F4E79', inTotal: true, archived: false }],
      transactions: [{ id: 'lt1', type: 'expense', amount: 1000, date: '2026-10-01', desc: 'Café', accountId: 'la1', tags: [], note: '' }],
    })));
    await go(page, 'settings');
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Importar deste navegador' })).toBeVisible();
    await page.getByRole('button', { name: 'Importar', exact: true }).click();
    await expect(page.getByText(/Importado: 1 contas/)).toBeVisible();
    await go(page, 'accounts');
    await expect(page.getByText('Legado')).toBeVisible();
    await expect(page.getByText('R$ 40,00').first()).toBeVisible();
  });

  await test.step('another user sees none of this data (isolation)', async () => {
    await logout(page);
    await login(page, U3);
    await go(page, 'accounts');
    await expect(page.getByText('Nenhuma conta ainda.')).toBeVisible();
    await expect(page.getByText('Itaú')).toHaveCount(0);
    await expect(page.getByText('Legado')).toHaveCount(0);
  });
});
