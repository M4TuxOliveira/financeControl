import type { Account, Card, Category, State, Tx } from './types';

export const uid = () => crypto.randomUUID();

/* ---------- money (integer cents) ---------- */
const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
export const money = (c: number) => brl.format(c / 100).replace(/ /g, ' ');
export const signed = (t: Tx) =>
  t.type === 'income' ? '+ ' + money(t.amount) : t.type === 'expense' ? '− ' + money(t.amount) : money(t.amount);

export function parseMoney(s: string): number {
  let t = s.replace(/[^\d.,-]/g, '');
  if (!t) return 0;
  if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.');
  const n = Number(t);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}
export const moneyInput = (c: number) => (c ? (c / 100).toFixed(2).replace('.', ',') : '');

/* ---------- dates (ISO yyyy-mm-dd, local) ---------- */
const pad = (n: number) => String(n).padStart(2, '0');
export const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const today = () => iso(new Date());
export const monthKey = (d: string) => d.slice(0, 7);
const parts = (d: string) => d.split('-').map(Number) as [number, number, number];
const daysIn = (y: number, m: number) => new Date(y, m, 0).getDate();

export function addMonths(d: string, n: number): string {
  const [y, m, day] = parts(d);
  const t = y * 12 + (m - 1) + n;
  const ny = Math.floor(t / 12), nm = (t % 12) + 1;
  return `${ny}-${pad(nm)}-${pad(Math.min(day, daysIn(ny, nm)))}`;
}
export function addDays(d: string, n: number): string {
  const [y, m, day] = parts(d);
  return iso(new Date(y, m - 1, day + n));
}
export const shiftKey = (k: string, n: number) => addMonths(k + '-01', n).slice(0, 7);
export const fmtDate = (d: string) =>
  new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
export const fmtMonth = (k: string, long = false) =>
  new Date(k + '-01T00:00:00').toLocaleDateString('en-US', { month: long ? 'long' : 'short', year: 'numeric' });
export const monthShort = (k: string) => new Date(k + '-01T00:00:00').toLocaleDateString('en-US', { month: 'short' });

/* ---------- lookups ---------- */
export const byId = <T extends { id: string }>(xs: T[], id?: string) => xs.find(x => x.id === id);

export function accountName(s: State, id?: string): string {
  return byId(s.accounts, id)?.name ?? byId(s.cards, id)?.name ?? '—';
}
export const isCard = (s: State, id?: string) => !!byId(s.cards, id);

export function categoryLabel(s: State, id?: string): string {
  const c = byId(s.categories, id);
  if (!c) return 'Uncategorized';
  const p = byId(s.categories, c.parentId ?? undefined);
  return p ? `${p.name} › ${c.name}` : c.name;
}
export function categoryColor(s: State, id?: string): string {
  return byId(s.categories, id)?.color ?? 'var(--muted)';
}
/** id plus all of its subcategory ids */
export function categoryFamily(s: State, id: string): string[] {
  return [id, ...s.categories.filter(c => c.parentId === id).map(c => c.id)];
}

/* ---------- balances ---------- */
/** Account balance as of today (future-dated entries not counted yet). */
export function accountBalance(s: State, a: Account, asOf = today()): number {
  let b = a.opening;
  for (const t of s.transactions) {
    if (t.date > asOf) continue;
    if (t.accountId === a.id) b += t.type === 'income' ? t.amount : -t.amount;
    if (t.type === 'transfer' && t.toId === a.id) b += t.amount;
  }
  return b;
}
export function totalBalance(s: State): number {
  return s.accounts.filter(a => !a.archived && a.inTotal).reduce((n, a) => n + accountBalance(s, a), 0);
}
export function monthTotals(s: State, key: string) {
  let income = 0, expense = 0;
  for (const t of s.transactions) {
    if (monthKey(t.date) !== key) continue;
    if (t.type === 'income') income += t.amount;
    if (t.type === 'expense') expense += t.amount;
  }
  return { income, expense, net: income - expense };
}

