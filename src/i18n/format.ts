
export type Locale = 'pt-BR' | 'en';

const ASCII_SPACE = (s: string) => s.replace(/[\u00a0\u202f]/g, ' ');
const intlLocale = (l: Locale) => (l === 'pt-BR' ? 'pt-BR' : 'en-US');
const pad = (n: number) => String(n).padStart(2, '0');
const parts = (iso: string): [number, number, number] => iso.split('-').map(Number) as [number, number, number];
const utc = (iso: string) => { const [y, m, d] = parts(iso); return new Date(Date.UTC(y, m - 1, d)); };

export function formatMoney(cents: number, locale: Locale, currency: string): string {
  return ASCII_SPACE(new Intl.NumberFormat(intlLocale(locale), { style: 'currency', currency }).format(cents / 100));
}

export function formatDate(iso: string, locale: Locale): string {
  return new Intl.DateTimeFormat(intlLocale(locale), { timeZone: 'UTC', day: '2-digit', month: '2-digit', year: 'numeric' }).format(utc(iso));
}

export function formatDateShort(iso: string, locale: Locale): string {
  return new Intl.DateTimeFormat(intlLocale(locale), { timeZone: 'UTC', day: '2-digit', month: '2-digit' }).format(utc(iso));
}

export function formatMonth(key: string, locale: Locale, long = false): string {
  return new Intl.DateTimeFormat(intlLocale(locale), { timeZone: 'UTC', month: long ? 'long' : 'short', year: 'numeric' }).format(utc(`${key}-01`));
}

/** Cents from what a person typed; `null` when empty or not a non-negative amount. */
export function parseMoney(input: string, locale: Locale): number | null {
  const s = input.replace(/[^\d.,-]/g, '');
  if (!s || s.includes('-')) return null;
  const dec = locale === 'pt-BR' ? ',' : '.';
  const grp = locale === 'pt-BR' ? '.' : ',';
  let normalized: string;
  if (s.includes(dec)) {
    if (s.split(dec).length > 2) return null;
    normalized = s.split(grp).join('').replace(dec, '.');
  } else if (s.includes(grp)) {
    const pieces = s.split(grp);
    const grouped = /^\d{1,3}$/.test(pieces[0]) && pieces.slice(1).every(p => /^\d{3}$/.test(p));
    if (grouped) normalized = pieces.join('');
    else if (pieces.length === 2) normalized = `${pieces[0]}.${pieces[1]}`; // lone separator that is not a grouping → decimal
    else return null;
  } else {
    normalized = s;
  }
  if (!/^\d+(\.\d+)?$/.test(normalized)) return null;
  const n = Math.round(Number(normalized) * 100);
  return Number.isSafeInteger(n) ? n : null;
}

/** Value for a text input: plain digits with the locale's decimal mark, '' for zero. */
export function moneyToInput(cents: number, locale: Locale): string {
  if (!cents) return '';
  const s = (cents / 100).toFixed(2);
  return locale === 'pt-BR' ? s.replace('.', ',') : s;
}

export function parseDate(input: string, locale: Locale): string | null {
  const s = input.trim();
  let y: number, m: number, d: number;
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  const loc = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(s);
  if (iso) [y, m, d] = [Number(iso[1]), Number(iso[2]), Number(iso[3])];
  else if (loc) [y, m, d] = locale === 'pt-BR' ? [Number(loc[3]), Number(loc[2]), Number(loc[1])] : [Number(loc[3]), Number(loc[1]), Number(loc[2])];
  else return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return `${y}-${pad(m)}-${pad(d)}`;
}

export function todayIn(tz: string, now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

export const monthOf = (iso: string) => iso.slice(0, 7);

export function shiftMonth(key: string, n: number): string {
  const [y, m] = key.split('-').map(Number);
  const t = y * 12 + (m - 1) + n;
  return `${Math.floor(t / 12)}-${pad((t % 12) + 1)}`;
}