/* ---------- credit card statements ---------- */
/** Statement key (yyyy-mm of the closing month) a purchase on `date` lands in. */
export function statementKey(date: string, closeDay: number): string {
  const [y, m, d] = parts(date);
  const k = `${y}-${pad(m)}`;
  return d > closeDay ? shiftKey(k, 1) : k;
}
export function statementRange(card: Card, key: string): string {
  const [y, m] = key.split('-').map(Number);
  const closeDate = `${key}-${pad(Math.min(card.closeDay, daysIn(y, m)))}`;
  const start = addDays(addMonths(closeDate, -1), 1);
  return `${fmtDate(start)} – ${fmtDate(closeDate)}`;
}
export function statementDue(card: Card, key: string): string {
  const k = card.dueDay > card.closeDay ? key : shiftKey(key, 1);
  const [y, m] = k.split('-').map(Number);
  return `${k}-${pad(Math.min(card.dueDay, daysIn(y, m)))}`;
}
export type StatementStatus = 'Paid' | 'Open' | 'Upcoming' | 'Due';
export type Statement = {
  key: string; total: number; paid: number; status: StatementStatus; due: string; range: string; items: Tx[];
};
export function cardStatements(s: State, card: Card): Statement[] {
  const charges = s.transactions.filter(t => t.type === 'expense' && t.accountId === card.id);
  const pays = s.transactions.filter(t => t.type === 'transfer' && t.toId === card.id);
  const cur = statementKey(today(), card.closeDay);
  const keys = new Set<string>([cur, shiftKey(cur, 1), shiftKey(cur, -1)]);
  charges.forEach(t => keys.add(statementKey(t.date, card.closeDay)));
  const sorted = [...keys].sort();
  // Payments settle the oldest statements first.
  let pool = pays.reduce((n, t) => n + t.amount, 0);
  return sorted.map(key => {
    const items = charges.filter(t => statementKey(t.date, card.closeDay) === key).sort((a, b) => a.date.localeCompare(b.date));
    const total = items.reduce((n, t) => n + t.amount, 0);
    const paid = Math.min(pool, total);
    pool -= paid;
    const status: StatementStatus =
      total > 0 && paid >= total ? 'Paid' : key === cur ? 'Open' : key > cur ? 'Upcoming' : total === 0 ? 'Paid' : 'Due';
    return { key, total, paid, status, due: statementDue(card, key), range: statementRange(card, key), items };
  });
}
/** Limit used = everything charged (incl. future installments) minus payments made. */
export function cardUsed(s: State, card: Card): number {
  const charged = s.transactions.filter(t => t.type === 'expense' && t.accountId === card.id).reduce((n, t) => n + t.amount, 0);
  const paid = s.transactions.filter(t => t.type === 'transfer' && t.toId === card.id).reduce((n, t) => n + t.amount, 0);
  return Math.max(0, charged - paid);
}
export function openStatementTotal(s: State): number {
  return s.cards.reduce((n, c) => n + (cardStatements(s, c).find(x => x.status === 'Open')?.total ?? 0), 0);
}

/* ---------- budgets & goals ---------- */
export function budgetSpent(s: State, categoryId: string, key: string): number {
  const fam = categoryFamily(s, categoryId);
  return s.transactions
    .filter(t => t.type === 'expense' && monthKey(t.date) === key && t.categoryId && fam.includes(t.categoryId))
    .reduce((n, t) => n + t.amount, 0);
}
export const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : 0);
export const level = (p: number, alert = 85) =>
  p >= 100 ? 'var(--danger)' : p >= alert ? 'var(--warn)' : 'var(--pos)';

/* ---------- helpers ---------- */
export const txCount = (s: State, accountId: string) =>
  s.transactions.filter(t => t.accountId === accountId || t.toId === accountId).length;

export function sortTx(xs: Tx[]): Tx[] {
  return [...xs].sort((a, b) => b.date.localeCompare(a.date));
}

export type { Category };
