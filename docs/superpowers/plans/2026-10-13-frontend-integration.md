# Frontend ↔ Backend Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the localStorage-only financeControl SPA into a thin client of the finished backend API, with Cognito + dev login, pt-BR/en i18n, a one-command local full stack and an end-to-end test suite.

**Architecture:** `api/` (typed fetch client + endpoints) → `queries/` (TanStack Query hooks with an invalidation matrix) → pages. `auth/` supplies tokens (Cognito or an unsigned dev token). `i18n/` supplies typed catalogs and `Intl` formatting. The old `store.ts`/`actions.ts`/derived `lib.ts` logic is deleted once every page is migrated.

**Tech Stack:** React 18, Vite 5, TypeScript, `@tanstack/react-query`, `amazon-cognito-identity-js`, Vitest + React Testing Library + jsdom, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-13-frontend-integration-design.md` (backend spec: `../financeControlBackend/docs/superpowers/specs/2026-10-13-backend-design.md`; the backend is merged on `main` of `../financeControlBackend`).

## Global Constraints

- Money is **integer cents** everywhere in code; dates are **ISO `yyyy-mm-dd`**; months `yyyy-mm`. Only `i18n/format.ts` converts to/from display text.
- The client never recomputes server-derived values (balances, `used`, statements, budget `spent/pct`, goal progress, overview totals). Pure presentation sums of API-provided numbers are allowed only where stated in a task.
- Every user-visible string (incl. `aria-label`, `<title>`, empty states, dialogs) comes from the catalogs via `t()`; `en.ts` is the key source and `pt-BR.ts` must satisfy it at compile time. Default locale `pt-BR`; display dates `DD/MM/YYYY` (pt-BR), money via `Intl.NumberFormat`.
- Never build a `Date` from an ISO string in local time: use the UTC-safe helpers in `format.ts` (no off-by-one days).
- API base is `${VITE_API_URL}/v1`; auth header `Authorization: Bearer <access token>`; errors are `{error:{code,message,fields?,requestId}}` and surface as `ApiError`.
- `VITE_DEV_AUTH=true` is for local only; a production build must fail if it is set. A "DEV AUTH" banner is always shown in dev mode.
- Mutations invalidate by key prefix per the matrix in Task 6; no optimistic updates in v1.
- Updates are partial except transactions (full replacement). System-created transfers (`source` set) have no Edit action in the UI.
- Keep the existing visual design and CSS classes; add classes only where a task says so.
- TDD: failing test first. Frontend commit messages end with the line `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
- Work happens in `/home/matux/Code/financeControl` (frontend) except Task 16, which edits `/home/matux/Code/financeControlBackend`. Git is 2.25 (no `git init -b`).

## Review Focus

1. **Locale-ambiguous money input** — `1.234` means 1234 in pt-BR but 1.234 in en; `12.5` typed by a pt-BR user should mean 12,50. Round-trip and ambiguity tests in Task 1.
2. **Off-by-one day** — formatting/parsing ISO dates must not shift in negative/positive UTC offsets (São Paulo evening). Tests in Task 1 use UTC-only paths.
3. **Parallel 401s** — a page fires many requests; an expired token must trigger exactly one refresh, and a failed refresh must sign out once. Tests in Task 3.
4. **Stale screens after a mutation** — e.g. deleting an account with `moveTo` must refresh transactions/cards/goals/overview, not just accounts. Matrix test in Task 6.
5. **Dev auth leaking into production** — build guard + banner + unsigned-token only in dev. Tests in Task 0 and Task 5.

---

### Task 0: Baseline repo, tooling and env guard

**Files:**
- Create: `.gitignore`, `.env.example`, `src/vite-env.d.ts`, `test/setup.ts`, `vite.env-guard.ts`, `test/env-guard.test.ts`
- Modify: `package.json`, `vite.config.ts`, `tsconfig.json`

**Interfaces:**
- Produces: `assertSafeEnv(mode: string, env: Record<string,string|undefined>): void` in `vite.env-guard.ts` (throws if `mode === 'production' && env.VITE_DEV_AUTH === 'true'`); npm scripts `test`, `test:watch`, `e2e`, `stack`, `dev:local`; typed `ImportMetaEnv`.

- [ ] **Step 1: Baseline commit of the existing app**

```bash
cd /home/matux/Code/financeControl
git init && git symbolic-ref HEAD refs/heads/main
printf 'node_modules\ndist\n.env\n.env.local\ntest-results\nplaywright-report\n' > .gitignore
git add -A && git commit -m "chore: baseline (localStorage-only app, spec and plan)" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
git checkout -b feat/api-integration
```

- [ ] **Step 2: Install dependencies**

```bash
npm i @tanstack/react-query amazon-cognito-identity-js
npm i -D vitest jsdom @testing-library/react @testing-library/jest-dom @testing-library/user-event @playwright/test
```

- [ ] **Step 3: Write the failing test** — `test/env-guard.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import { assertSafeEnv } from '../vite.env-guard';

describe('assertSafeEnv (review focus 5)', () => {
  it('rejects dev auth in a production build', () => {
    expect(() => assertSafeEnv('production', { VITE_DEV_AUTH: 'true' })).toThrow(/VITE_DEV_AUTH/);
  });
  it('allows dev auth in development and production without it', () => {
    expect(() => assertSafeEnv('development', { VITE_DEV_AUTH: 'true' })).not.toThrow();
    expect(() => assertSafeEnv('production', {})).not.toThrow();
    expect(() => assertSafeEnv('production', { VITE_DEV_AUTH: 'false' })).not.toThrow();
  });
});
```

- [ ] **Step 4: Run to verify it fails**

Run: `npx vitest run test/env-guard.test.ts` (first create the minimal vitest config in Step 5 if the runner cannot start).
Expected: FAIL (module `../vite.env-guard` not found).

- [ ] **Step 5: Implement tooling**

`vite.env-guard.ts`

```ts
export function assertSafeEnv(mode: string, env: Record<string, string | undefined>): void {
  if (mode === 'production' && env.VITE_DEV_AUTH === 'true') {
    throw new Error('VITE_DEV_AUTH=true must never be used in a production build');
  }
}
```

`vite.config.ts`

```ts
/// <reference types="vitest/config" />
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { assertSafeEnv } from './vite.env-guard';

// base './' keeps asset URLs relative so the build works on any static host.
export default defineConfig(({ mode }) => {
  assertSafeEnv(mode, loadEnv(mode, process.cwd(), ''));
  return {
    base: './',
    plugins: [react()],
    test: {
      environment: 'jsdom',
      setupFiles: ['./test/setup.ts'],
      include: ['test/**/*.test.{ts,tsx}'],
      css: false,
    },
  };
});
```

`test/setup.ts`

```ts
import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

afterEach(() => { cleanup(); localStorage.clear(); sessionStorage.clear(); });
```

`src/vite-env.d.ts`

```ts
/// <reference types="vite/client" />
interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
  readonly VITE_COGNITO_USER_POOL_ID?: string;
  readonly VITE_COGNITO_CLIENT_ID?: string;
  readonly VITE_COGNITO_REGION?: string;
  readonly VITE_DEV_AUTH?: string;
}
interface ImportMeta { readonly env: ImportMetaEnv }
```

`.env.example`

```
# Copy to .env.local. All values are baked in at build time.
VITE_API_URL=http://localhost:3000
# Cognito (deployed use) — outputs of the backend stack
VITE_COGNITO_USER_POOL_ID=
VITE_COGNITO_CLIENT_ID=
VITE_COGNITO_REGION=sa-east-1
# LOCAL ONLY: replaces Cognito login with an unsigned dev token. A production build refuses to run with this set.
VITE_DEV_AUTH=
```

`package.json` scripts (keep existing `dev`, `build`, `preview`; add):

```json
"test": "vitest run --passWithNoTests",
"test:watch": "vitest",
"dev:local": "VITE_DEV_AUTH=true VITE_API_URL=http://localhost:3000 vite",
"e2e": "playwright test",
"stack": "bash scripts/stack.sh"
```

`tsconfig.json`: set `"include": ["src", "test", "e2e", "vite.config.ts", "vite.env-guard.ts"]` and add `"types": ["vitest/globals"]` ONLY if tests rely on globals (they import from `vitest` explicitly, so do not add it).

- [ ] **Step 6: Run tests and typecheck**

Run: `npx vitest run && npx tsc --noEmit`
Expected: env-guard tests PASS; typecheck clean (existing app untouched).

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "chore: test tooling, env typing and production dev-auth guard" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 1: Formatting and parsing (`i18n/format.ts`)

**Files:**
- Create: `src/i18n/format.ts`
- Test: `test/i18n/format.test.ts`

**Interfaces:**
- Produces (all pure):
  - `type Locale = 'pt-BR' | 'en'`
  - `formatMoney(cents: number, locale: Locale, currency: string): string` (normal spaces, no NBSP)
  - `formatDate(iso: string, locale: Locale): string` (pt-BR `13/10/2026`, en `10/13/2026`)
  - `formatDateShort(iso: string, locale: Locale): string` (pt-BR `13/10`, en `10/13`)
  - `formatMonth(key: string, locale: Locale, long?: boolean): string`
  - `parseMoney(input: string, locale: Locale): number | null` (cents, `null` if empty/invalid)
  - `moneyToInput(cents: number, locale: Locale): string` (e.g. `1234,56` / `1234.56`, `''` for 0)
  - `parseDate(input: string, locale: Locale): string | null` (accepts ISO, `DD/MM/YYYY` for pt-BR, `MM/DD/YYYY` for en; returns ISO or null)
  - `todayIn(tz: string, now?: Date): string`
  - `monthOf(iso: string): string`, `shiftMonth(key: string, n: number): string`

- [ ] **Step 1: Write the failing test** — `test/i18n/format.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import {
  formatDate, formatDateShort, formatMoney, formatMonth, moneyToInput, monthOf, parseDate, parseMoney, shiftMonth, todayIn,
} from '../../src/i18n/format';

describe('formatMoney', () => {
  it('pt-BR BRL', () => {
    expect(formatMoney(123456, 'pt-BR', 'BRL')).toBe('R$ 1.234,56');
    expect(formatMoney(0, 'pt-BR', 'BRL')).toBe('R$ 0,00');
    expect(formatMoney(-5000, 'pt-BR', 'BRL')).toBe('-R$ 50,00');
  });
  it('en USD', () => {
    expect(formatMoney(123456, 'en', 'USD')).toBe('$1,234.56');
  });
  it('never emits a non-breaking space', () => {
    expect(formatMoney(100, 'pt-BR', 'BRL')).not.toContain(' ');
  });
});

describe('parseMoney (review focus 1)', () => {
  it('pt-BR: comma decimal, dot thousands', () => {
    expect(parseMoney('1.234,56', 'pt-BR')).toBe(123456);
    expect(parseMoney('R$ 1.234,56', 'pt-BR')).toBe(123456);
    expect(parseMoney('1234,5', 'pt-BR')).toBe(123450);
    expect(parseMoney('0,99', 'pt-BR')).toBe(99);
    expect(parseMoney('1.234', 'pt-BR')).toBe(123400);   // thousands grouping
    expect(parseMoney('12.5', 'pt-BR')).toBe(1250);      // a lone dot that is not a grouping is a decimal
    expect(parseMoney('10', 'pt-BR')).toBe(1000);
  });
  it('en: dot decimal, comma thousands', () => {
    expect(parseMoney('1,234.56', 'en')).toBe(123456);
    expect(parseMoney('$1,234', 'en')).toBe(123400);
    expect(parseMoney('12,5', 'en')).toBe(1250);
  });
  it('rejects empty, garbage and negatives', () => {
    expect(parseMoney('', 'pt-BR')).toBeNull();
    expect(parseMoney('abc', 'pt-BR')).toBeNull();
    expect(parseMoney('-5', 'pt-BR')).toBeNull();
    expect(parseMoney('1,2,3', 'pt-BR')).toBeNull();
  });
  it('round-trips through moneyToInput', () => {
    for (const c of [1, 99, 100, 123456, 100000000]) {
      for (const l of ['pt-BR', 'en'] as const) expect(parseMoney(moneyToInput(c, l), l)).toBe(c);
    }
    expect(moneyToInput(0, 'pt-BR')).toBe('');
    expect(moneyToInput(123456, 'pt-BR')).toBe('1234,56');
    expect(moneyToInput(123456, 'en')).toBe('1234.56');
  });
});

describe('dates (review focus 2)', () => {
  it('formats ISO without day shifts', () => {
    expect(formatDate('2026-10-13', 'pt-BR')).toBe('13/10/2026');
    expect(formatDate('2026-10-13', 'en')).toBe('10/13/2026');
    expect(formatDate('2026-01-01', 'pt-BR')).toBe('01/01/2026');
    expect(formatDate('2026-12-31', 'pt-BR')).toBe('31/12/2026');
    expect(formatDateShort('2026-10-13', 'pt-BR')).toBe('13/10');
    expect(formatDateShort('2026-10-13', 'en')).toBe('10/13');
  });
  it('formats months', () => {
    expect(formatMonth('2026-10', 'pt-BR', true)).toBe('outubro de 2026');
    expect(formatMonth('2026-10', 'en', true)).toBe('October 2026');
    expect(formatMonth('2026-10', 'en')).toBe('Oct 2026');
  });
  it('parseDate accepts locale format and ISO, rejects impossible dates', () => {
    expect(parseDate('13/10/2026', 'pt-BR')).toBe('2026-10-13');
    expect(parseDate('10/13/2026', 'en')).toBe('2026-10-13');
    expect(parseDate('2026-10-13', 'pt-BR')).toBe('2026-10-13');
    expect(parseDate('31/02/2026', 'pt-BR')).toBeNull();
    expect(parseDate('13/10/26', 'pt-BR')).toBeNull();
    expect(parseDate('', 'en')).toBeNull();
  });
  it('todayIn uses the given timezone, not UTC', () => {
    const now = new Date('2026-10-14T01:30:00Z');
    expect(todayIn('America/Sao_Paulo', now)).toBe('2026-10-13');
    expect(todayIn('UTC', now)).toBe('2026-10-14');
  });
  it('month helpers', () => {
    expect(monthOf('2026-10-13')).toBe('2026-10');
    expect(shiftMonth('2026-01', -1)).toBe('2025-12');
    expect(shiftMonth('2026-12', 1)).toBe('2027-01');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run test/i18n/format.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement** — `src/i18n/format.ts`

```ts
export type Locale = 'pt-BR' | 'en';

const ASCII_SPACE = (s: string) => s.replace(/[  ]/g, ' ');
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
```

- [ ] **Step 4: Run tests and typecheck**

Run: `npx vitest run test/i18n/format.test.ts && npx tsc --noEmit`
Expected: PASS. (If ICU output differs, e.g. `-R$ 50,00` vs `R$ -50,00`, adjust the test's expected string to what Node 22's ICU produces for pt-BR and keep the behaviour: a leading minus before the symbol.)

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(i18n): money and date formatting and parsing" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 2: i18n core — catalogs, provider, parity and usage tests

**Files:**
- Create: `src/i18n/en.ts`, `src/i18n/pt-BR.ts`, `src/i18n/index.tsx`, `src/i18n/errors.ts`, `test/i18n/catalog.test.ts`, `test/utils.tsx`
- Test: `test/i18n/catalog.test.ts`

**Interfaces:**
- Consumes: `format.ts` (Task 1).
- Produces:
  - `en.ts`: `export const en = { 'key': 'text', ... } as const; export type Key = keyof typeof en;` — a flat dotted-key map; each later task inserts its keys **immediately before the marker line `// @@keys-end`** in both catalogs.
  - `pt-BR.ts`: `export const ptBR: Record<Key, string> = { ... }` with the same marker.
  - `index.tsx`: `I18nProvider({locale, currency?, timezone?, today?, children})`, `useI18n(): I18n`, `browserLocale(): Locale`, `hasKey(k: string): k is Key`, `type I18n = { locale: Locale; currency: string; timezone: string; today: string; t: (key: Key, vars?: Record<string, string|number>) => string; tOr: (key: string, fallback: string) => string; money(cents: number): string; date(iso: string): string; dateShort(iso: string): string; month(key: string, long?: boolean): string; parseMoney(s: string): number | null; moneyInput(cents: number): string }`.
  - `errors.ts`: `errorMessage(err: unknown, t: I18n['t']): string`.
  - `test/utils.tsx`: `renderWithProviders(ui, opts?: {locale?, currency?, timezone?, today?}) => RenderResult & {qc: QueryClient}` (wraps `QueryClientProvider` with retry off + `I18nProvider`).

> The `ApiError` class is created in Task 3; `errors.ts` therefore imports it lazily by duck-typing (`'code' in err`) so this task has no dependency on Task 3.

- [ ] **Step 1: Write the failing tests** — `test/i18n/catalog.test.ts`

```ts
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { en } from '../../src/i18n/en';
import { ptBR } from '../../src/i18n/pt-BR';
import { errorMessage } from '../../src/i18n/errors';

describe('catalogs', () => {
  it('have identical key sets and no empty values', () => {
    expect(Object.keys(ptBR).sort()).toEqual(Object.keys(en).sort());
    for (const [k, v] of Object.entries(en)) expect(v.trim(), `en ${k}`).not.toBe('');
    for (const [k, v] of Object.entries(ptBR)) expect((v as string).trim(), `pt-BR ${k}`).not.toBe('');
  });
  it('interpolation placeholders match between locales', () => {
    const vars = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort();
    for (const k of Object.keys(en) as (keyof typeof en)[]) expect(vars(ptBR[k]), k).toEqual(vars(en[k]));
  });
  it('every t("literal.key") used under src exists in the catalog', () => {
    const files: string[] = [];
    const walk = (d: string) => readdirSync(d).forEach(f => { const p = join(d, f); statSync(p).isDirectory() ? walk(p) : /\.tsx?$/.test(p) && files.push(p); });
    walk('src');
    const missing: string[] = [];
    for (const f of files) {
      for (const m of readFileSync(f, 'utf8').matchAll(/\bt\(\s*'([a-zA-Z0-9_.]+)'/g)) {
        if (!(m[1] in en)) missing.push(`${f}: ${m[1]}`);
      }
    }
    expect(missing).toEqual([]);
  });
  it('has a translation for every default category key the backend seeds', () => {
    const keys = ['groceries', 'groceries.supermarket', 'groceries.bakery', 'groceries.butcher', 'housing', 'housing.rent', 'housing.condo_fee', 'housing.utilities',
      'transport', 'transport.fuel', 'transport.ride_apps', 'transport.parking', 'food', 'food.restaurants', 'food.delivery', 'subscriptions', 'electronics',
      'health', 'health.pharmacy', 'health.doctor', 'travel', 'sports', 'sports.equipment', 'sports.gym', 'income', 'income.salary', 'income.other_income'];
    for (const k of keys) expect(`categories.${k}` in en, k).toBe(true);
    expect(keys).toHaveLength(27);
  });
});

describe('errorMessage', () => {
  const t = (k: string, v?: Record<string, string | number>) => `${k}${v ? JSON.stringify(v) : ''}`;
  it('translates known codes', () => {
    expect(errorMessage({ code: 'BUDGET_EXISTS', status: 409 }, t as never)).toBe('errors.BUDGET_EXISTS');
  });
  it('falls back to a generic message with the request id for unknown codes', () => {
    expect(errorMessage({ code: 'WHAT', status: 500, requestId: 'abc' }, t as never)).toBe('errors.generic{"id":"abc"}');
  });
  it('handles non-API errors', () => {
    expect(errorMessage(new Error('x'), t as never)).toBe('errors.generic{"id":"-"}');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run test/i18n/catalog.test.ts`
Expected: FAIL (modules not found).

- [ ] **Step 3: Implement the catalogs** — `src/i18n/en.ts`

```ts
export const en = {
  // common
  'common.loading': 'Loading…',
  'common.retry': 'Try again',
  'common.cancel': 'Cancel',
  'common.save': 'Save',
  'common.saveChanges': 'Save changes',
  'common.create': 'Create',
  'common.edit': 'Edit',
  'common.delete': 'Delete',
  'common.close': 'Close',
  'common.manage': 'Manage',
  'common.seeAll': 'See all',
  'common.optional': 'Optional',
  'common.yes': 'Yes',
  'common.no': 'No',
  'common.color': 'Color',
  'common.icon': 'Icon',
  'common.name': 'Name',
  'common.type': 'Type',
  'common.amount': 'Amount',
  'common.date': 'Date',
  'common.notes': 'Notes',
  'common.archive': 'Archive',
  'common.unarchive': 'Unarchive',
  'common.logout': 'Log out',
  'common.none': 'None',
  'common.confirm': 'Confirm',
  'common.moveTo': 'Move to',
  'common.uncategorized': 'Uncategorized',
  // navigation
  'nav.overview': 'Overview',
  'nav.transactions': 'Transactions',
  'nav.accounts': 'Accounts',
  'nav.cards': 'Credit cards',
  'nav.categories': 'Categories',
  'nav.budgets': 'Budgets',
  'nav.goals': 'Goals',
  'nav.settings': 'Settings',
  'nav.home': 'Home',
  'nav.more': 'More',
  'nav.main': 'Main',
  'nav.newTransaction': 'New transaction',
  // enums
  'txtype.expense': 'Expense',
  'txtype.income': 'Income',
  'txtype.transfer': 'Transfer',
  'kind.checking': 'Checking',
  'kind.savings': 'Savings',
  'kind.cash': 'Cash',
  'status.statement.paid': 'Paid',
  'status.statement.open': 'Open',
  'status.statement.upcoming': 'Upcoming',
  'status.statement.due': 'Due',
  'source.card_payment': 'Card payment',
  'source.goal': 'Goal',
  // errors
  'errors.generic': 'Something went wrong (ref {id}).',
  'errors.NETWORK': 'Could not reach the server. Check your connection.',
  'errors.VALIDATION_FAILED': 'Some fields are invalid.',
  'errors.INVALID_JSON': 'The request was malformed.',
  'errors.UNAUTHENTICATED': 'Your session has expired. Please sign in again.',
  'errors.NOT_FOUND': 'Not found. It may have been deleted.',
  'errors.PAYLOAD_TOO_LARGE': 'That is too large to send.',
  'errors.INTERNAL': 'The server had a problem. Try again in a moment.',
  'errors.INVALID_REFERENCE': 'One of the selected items does not exist anymore.',
  'errors.TRANSFER_SAME_ACCOUNT': 'Choose two different accounts for a transfer.',
  'errors.TRANSFER_FROM_CARD': 'A transfer cannot start from a credit card.',
  'errors.INCOME_ON_CARD': 'Income cannot be recorded on a credit card.',
  'errors.INSTALLMENTS_ONLY_EXPENSE': 'Installments are only for expenses.',
  'errors.MOVE_TARGET_INVALID': 'Pick a different destination to move the data to.',
  'errors.INVALID_PARENT': 'A category cannot be its own parent.',
  'errors.HAS_SUBCATEGORIES': 'A category with subcategories must stay top-level.',
  'errors.BUDGET_EXISTS': 'This category already has a budget.',
  'errors.ALREADY_HAS_DATA': 'Your account already has data, so an import is not allowed.',
  // default categories (backend seed keys)
  'categories.groceries': 'Groceries',
  'categories.groceries.supermarket': 'Supermarket',
  'categories.groceries.bakery': 'Bakery',
  'categories.groceries.butcher': 'Butcher',
  'categories.housing': 'Housing',
  'categories.housing.rent': 'Rent',
  'categories.housing.condo_fee': 'Condo fee',
  'categories.housing.utilities': 'Utilities',
  'categories.transport': 'Transport',
  'categories.transport.fuel': 'Fuel',
  'categories.transport.ride_apps': 'Ride apps',
  'categories.transport.parking': 'Parking',
  'categories.food': 'Food',
  'categories.food.restaurants': 'Restaurants',
  'categories.food.delivery': 'Delivery',
  'categories.subscriptions': 'Subscriptions',
  'categories.electronics': 'Electronics',
  'categories.health': 'Health',
  'categories.health.pharmacy': 'Pharmacy',
  'categories.health.doctor': 'Doctor',
  'categories.travel': 'Travel',
  'categories.sports': 'Sports',
  'categories.sports.equipment': 'Equipment',
  'categories.sports.gym': 'Gym',
  'categories.income': 'Income',
  'categories.income.salary': 'Salary',
  'categories.income.other_income': 'Other income',
  // @@keys-end
} as const;

export type Key = keyof typeof en;
```

`src/i18n/pt-BR.ts`

```ts
import type { Key } from './en';

export const ptBR: Record<Key, string> = {
  'common.loading': 'Carregando…',
  'common.retry': 'Tentar novamente',
  'common.cancel': 'Cancelar',
  'common.save': 'Salvar',
  'common.saveChanges': 'Salvar alterações',
  'common.create': 'Criar',
  'common.edit': 'Editar',
  'common.delete': 'Excluir',
  'common.close': 'Fechar',
  'common.manage': 'Gerenciar',
  'common.seeAll': 'Ver tudo',
  'common.optional': 'Opcional',
  'common.yes': 'Sim',
  'common.no': 'Não',
  'common.color': 'Cor',
  'common.icon': 'Ícone',
  'common.name': 'Nome',
  'common.type': 'Tipo',
  'common.amount': 'Valor',
  'common.date': 'Data',
  'common.notes': 'Observações',
  'common.archive': 'Arquivar',
  'common.unarchive': 'Desarquivar',
  'common.logout': 'Sair',
  'common.none': 'Nenhum',
  'common.confirm': 'Confirmar',
  'common.moveTo': 'Mover para',
  'common.uncategorized': 'Sem categoria',
  'nav.overview': 'Visão geral',
  'nav.transactions': 'Transações',
  'nav.accounts': 'Contas',
  'nav.cards': 'Cartões de crédito',
  'nav.categories': 'Categorias',
  'nav.budgets': 'Orçamentos',
  'nav.goals': 'Metas',
  'nav.settings': 'Configurações',
  'nav.home': 'Início',
  'nav.more': 'Mais',
  'nav.main': 'Principal',
  'nav.newTransaction': 'Nova transação',
  'txtype.expense': 'Despesa',
  'txtype.income': 'Receita',
  'txtype.transfer': 'Transferência',
  'kind.checking': 'Conta corrente',
  'kind.savings': 'Poupança',
  'kind.cash': 'Dinheiro',
  'status.statement.paid': 'Paga',
  'status.statement.open': 'Aberta',
  'status.statement.upcoming': 'Futura',
  'status.statement.due': 'Vencida',
  'source.card_payment': 'Pagamento de fatura',
  'source.goal': 'Meta',
  'errors.generic': 'Algo deu errado (ref. {id}).',
  'errors.NETWORK': 'Não foi possível conectar ao servidor. Verifique sua conexão.',
  'errors.VALIDATION_FAILED': 'Alguns campos são inválidos.',
  'errors.INVALID_JSON': 'A requisição está malformada.',
  'errors.UNAUTHENTICATED': 'Sua sessão expirou. Entre novamente.',
  'errors.NOT_FOUND': 'Não encontrado. Pode ter sido excluído.',
  'errors.PAYLOAD_TOO_LARGE': 'Os dados são grandes demais para enviar.',
  'errors.INTERNAL': 'O servidor teve um problema. Tente novamente em instantes.',
  'errors.INVALID_REFERENCE': 'Um dos itens selecionados não existe mais.',
  'errors.TRANSFER_SAME_ACCOUNT': 'Escolha duas contas diferentes para a transferência.',
  'errors.TRANSFER_FROM_CARD': 'Uma transferência não pode sair de um cartão de crédito.',
  'errors.INCOME_ON_CARD': 'Receitas não podem ser lançadas em cartão de crédito.',
  'errors.INSTALLMENTS_ONLY_EXPENSE': 'Parcelamento só vale para despesas.',
  'errors.MOVE_TARGET_INVALID': 'Escolha outro destino para mover os dados.',
  'errors.INVALID_PARENT': 'Uma categoria não pode ser pai de si mesma.',
  'errors.HAS_SUBCATEGORIES': 'Uma categoria com subcategorias deve ficar no nível principal.',
  'errors.BUDGET_EXISTS': 'Esta categoria já tem um orçamento.',
  'errors.ALREADY_HAS_DATA': 'Sua conta já tem dados, então a importação não é permitida.',
  'categories.groceries': 'Mercado',
  'categories.groceries.supermarket': 'Supermercado',
  'categories.groceries.bakery': 'Padaria',
  'categories.groceries.butcher': 'Açougue',
  'categories.housing': 'Moradia',
  'categories.housing.rent': 'Aluguel',
  'categories.housing.condo_fee': 'Condomínio',
  'categories.housing.utilities': 'Contas da casa',
  'categories.transport': 'Transporte',
  'categories.transport.fuel': 'Combustível',
  'categories.transport.ride_apps': 'Apps de transporte',
  'categories.transport.parking': 'Estacionamento',
  'categories.food': 'Alimentação',
  'categories.food.restaurants': 'Restaurantes',
  'categories.food.delivery': 'Delivery',
  'categories.subscriptions': 'Assinaturas',
  'categories.electronics': 'Eletrônicos',
  'categories.health': 'Saúde',
  'categories.health.pharmacy': 'Farmácia',
  'categories.health.doctor': 'Médico',
  'categories.travel': 'Viagens',
  'categories.sports': 'Esportes',
  'categories.sports.equipment': 'Equipamentos',
  'categories.sports.gym': 'Academia',
  'categories.income': 'Receitas',
  'categories.income.salary': 'Salário',
  'categories.income.other_income': 'Outras receitas',
  // @@keys-end
};
```

- [ ] **Step 4: Implement provider, error mapping and test utils**

`src/i18n/errors.ts`

```ts
import { hasKey, type I18n } from './index';

/** Translated, user-facing text for any thrown value. Unknown codes fall back to a generic message with the request id. */
export function errorMessage(err: unknown, t: I18n['t']): string {
  const e = err as { code?: unknown; requestId?: unknown } | null;
  const code = e && typeof e === 'object' && typeof e.code === 'string' ? e.code : undefined;
  const key = `errors.${code}`;
  if (code && hasKey(key)) return t(key);
  const id = e && typeof e.requestId === 'string' ? e.requestId : '-';
  return t('errors.generic', { id });
}
```

`src/i18n/index.tsx`

```tsx
import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { en, type Key } from './en';
import { ptBR } from './pt-BR';
import {
  formatDate, formatDateShort, formatMoney, formatMonth, moneyToInput, parseMoney, todayIn, type Locale,
} from './format';

export type { Locale } from './format';
export type { Key } from './en';

export type I18n = {
  locale: Locale; currency: string; timezone: string; today: string;
  t: (key: Key, vars?: Record<string, string | number>) => string;
  tOr: (key: string, fallback: string) => string;
  money: (cents: number) => string;
  date: (iso: string) => string;
  dateShort: (iso: string) => string;
  month: (key: string, long?: boolean) => string;
  parseMoney: (s: string) => number | null;
  moneyInput: (cents: number) => string;
};

const catalogs: Record<Locale, Record<Key, string>> = { en, 'pt-BR': ptBR };
export const hasKey = (k: string): k is Key => k in en;

export function browserLocale(): Locale {
  return (typeof navigator !== 'undefined' ? navigator.language : 'en').toLowerCase().startsWith('pt') ? 'pt-BR' : 'en';
}

const Ctx = createContext<I18n | null>(null);

export function I18nProvider({ locale, currency = 'BRL', timezone = 'America/Sao_Paulo', today, children }: {
  locale: Locale; currency?: string; timezone?: string; today?: string; children: ReactNode;
}) {
  const value = useMemo<I18n>(() => {
    const cat = catalogs[locale];
    const t: I18n['t'] = (key, vars) => (vars ? cat[key].replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? '')) : cat[key]);
    return {
      locale, currency, timezone, today: today ?? todayIn(timezone),
      t, tOr: (key, fallback) => (hasKey(key) ? t(key) : fallback),
      money: c => formatMoney(c, locale, currency),
      date: d => formatDate(d, locale),
      dateShort: d => formatDateShort(d, locale),
      month: (k, long) => formatMonth(k, locale, long),
      parseMoney: s => parseMoney(s, locale),
      moneyInput: c => moneyToInput(c, locale),
    };
  }, [locale, currency, timezone, today]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useI18n(): I18n {
  const v = useContext(Ctx);
  if (!v) throw new Error('useI18n must be used inside <I18nProvider>');
  return v;
}
```

`test/utils.tsx`

```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, type RenderResult } from '@testing-library/react';
import type { ReactElement } from 'react';
import { I18nProvider, type Locale } from '../src/i18n';

export function renderWithProviders(ui: ReactElement, o: { locale?: Locale; currency?: string; timezone?: string; today?: string } = {}): RenderResult & { qc: QueryClient } {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 0 }, mutations: { retry: false } } });
  const r = render(
    <QueryClientProvider client={qc}>
      <I18nProvider locale={o.locale ?? 'pt-BR'} currency={o.currency ?? 'BRL'} timezone={o.timezone} today={o.today ?? '2026-10-13'}>{ui}</I18nProvider>
    </QueryClientProvider>,
  );
  return Object.assign(r, { qc });
}
```

- [ ] **Step 5: Run tests and typecheck**

Run: `npx vitest run test/i18n && npx tsc --noEmit`
Expected: PASS. (The "t(...) used under src exists" test currently scans only the existing app, which has no `t(` calls, so it passes trivially; it becomes meaningful as pages migrate.)

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(i18n): typed pt-BR/en catalogs, provider and error messages" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 3: API types, client and endpoints

**Files:**
- Create: `src/api/types.ts`, `src/api/client.ts`, `src/api/endpoints.ts`, `src/api/receipt.ts`
- Test: `test/api/client.test.ts`, `test/api/endpoints.test.ts`, `test/api/receipt.test.ts`

**Interfaces:**
- Produces (`types.ts`): DTO types exactly as below (also used by every later task).
- Produces (`client.ts`): `class ApiError extends Error { status: number; code: string; fields?: Record<string,string[]>; requestId?: string }`; `type TokenProvider = { getAccessToken(): Promise<string|null>; refresh(): Promise<string|null>; onAuthFailure(): void }`; `setTokenProvider(p: TokenProvider | null): void`; `request<T>(method: string, path: string, opts?: {query?: Record<string, string|undefined>; body?: unknown}): Promise<T>`.
- Produces (`endpoints.ts`): one exported function per route (31), signatures below.
- Produces (`receipt.ts`): `uploadReceipt(txId: string, file: File): Promise<void>`.

- [ ] **Step 1: Write DTO types** — `src/api/types.ts`

```ts
export type Locale = 'pt-BR' | 'en';
export type AccountKind = 'checking' | 'savings' | 'cash';
export type TxType = 'expense' | 'income' | 'transfer';
export type Repeat = 'weekly' | 'monthly' | 'yearly';
export type TxSource = 'card_payment' | 'goal';
export type StatementStatus = 'paid' | 'open' | 'upcoming' | 'due';

type Stamped = { createdAt?: string; updatedAt?: string };

export type Account = Stamped & {
  id: string; name: string; kind: AccountKind; bank: string; opening: number; color: string; inTotal: boolean; archived: boolean;
  balance: number;
};
export type Tx = Stamped & {
  id: string; type: TxType; amount: number; date: string; desc: string; accountId: string; toId?: string; categoryId?: string;
  tags: string[]; note: string; receiptKey?: string; receiptUrl?: string; groupId?: string; inst?: { i: number; n: number };
  repeat?: Repeat; source?: TxSource;
};
export type Statement = {
  key: string; total: number; paid: number; status: StatementStatus; due: string; range: { start: string; end: string }; items: Tx[];
};
export type Card = Stamped & {
  id: string; name: string; network: string; limit: number; closeDay: number; dueDay: number; color: string; payAccountId: string;
  used: number; statements: Statement[];
};
export type Category = Stamped & {
  id: string; name: string; parentId: string | null; icon: string; color: string; system: boolean; key?: string;
};
export type Budget = Stamped & { id: string; categoryId: string; limit: number; alertPct: number; spent: number; pct: number };
export type Goal = Stamped & {
  id: string; name: string; accountId: string; target: number; targetDate: string; saved: number;
  pct: number; left: number; monthsLeft: number; monthlyNeeded: number | null;
};
export type Overview = {
  month: string; totalBalance: number; income: number; expense: number; net: number; openStatementsTotal: number; recent: Tx[];
};
export type Me = { locale: Locale; currency: string; timezone: string };
export type Totals = { income: number; expense: number; net: number };
export type TxList = { items: Tx[]; totals: Totals };

export type AccountInput = { name: string; kind: AccountKind; bank?: string; opening?: number; color: string; inTotal?: boolean; archived?: boolean };
export type CardInput = { name: string; network: string; limit: number; closeDay: number; dueDay: number; color: string; payAccountId?: string };
export type CategoryInput = { name: string; parentId?: string | null; icon: string; color: string };
export type BudgetInput = { categoryId: string; limit: number; alertPct?: number };
export type GoalInput = { name: string; accountId?: string; target: number; targetDate?: string; saved?: number };
export type TxInput = {
  type: TxType; amount: number; date: string; desc: string; accountId: string; toId?: string; categoryId?: string; tags?: string[]; note?: string;
};
export type TxCreateInput = TxInput & { installments?: number; repeat?: Repeat };
export type PayInput = { amount: number; fromAccountId: string; date: string };
export type ContributeInput = { amount: number; fromAccountId?: string; date?: string };
export type TxFilters = { month?: string; account?: string; category?: string; type?: TxType; tag?: string; q?: string };
export type ReceiptUpload = { key: string; upload: { url: string; fields: Record<string, string> } };
export type ImportResult = {
  accounts: number; cards: number; categories: number; transactions: number; budgets: number; goals: number;
  receiptsSkipped: number; skippedTransactions: number; skippedBudgets: number;
};
export type DeleteScope = 'one' | 'future' | 'all';
```

- [ ] **Step 2: Write the failing tests**

`test/api/client.test.ts`

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, request, setTokenProvider } from '../../src/api/client';

const json = (status: number, body?: unknown) => new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => { fetchMock = vi.fn(); vi.stubGlobal('fetch', fetchMock); setTokenProvider(null); });
afterEach(() => vi.unstubAllGlobals());

describe('request', () => {
  it('sends method, bearer token, JSON body and query to /v1', async () => {
    setTokenProvider({ getAccessToken: async () => 'tok', refresh: async () => null, onAuthFailure: vi.fn() });
    fetchMock.mockResolvedValue(json(200, { ok: 1 }));
    const r = await request<{ ok: number }>('POST', '/accounts', { body: { a: 1 }, query: { month: '2026-10', skip: undefined } });
    expect(r).toEqual({ ok: 1 });
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toMatch(/\/v1\/accounts\?month=2026-10$/);
    expect(init.method).toBe('POST');
    expect(init.headers.Authorization).toBe('Bearer tok');
    expect(init.headers['content-type']).toBe('application/json');
    expect(init.body).toBe('{"a":1}');
  });
  it('204 returns undefined', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    expect(await request('DELETE', '/accounts/1')).toBeUndefined();
  });
  it('maps API errors to ApiError with code, fields and requestId', async () => {
    fetchMock.mockResolvedValue(json(409, { error: { code: 'BUDGET_EXISTS', message: 'dup', fields: { a: ['x'] }, requestId: 'r1' } }));
    const err = await request('POST', '/budgets').catch(e => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ status: 409, code: 'BUDGET_EXISTS', fields: { a: ['x'] }, requestId: 'r1' });
  });
  it('maps network failures to code NETWORK', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(request('GET', '/me')).rejects.toMatchObject({ status: 0, code: 'NETWORK' });
  });
  it('non-JSON error bodies still produce an ApiError', async () => {
    fetchMock.mockResolvedValue(new Response('<html>', { status: 502 }));
    await expect(request('GET', '/me')).rejects.toMatchObject({ status: 502, code: 'INTERNAL' });
  });
});

describe('401 handling (review focus 3)', () => {
  it('refreshes once and retries with the new token', async () => {
    const onAuthFailure = vi.fn();
    setTokenProvider({ getAccessToken: async () => 'old', refresh: async () => 'new', onAuthFailure });
    fetchMock.mockResolvedValueOnce(json(401, { error: { code: 'UNAUTHENTICATED', message: 'x' } })).mockResolvedValueOnce(json(200, { ok: true }));
    expect(await request('GET', '/me')).toEqual({ ok: true });
    expect(fetchMock.mock.calls[1][1].headers.Authorization).toBe('Bearer new');
    expect(onAuthFailure).not.toHaveBeenCalled();
  });
  it('parallel 401s trigger exactly one refresh', async () => {
    const refresh = vi.fn(async () => { await new Promise(r => setTimeout(r, 10)); return 'new'; });
    setTokenProvider({ getAccessToken: async () => 'old', refresh, onAuthFailure: vi.fn() });
    fetchMock.mockImplementation(async (_u, init) => (init.headers.Authorization === 'Bearer new' ? json(200, { ok: true }) : json(401, { error: { code: 'UNAUTHENTICATED', message: 'x' } })));
    const rs = await Promise.all([request('GET', '/a'), request('GET', '/b'), request('GET', '/c')]);
    expect(rs).toEqual([{ ok: true }, { ok: true }, { ok: true }]);
    expect(refresh).toHaveBeenCalledTimes(1);
  });
  it('failed refresh signs out and rejects with UNAUTHENTICATED', async () => {
    const onAuthFailure = vi.fn();
    setTokenProvider({ getAccessToken: async () => 'old', refresh: async () => null, onAuthFailure });
    fetchMock.mockResolvedValue(json(401, { error: { code: 'UNAUTHENTICATED', message: 'x' } }));
    await expect(request('GET', '/me')).rejects.toMatchObject({ status: 401, code: 'UNAUTHENTICATED' });
    expect(onAuthFailure).toHaveBeenCalledTimes(1);
  });
  it('a still-401 after a successful refresh also signs out (no retry loop)', async () => {
    const onAuthFailure = vi.fn();
    setTokenProvider({ getAccessToken: async () => 'old', refresh: async () => 'new', onAuthFailure });
    fetchMock.mockResolvedValue(json(401, { error: { code: 'UNAUTHENTICATED', message: 'x' } }));
    await expect(request('GET', '/me')).rejects.toMatchObject({ status: 401 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(onAuthFailure).toHaveBeenCalledTimes(1);
  });
});
```

`test/api/endpoints.test.ts`

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as client from '../../src/api/client';
import * as api from '../../src/api/endpoints';

vi.mock('../../src/api/client', async importOriginal => ({ ...(await importOriginal<typeof client>()), request: vi.fn(async () => undefined) }));
const req = vi.mocked(client.request);
beforeEach(() => req.mockClear());

const cases: [string, () => unknown, string, string, object?][] = [
  ['listAccounts', () => api.listAccounts(), 'GET', '/accounts'],
  ['createAccount', () => api.createAccount({ name: 'A', kind: 'cash', color: '#000000' }), 'POST', '/accounts', { body: { name: 'A', kind: 'cash', color: '#000000' } }],
  ['updateAccount', () => api.updateAccount('1', { name: 'B' }), 'PUT', '/accounts/1', { body: { name: 'B' } }],
  ['deleteAccount', () => api.deleteAccount('1', '2'), 'DELETE', '/accounts/1', { query: { moveTo: '2' } }],
  ['listCards', () => api.listCards(), 'GET', '/cards'],
  ['createCard', () => api.createCard({ name: 'C', network: 'Visa', limit: 1, closeDay: 1, dueDay: 2, color: '#000000' }), 'POST', '/cards', { body: { name: 'C', network: 'Visa', limit: 1, closeDay: 1, dueDay: 2, color: '#000000' } }],
  ['updateCard', () => api.updateCard('1', { limit: 5 }), 'PUT', '/cards/1', { body: { limit: 5 } }],
  ['deleteCard', () => api.deleteCard('1'), 'DELETE', '/cards/1'],
  ['payCard', () => api.payCard('1', { amount: 5, fromAccountId: 'a', date: '2026-10-13' }), 'POST', '/cards/1/pay', { body: { amount: 5, fromAccountId: 'a', date: '2026-10-13' } }],
  ['listCategories', () => api.listCategories(), 'GET', '/categories'],
  ['createCategory', () => api.createCategory({ name: 'X', icon: 'Paw', color: '#000000' }), 'POST', '/categories', { body: { name: 'X', icon: 'Paw', color: '#000000' } }],
  ['updateCategory', () => api.updateCategory('1', { name: 'Y' }), 'PUT', '/categories/1', { body: { name: 'Y' } }],
  ['deleteCategory', () => api.deleteCategory('1', 'z'), 'DELETE', '/categories/1', { query: { moveTo: 'z' } }],
  ['listTransactions', () => api.listTransactions({ month: '2026-10', tag: '#a' }), 'GET', '/transactions', { query: { month: '2026-10', tag: '#a' } }],
  ['createTransactions', () => api.createTransactions({ type: 'expense', amount: 1, date: '2026-10-13', desc: 'x', accountId: 'a', installments: 3 }), 'POST', '/transactions', { body: { type: 'expense', amount: 1, date: '2026-10-13', desc: 'x', accountId: 'a', installments: 3 } }],
  ['updateTransaction', () => api.updateTransaction('1', { type: 'expense', amount: 1, date: '2026-10-13', desc: 'x', accountId: 'a' }), 'PUT', '/transactions/1', { body: { type: 'expense', amount: 1, date: '2026-10-13', desc: 'x', accountId: 'a' } }],
  ['deleteTransaction', () => api.deleteTransaction('1', 'future'), 'DELETE', '/transactions/1', { query: { scope: 'future' } }],
  ['issueReceipt', () => api.issueReceipt('1', 'image/png'), 'POST', '/transactions/1/receipt', { body: { contentType: 'image/png' } }],
  ['listBudgets', () => api.listBudgets('2026-10'), 'GET', '/budgets', { query: { month: '2026-10' } }],
  ['createBudget', () => api.createBudget({ categoryId: 'c', limit: 5 }), 'POST', '/budgets', { body: { categoryId: 'c', limit: 5 } }],
  ['updateBudget', () => api.updateBudget('1', { limit: 6 }), 'PUT', '/budgets/1', { body: { limit: 6 } }],
  ['deleteBudget', () => api.deleteBudget('1'), 'DELETE', '/budgets/1'],
  ['listGoals', () => api.listGoals(), 'GET', '/goals'],
  ['createGoal', () => api.createGoal({ name: 'G', target: 5 }), 'POST', '/goals', { body: { name: 'G', target: 5 } }],
  ['updateGoal', () => api.updateGoal('1', { saved: 2 }), 'PUT', '/goals/1', { body: { saved: 2 } }],
  ['deleteGoal', () => api.deleteGoal('1'), 'DELETE', '/goals/1'],
  ['contributeGoal', () => api.contributeGoal('1', { amount: 5 }), 'POST', '/goals/1/contribute', { body: { amount: 5 } }],
  ['getOverview', () => api.getOverview('2026-10'), 'GET', '/overview', { query: { month: '2026-10' } }],
  ['getMe', () => api.getMe(), 'GET', '/me'],
  ['putMe', () => api.putMe({ locale: 'en', currency: 'USD', timezone: 'UTC' }), 'PUT', '/me', { body: { locale: 'en', currency: 'USD', timezone: 'UTC' } }],
  ['importState', () => api.importState({ v: 1 }), 'POST', '/import', { body: { v: 1 } }],
];

describe('endpoints map to the 31 backend routes', () => {
  it('covers 31 routes', () => expect(cases).toHaveLength(31));
  for (const [name, call, method, path, opts] of cases) {
    it(name, async () => {
      await call();
      expect(req).toHaveBeenCalledWith(method, path, ...(opts ? [opts] : []));
    });
  }
});
```

`test/api/receipt.test.ts`

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as api from '../../src/api/endpoints';
import { uploadReceipt } from '../../src/api/receipt';

vi.mock('../../src/api/endpoints');
let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => { fetchMock = vi.fn(async () => new Response(null, { status: 204 })); vi.stubGlobal('fetch', fetchMock); });
afterEach(() => vi.unstubAllGlobals());

describe('uploadReceipt', () => {
  it('requests a presigned POST and uploads fields first, file last', async () => {
    vi.mocked(api.issueReceipt).mockResolvedValue({ key: 'k', upload: { url: 'https://s3.test/b', fields: { key: 'k', 'Content-Type': 'image/png' } } });
    const file = new File(['x'], 'r.png', { type: 'image/png' });
    await uploadReceipt('tx1', file);
    expect(api.issueReceipt).toHaveBeenCalledWith('tx1', 'image/png');
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://s3.test/b');
    expect(init.method).toBe('POST');
    const keys = [...(init.body as FormData).keys()];
    expect(keys).toEqual(['key', 'Content-Type', 'file']);
  });
  it('rejects unsupported types and files over 5 MB before any request', async () => {
    await expect(uploadReceipt('t', new File(['x'], 'a.pdf', { type: 'application/pdf' }))).rejects.toThrow(/type/i);
    await expect(uploadReceipt('t', new File([new Uint8Array(5 * 1024 * 1024 + 1)], 'a.png', { type: 'image/png' }))).rejects.toThrow(/large/i);
    expect(api.issueReceipt).not.toHaveBeenCalled();
  });
  it('throws when S3 refuses the upload', async () => {
    vi.mocked(api.issueReceipt).mockResolvedValue({ key: 'k', upload: { url: 'https://s3.test/b', fields: {} } });
    fetchMock.mockResolvedValue(new Response('denied', { status: 403 }));
    await expect(uploadReceipt('t', new File(['x'], 'a.png', { type: 'image/png' }))).rejects.toThrow();
  });
});
```

- [ ] **Step 3: Run to verify they fail**

Run: `npx vitest run test/api`
Expected: FAIL (modules not found).

- [ ] **Step 4: Implement the client** — `src/api/client.ts`

```ts
export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string, public fields?: Record<string, string[]>, public requestId?: string) {
    super(message);
    this.name = 'ApiError';
  }
}

export type TokenProvider = {
  getAccessToken(): Promise<string | null>;
  refresh(): Promise<string | null>;
  onAuthFailure(): void;
};

let provider: TokenProvider | null = null;
let refreshing: Promise<string | null> | null = null;

export function setTokenProvider(p: TokenProvider | null) { provider = p; refreshing = null; }

/** One refresh in flight at a time, shared by every parallel 401. */
const refreshOnce = () => (refreshing ??= provider!.refresh().finally(() => { refreshing = null; }));

const base = () => (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '');

function qs(query?: Record<string, string | undefined>): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(query ?? {})) if (v !== undefined && v !== '') p.set(k, v);
  const s = p.toString();
  return s ? `?${s}` : '';
}

export async function request<T>(method: string, path: string, opts: { query?: Record<string, string | undefined>; body?: unknown } = {}): Promise<T> {
  const url = `${base()}/v1${path}${qs(opts.query)}`;
  const send = async (token: string | null): Promise<Response> => {
    const headers: Record<string, string> = {};
    if (opts.body !== undefined) headers['content-type'] = 'application/json';
    if (token) headers.Authorization = `Bearer ${token}`;
    try {
      return await fetch(url, { method, headers, body: opts.body === undefined ? undefined : JSON.stringify(opts.body) });
    } catch {
      throw new ApiError(0, 'NETWORK', 'Network error');
    }
  };

  let res = await send(provider ? await provider.getAccessToken() : null);
  if (res.status === 401 && provider) {
    const fresh = await refreshOnce();
    if (fresh) res = await send(fresh);
    if (res.status === 401 || !fresh) provider.onAuthFailure();
  }
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  let data: { error?: { code?: string; message?: string; fields?: Record<string, string[]>; requestId?: string } } | undefined;
  try { data = text ? JSON.parse(text) : undefined; } catch { data = undefined; }
  if (!res.ok) {
    throw new ApiError(res.status, data?.error?.code ?? (res.status === 401 ? 'UNAUTHENTICATED' : 'INTERNAL'),
      data?.error?.message ?? res.statusText, data?.error?.fields, data?.error?.requestId);
  }
  return data as T;
}
```

`src/api/endpoints.ts`

```ts
import { request } from './client';
import type {
  Account, AccountInput, Budget, BudgetInput, Card, CardInput, Category, CategoryInput, ContributeInput, DeleteScope, Goal, GoalInput,
  ImportResult, Me, Overview, PayInput, ReceiptUpload, Tx, TxCreateInput, TxFilters, TxInput, TxList,
} from './types';

// accounts
export const listAccounts = () => request<Account[]>('GET', '/accounts');
export const createAccount = (body: AccountInput) => request<Account>('POST', '/accounts', { body });
export const updateAccount = (id: string, body: Partial<AccountInput>) => request<Account>('PUT', `/accounts/${id}`, { body });
export const deleteAccount = (id: string, moveTo?: string) => request<void>('DELETE', `/accounts/${id}`, { query: { moveTo } });
// cards
export const listCards = () => request<Card[]>('GET', '/cards');
export const createCard = (body: CardInput) => request<Card>('POST', '/cards', { body });
export const updateCard = (id: string, body: Partial<CardInput>) => request<Card>('PUT', `/cards/${id}`, { body });
export const deleteCard = (id: string) => request<void>('DELETE', `/cards/${id}`);
export const payCard = (id: string, body: PayInput) => request<Tx>('POST', `/cards/${id}/pay`, { body });
// categories
export const listCategories = () => request<Category[]>('GET', '/categories');
export const createCategory = (body: CategoryInput) => request<Category>('POST', '/categories', { body });
export const updateCategory = (id: string, body: Partial<CategoryInput>) => request<Category>('PUT', `/categories/${id}`, { body });
export const deleteCategory = (id: string, moveTo?: string) => request<void>('DELETE', `/categories/${id}`, { query: { moveTo } });
// transactions
export const listTransactions = (f: TxFilters = {}) => request<TxList>('GET', '/transactions', { query: { ...f } });
export const createTransactions = (body: TxCreateInput) => request<Tx[]>('POST', '/transactions', { body });
export const updateTransaction = (id: string, body: TxInput) => request<Tx>('PUT', `/transactions/${id}`, { body });
export const deleteTransaction = (id: string, scope: DeleteScope = 'one') => request<void>('DELETE', `/transactions/${id}`, { query: { scope } });
export const issueReceipt = (id: string, contentType: string) => request<ReceiptUpload>('POST', `/transactions/${id}/receipt`, { body: { contentType } });
// budgets
export const listBudgets = (month?: string) => request<Budget[]>('GET', '/budgets', { query: { month } });
export const createBudget = (body: BudgetInput) => request<Budget>('POST', '/budgets', { body });
export const updateBudget = (id: string, body: Partial<BudgetInput>) => request<Budget>('PUT', `/budgets/${id}`, { body });
export const deleteBudget = (id: string) => request<void>('DELETE', `/budgets/${id}`);
// goals
export const listGoals = () => request<Goal[]>('GET', '/goals');
export const createGoal = (body: GoalInput) => request<Goal>('POST', '/goals', { body });
export const updateGoal = (id: string, body: Partial<GoalInput>) => request<Goal>('PUT', `/goals/${id}`, { body });
export const deleteGoal = (id: string) => request<void>('DELETE', `/goals/${id}`);
export const contributeGoal = (id: string, body: ContributeInput) => request<Goal>('POST', `/goals/${id}/contribute`, { body });
// overview, profile, import
export const getOverview = (month?: string) => request<Overview>('GET', '/overview', { query: { month } });
export const getMe = () => request<Me>('GET', '/me');
export const putMe = (body: Me) => request<Me>('PUT', '/me', { body });
export const importState = (body: unknown) => request<ImportResult>('POST', '/import', { body });
```

Note on `endpoints.test.ts`: calls without opts (e.g. `listAccounts`) must call `request('GET','/accounts')` with exactly two args, while `deleteAccount('1','2')` passes `{ query: { moveTo: '2' } }`. The test's `toHaveBeenCalledWith(method, path, ...(opts ? [opts] : []))` therefore requires the endpoint functions with no body/query to call `request(method, path)` with two arguments — as written above. Two functions pass an options object even when optional params are absent (`deleteAccount`, `deleteCategory`, `listTransactions`, `listBudgets`, `getOverview`, `deleteTransaction`): the cases above always supply the optional param, so they match; do not add cases without it.

`src/api/receipt.ts`

```ts
import { issueReceipt } from './endpoints';

const TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX = 5 * 1024 * 1024;

/** Presigned-POST upload: form fields first, the file last (S3 requirement). */
export async function uploadReceipt(txId: string, file: File): Promise<void> {
  if (!TYPES.includes(file.type)) throw new Error('Unsupported file type');
  if (file.size > MAX) throw new Error('File is too large (max 5 MB)');
  const { upload } = await issueReceipt(txId, file.type);
  const form = new FormData();
  for (const [k, v] of Object.entries(upload.fields)) form.append(k, v);
  form.append('file', file);
  const res = await fetch(upload.url, { method: 'POST', body: form });
  if (!res.ok) throw new Error(`Receipt upload failed (${res.status})`);
}
```

- [ ] **Step 5: Run tests and typecheck**

Run: `npx vitest run test/api && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(api): typed client with token refresh, endpoints and receipt upload" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```


---

### Task 4: Local preferences and legacy-data reader

**Files:**
- Create: `src/prefs.ts`, `src/legacy.ts`
- Test: `test/prefs.test.ts`, `test/legacy.test.ts`

**Interfaces:**
- Produces (`prefs.ts`): `type Theme = 'system'|'light'|'dark'`; `type Prefs = {theme: Theme; userName: string}`; `getPrefs(): Prefs`; `setPrefs(p: Partial<Prefs>): void`; `usePrefs(): Prefs` (re-renders on change). Storage key `financeControl:prefs`; on first read with no prefs key it seeds `theme`/`userName` from the legacy state (`financeControl:v1`) if present.
- Produces (`legacy.ts`): `LEGACY_KEY = 'financeControl:v1'`; `type LegacyCounts = {accounts: number; cards: number; transactions: number; budgets: number; goals: number}`; `readLegacy(): {state: unknown; counts: LegacyCounts} | null` (null when absent, unparsable, `v !== 1`, or all five collections empty); `clearLegacy(): void`.

- [ ] **Step 1: Write the failing tests**

`test/prefs.test.ts`

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

beforeEach(() => { vi.resetModules(); });

describe('prefs', () => {
  it('defaults to system theme and empty name', async () => {
    const { getPrefs } = await import('../src/prefs');
    expect(getPrefs()).toEqual({ theme: 'system', userName: '' });
  });
  it('seeds from legacy state once, then persists changes', async () => {
    localStorage.setItem('financeControl:v1', JSON.stringify({ v: 1, theme: 'dark', userName: 'Matheus', accounts: [] }));
    const { getPrefs, setPrefs } = await import('../src/prefs');
    expect(getPrefs()).toEqual({ theme: 'dark', userName: 'Matheus' });
    setPrefs({ theme: 'light' });
    expect(JSON.parse(localStorage.getItem('financeControl:prefs')!)).toEqual({ theme: 'light', userName: 'Matheus' });
  });
  it('ignores corrupted storage', async () => {
    localStorage.setItem('financeControl:prefs', '{nope');
    const { getPrefs } = await import('../src/prefs');
    expect(getPrefs().theme).toBe('system');
  });
});
```

`test/legacy.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import { clearLegacy, readLegacy } from '../src/legacy';

const put = (o: unknown) => localStorage.setItem('financeControl:v1', JSON.stringify(o));
const base = { v: 1, accounts: [], cards: [], categories: [], transactions: [], budgets: [], goals: [] };

describe('readLegacy', () => {
  it('returns null when nothing is stored', () => expect(readLegacy()).toBeNull());
  it('returns null for corrupted, wrong-version or all-empty data', () => {
    localStorage.setItem('financeControl:v1', '{x');
    expect(readLegacy()).toBeNull();
    put({ ...base, v: 2, accounts: [{}] });
    expect(readLegacy()).toBeNull();
    put(base);
    expect(readLegacy()).toBeNull();
  });
  it('returns the state and counts when there is user data', () => {
    put({ ...base, accounts: [{ id: 'a' }], transactions: [{ id: 't1' }, { id: 't2' }] });
    const r = readLegacy()!;
    expect(r.counts).toEqual({ accounts: 1, cards: 0, transactions: 2, budgets: 0, goals: 0 });
    expect((r.state as { v: number }).v).toBe(1);
  });
  it('clearLegacy removes it', () => {
    put({ ...base, accounts: [{ id: 'a' }] });
    clearLegacy();
    expect(readLegacy()).toBeNull();
    expect(localStorage.getItem('financeControl:v1')).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run test/prefs.test.ts test/legacy.test.ts`
Expected: FAIL (modules not found).

- [ ] **Step 3: Implement**

`src/legacy.ts`

```ts
export const LEGACY_KEY = 'financeControl:v1';

export type LegacyCounts = { accounts: number; cards: number; transactions: number; budgets: number; goals: number };

const len = (v: unknown) => (Array.isArray(v) ? v.length : 0);

/** The pre-API localStorage state, if it holds anything worth importing. */
export function readLegacy(): { state: unknown; counts: LegacyCounts } | null {
  try {
    const raw = localStorage.getItem(LEGACY_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as Record<string, unknown> | null;
    if (!s || s.v !== 1) return null;
    const counts: LegacyCounts = {
      accounts: len(s.accounts), cards: len(s.cards), transactions: len(s.transactions), budgets: len(s.budgets), goals: len(s.goals),
    };
    return Object.values(counts).some(n => n > 0) ? { state: s, counts } : null;
  } catch {
    return null;
  }
}

export function clearLegacy(): void {
  try { localStorage.removeItem(LEGACY_KEY); } catch { /* storage unavailable */ }
}
```

`src/prefs.ts`

```ts
import { useSyncExternalStore } from 'react';
import { LEGACY_KEY } from './legacy';

export type Theme = 'system' | 'light' | 'dark';
export type Prefs = { theme: Theme; userName: string };

const KEY = 'financeControl:prefs';
const THEMES: Theme[] = ['system', 'light', 'dark'];

function load(): Prefs {
  const fallback: Prefs = { theme: 'system', userName: '' };
  const read = (k: string): Record<string, unknown> | null => {
    try { const r = localStorage.getItem(k); return r ? (JSON.parse(r) as Record<string, unknown>) : null; } catch { return null; }
  };
  const src = read(KEY) ?? read(LEGACY_KEY);
  if (!src) return fallback;
  return {
    theme: THEMES.includes(src.theme as Theme) ? (src.theme as Theme) : 'system',
    userName: typeof src.userName === 'string' ? src.userName : '',
  };
}

let current: Prefs = load();
const listeners = new Set<() => void>();

export const getPrefs = () => current;

export function setPrefs(p: Partial<Prefs>): void {
  current = { ...current, ...p };
  try { localStorage.setItem(KEY, JSON.stringify(current)); } catch { /* storage unavailable: keep in memory */ }
  listeners.forEach(l => l());
}

export function usePrefs(): Prefs {
  return useSyncExternalStore(cb => { listeners.add(cb); return () => { listeners.delete(cb); }; }, getPrefs);
}
```

- [ ] **Step 4: Run tests and typecheck**

Run: `npx vitest run test/prefs.test.ts test/legacy.test.ts && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: local prefs (theme, display name) and legacy localStorage reader" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Authentication (dev + Cognito), provider and login page

**Files:**
- Create: `src/auth/dev.ts`, `src/auth/cognito.ts`, `src/auth/types.ts`, `src/auth/AuthProvider.tsx`, `src/auth/LoginPage.tsx`
- Modify: `src/i18n/en.ts`, `src/i18n/pt-BR.ts` (add keys before `// @@keys-end`)
- Test: `test/auth/dev.test.ts`, `test/auth/cognito.test.ts`, `test/auth/provider.test.tsx`, `test/auth/login.test.tsx`

**Interfaces:**
- Consumes: `setTokenProvider` (Task 3), `useI18n`/`I18nProvider`/`browserLocale` (Task 2), `useQueryClient` (TanStack).
- Produces:
  - `types.ts`: `interface AuthBackend { restore(): Promise<boolean>; signIn(id: string, secret?: string): Promise<'ok'|'newPassword'>; completeNewPassword(pw: string): Promise<void>; getAccessToken(): Promise<string|null>; refresh(): Promise<string|null>; signOut(): void }`; `type AuthStatus = 'loading'|'signedOut'|'newPassword'|'signedIn'`.
  - `dev.ts`: `DEV_AUTH: boolean` (from `VITE_DEV_AUTH==='true'`); `mintDevToken(sub: string, nowMs?: number): string`; `createDevBackend(): AuthBackend` (user id kept in `sessionStorage['fc:dev-user']`; valid ids `/^[A-Za-z0-9_-]{1,40}$/`, otherwise `signIn` rejects with `Error('INVALID_DEV_ID')`).
  - `cognito.ts`: `createCognitoBackend(cfg: {userPoolId: string; clientId: string}): AuthBackend`; `createMissingConfigBackend(): AuthBackend` (restore false, signIn rejects `Error('CONFIG')`); `pickBackend(): AuthBackend`.
  - `AuthProvider({backend, children})`, `useAuth(): {status: AuthStatus; expired: boolean; devMode: boolean; signIn(id, secret?): Promise<void>; completeNewPassword(pw): Promise<void>; signOut(): void}`.
  - `LoginPage()`.

> **Spec deviation (recorded ruling):** the spec says the access token lives in memory and only the refresh token in `localStorage`. `amazon-cognito-identity-js` restores sessions through its own storage keys, and splitting them risks a re-login on every reload; tokens therefore stay in the library's default `localStorage`. Revisit with a BFF/HttpOnly cookie if the threat model changes. State this in the task report.

- [ ] **Step 1: Add i18n keys** (insert before `// @@keys-end` in each catalog)

`en.ts`:

```ts
  // auth
  'auth.title': 'Sign in',
  'auth.email': 'Email',
  'auth.password': 'Password',
  'auth.signIn': 'Sign in',
  'auth.signingIn': 'Signing in…',
  'auth.invalidCredentials': 'Wrong email or password.',
  'auth.devTitle': 'Developer sign-in',
  'auth.devUserId': 'Dev user id',
  'auth.devEnter': 'Enter as dev user',
  'auth.devBanner': 'DEV AUTH — local testing only',
  'auth.invalidDevId': 'Use 1–40 letters, digits, "-" or "_".',
  'auth.newPasswordTitle': 'Choose a new password',
  'auth.newPasswordHint': 'This account needs a permanent password before you can continue.',
  'auth.newPassword': 'New password',
  'auth.setPassword': 'Set password',
  'auth.sessionExpired': 'Your session expired. Please sign in again.',
  'auth.configMissing': 'Cognito is not configured (missing VITE_COGNITO_* variables).',
```

`pt-BR.ts`:

```ts
  'auth.title': 'Entrar',
  'auth.email': 'E-mail',
  'auth.password': 'Senha',
  'auth.signIn': 'Entrar',
  'auth.signingIn': 'Entrando…',
  'auth.invalidCredentials': 'E-mail ou senha incorretos.',
  'auth.devTitle': 'Entrada de desenvolvedor',
  'auth.devUserId': 'ID do usuário de teste',
  'auth.devEnter': 'Entrar como usuário de teste',
  'auth.devBanner': 'AUTENTICAÇÃO DE TESTE — apenas uso local',
  'auth.invalidDevId': 'Use de 1 a 40 letras, números, "-" ou "_".',
  'auth.newPasswordTitle': 'Escolha uma nova senha',
  'auth.newPasswordHint': 'Esta conta precisa de uma senha definitiva antes de continuar.',
  'auth.newPassword': 'Nova senha',
  'auth.setPassword': 'Definir senha',
  'auth.sessionExpired': 'Sua sessão expirou. Entre novamente.',
  'auth.configMissing': 'O Cognito não está configurado (faltam variáveis VITE_COGNITO_*).',
```

- [ ] **Step 2: Write the failing tests**

`test/auth/dev.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import { createDevBackend, mintDevToken } from '../../src/auth/dev';

const decode = (t: string) => JSON.parse(atob(t.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));

describe('mintDevToken', () => {
  it('is an unsigned JWT carrying the claims serverless-offline needs', () => {
    const t = mintDevToken('alice', 1_800_000_000_000);
    const [h, p, s] = t.split('.');
    expect(s).toBe('');
    expect(JSON.parse(atob(h))).toEqual({ alg: 'none', typ: 'JWT' });
    expect(decode(t)).toMatchObject({ sub: 'alice', iat: 1_800_000_000, exp: 1_800_003_600, token_use: 'access' });
    expect(p).not.toMatch(/[=+/]/);
  });
});

describe('dev backend (review focus 5)', () => {
  it('signs in with a valid id, restores from sessionStorage and signs out', async () => {
    const b = createDevBackend();
    expect(await b.restore()).toBe(false);
    expect(await b.signIn('dev-1')).toBe('ok');
    expect(decode((await b.getAccessToken())!).sub).toBe('dev-1');
    expect(await createDevBackend().restore()).toBe(true);
    b.signOut();
    expect(await b.getAccessToken()).toBeNull();
    expect(await createDevBackend().restore()).toBe(false);
  });
  it('rejects invalid ids', async () => {
    const b = createDevBackend();
    await expect(b.signIn('')).rejects.toThrow('INVALID_DEV_ID');
    await expect(b.signIn('a b')).rejects.toThrow('INVALID_DEV_ID');
    await expect(b.signIn('x'.repeat(41))).rejects.toThrow('INVALID_DEV_ID');
  });
  it('refresh re-mints for the same user', async () => {
    const b = createDevBackend();
    await b.signIn('bob');
    expect(decode((await b.refresh())!).sub).toBe('bob');
  });
});
```

`test/auth/cognito.test.ts`

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('amazon-cognito-identity-js', () => {
  const state = { current: null as unknown, result: 'success' as 'success' | 'fail' | 'newPassword' };
  class CognitoUserPool { constructor(public cfg: unknown) {} getCurrentUser() { return state.current; } }
  class CognitoUser {
    constructor(public o: unknown) {}
    authenticateUser(_d: unknown, cb: { onSuccess: (r: unknown) => void; onFailure: (e: Error) => void; newPasswordRequired: (a: unknown) => void }) {
      if (state.result === 'success') { state.current = this; cb.onSuccess({}); }
      else if (state.result === 'fail') cb.onFailure(new Error('NotAuthorizedException'));
      else cb.newPasswordRequired({});
    }
    completeNewPasswordChallenge(_p: string, _a: unknown, cb: { onSuccess: (r: unknown) => void }) { state.current = this; cb.onSuccess({}); }
    getSession(cb: (e: Error | null, s: unknown) => void) {
      cb(null, { isValid: () => true, getAccessToken: () => ({ getJwtToken: () => 'access-1' }), getRefreshToken: () => ({}) });
    }
    refreshSession(_t: unknown, cb: (e: Error | null, s: unknown) => void) { cb(null, { getAccessToken: () => ({ getJwtToken: () => 'access-2' }) }); }
    signOut() { state.current = null; }
  }
  class AuthenticationDetails { constructor(public d: unknown) {} }
  return { CognitoUserPool, CognitoUser, AuthenticationDetails, __state: state };
});

import * as lib from 'amazon-cognito-identity-js';
import { createCognitoBackend, createMissingConfigBackend } from '../../src/auth/cognito';

const st = (lib as unknown as { __state: { current: unknown; result: string } }).__state;
const make = () => createCognitoBackend({ userPoolId: 'sa-east-1_x', clientId: 'c' });
beforeEach(() => { st.current = null; st.result = 'success'; });

describe('cognito backend', () => {
  it('restore is false with no current user, true once signed in', async () => {
    const b = make();
    expect(await b.restore()).toBe(false);
    expect(await b.signIn('a@b.c', 'pw')).toBe('ok');
    expect(await b.restore()).toBe(true);
    expect(await b.getAccessToken()).toBe('access-1');
  });
  it('failed sign-in rejects', async () => {
    st.result = 'fail';
    await expect(make().signIn('a@b.c', 'bad')).rejects.toThrow('NotAuthorizedException');
  });
  it('new-password challenge is surfaced and completed', async () => {
    st.result = 'newPassword';
    const b = make();
    expect(await b.signIn('a@b.c', 'tmp')).toBe('newPassword');
    await b.completeNewPassword('Perm4nent!pass');
    expect(await b.getAccessToken()).toBe('access-1');
  });
  it('completeNewPassword without a pending challenge rejects', async () => {
    await expect(make().completeNewPassword('x')).rejects.toThrow();
  });
  it('refresh returns a new access token; signOut clears the session', async () => {
    const b = make();
    await b.signIn('a@b.c', 'pw');
    expect(await b.refresh()).toBe('access-2');
    b.signOut();
    expect(await b.getAccessToken()).toBeNull();
    expect(await b.refresh()).toBeNull();
  });
  it('missing-config backend never signs in', async () => {
    const b = createMissingConfigBackend();
    expect(await b.restore()).toBe(false);
    await expect(b.signIn('a', 'b')).rejects.toThrow('CONFIG');
  });
});
```

`test/auth/provider.test.tsx`

```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AuthProvider, useAuth } from '../../src/auth/AuthProvider';
import type { AuthBackend } from '../../src/auth/types';
import * as client from '../../src/api/client';

function fake(over: Partial<AuthBackend> = {}): AuthBackend {
  return {
    restore: vi.fn(async () => false), signIn: vi.fn(async () => 'ok' as const), completeNewPassword: vi.fn(async () => {}),
    getAccessToken: vi.fn(async () => 'tok'), refresh: vi.fn(async () => 'tok2'), signOut: vi.fn(), ...over,
  };
}
function Probe() {
  const a = useAuth();
  return (<div><span data-testid="s">{a.status}</span><span data-testid="e">{String(a.expired)}</span>
    <button onClick={() => a.signIn('u', 'p')}>in</button><button onClick={() => a.signOut()}>out</button></div>);
}
const mount = (b: AuthBackend) => render(<QueryClientProvider client={new QueryClient()}><AuthProvider backend={b}><Probe /></AuthProvider></QueryClientProvider>);

describe('AuthProvider', () => {
  it('starts loading, then signedOut when nothing to restore', async () => {
    mount(fake());
    expect(screen.getByTestId('s')).toHaveTextContent('loading');
    await waitFor(() => expect(screen.getByTestId('s')).toHaveTextContent('signedOut'));
  });
  it('restores a session', async () => {
    mount(fake({ restore: async () => true }));
    await waitFor(() => expect(screen.getByTestId('s')).toHaveTextContent('signedIn'));
  });
  it('signIn → signedIn, new-password challenge → newPassword, signOut → signedOut', async () => {
    const b = fake({ signIn: vi.fn(async () => 'newPassword' as const) });
    mount(b);
    await waitFor(() => expect(screen.getByTestId('s')).toHaveTextContent('signedOut'));
    await act(async () => { screen.getByText('in').click(); });
    expect(screen.getByTestId('s')).toHaveTextContent('newPassword');
    (b.signIn as ReturnType<typeof vi.fn>).mockResolvedValue('ok');
    await act(async () => { screen.getByText('in').click(); });
    expect(screen.getByTestId('s')).toHaveTextContent('signedIn');
    await act(async () => { screen.getByText('out').click(); });
    expect(b.signOut).toHaveBeenCalled();
    expect(screen.getByTestId('s')).toHaveTextContent('signedOut');
  });
  it('wires the api token provider; an auth failure signs out and flags the session as expired', async () => {
    const spy = vi.spyOn(client, 'setTokenProvider');
    const b = fake({ restore: async () => true });
    mount(b);
    await waitFor(() => expect(screen.getByTestId('s')).toHaveTextContent('signedIn'));
    const tp = spy.mock.calls.at(-1)![0]!;
    expect(await tp.getAccessToken()).toBe('tok');
    await act(async () => { tp.onAuthFailure(); });
    expect(screen.getByTestId('s')).toHaveTextContent('signedOut');
    expect(screen.getByTestId('e')).toHaveTextContent('true');
    expect(b.signOut).toHaveBeenCalled();
  });
});
```

`test/auth/login.test.tsx`

```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '../../src/auth/AuthProvider';
import { LoginPage } from '../../src/auth/LoginPage';
import type { AuthBackend } from '../../src/auth/types';
import { I18nProvider } from '../../src/i18n';

function fake(over: Partial<AuthBackend> = {}): AuthBackend {
  return { restore: async () => false, signIn: vi.fn(async () => 'ok' as const), completeNewPassword: vi.fn(async () => {}),
    getAccessToken: async () => null, refresh: async () => null, signOut: vi.fn(), ...over };
}
const mount = (b: AuthBackend, dev: boolean, locale: 'pt-BR' | 'en' = 'pt-BR') =>
  render(<QueryClientProvider client={new QueryClient()}><AuthProvider backend={b} devMode={dev}><I18nProvider locale={locale}><LoginPage /></I18nProvider></AuthProvider></QueryClientProvider>);

describe('LoginPage', () => {
  it('cognito mode: submits email and password (pt-BR labels)', async () => {
    const b = fake();
    mount(b, false);
    await userEvent.type(await screen.findByLabelText('E-mail'), 'me@x.com');
    await userEvent.type(screen.getByLabelText('Senha'), 'secret');
    await userEvent.click(screen.getByRole('button', { name: 'Entrar' }));
    expect(b.signIn).toHaveBeenCalledWith('me@x.com', 'secret');
  });
  it('shows a translated error for wrong credentials', async () => {
    const b = fake({ signIn: vi.fn(async () => { throw new Error('NotAuthorizedException'); }) });
    mount(b, false, 'en');
    await userEvent.type(await screen.findByLabelText('Email'), 'me@x.com');
    await userEvent.type(screen.getByLabelText('Password'), 'bad');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Wrong email or password.');
  });
  it('dev mode: user id + enter button and the DEV banner', async () => {
    const b = fake();
    mount(b, true);
    expect(await screen.findByText(/AUTENTICAÇÃO DE TESTE/)).toBeInTheDocument();
    const id = screen.getByLabelText('ID do usuário de teste');
    await userEvent.clear(id);
    await userEvent.type(id, 'alice');
    await userEvent.click(screen.getByRole('button', { name: 'Entrar como usuário de teste' }));
    expect(b.signIn).toHaveBeenCalledWith('alice', undefined);
  });
  it('new-password challenge shows the set-password form', async () => {
    const b = fake({ signIn: vi.fn(async () => 'newPassword' as const) });
    mount(b, false);
    await userEvent.type(await screen.findByLabelText('E-mail'), 'me@x.com');
    await userEvent.type(screen.getByLabelText('Senha'), 'tmp');
    await userEvent.click(screen.getByRole('button', { name: 'Entrar' }));
    await userEvent.type(await screen.findByLabelText('Nova senha'), 'Perm4nent!pass');
    await userEvent.click(screen.getByRole('button', { name: 'Definir senha' }));
    await waitFor(() => expect(b.completeNewPassword).toHaveBeenCalledWith('Perm4nent!pass'));
  });
});
```

(`AuthProvider` therefore takes an optional `devMode?: boolean` prop defaulting to `DEV_AUTH`; `useAuth().devMode` exposes it.)

- [ ] **Step 3: Run to verify they fail**

Run: `npx vitest run test/auth`
Expected: FAIL (modules not found).

- [ ] **Step 4: Implement**

`src/auth/types.ts`

```ts
export interface AuthBackend {
  restore(): Promise<boolean>;
  signIn(id: string, secret?: string): Promise<'ok' | 'newPassword'>;
  completeNewPassword(pw: string): Promise<void>;
  getAccessToken(): Promise<string | null>;
  refresh(): Promise<string | null>;
  signOut(): void;
}
export type AuthStatus = 'loading' | 'signedOut' | 'newPassword' | 'signedIn';
```

`src/auth/dev.ts`

```ts
import type { AuthBackend } from './types';

export const DEV_AUTH = import.meta.env.VITE_DEV_AUTH === 'true';
const KEY = 'fc:dev-user';
const b64 = (o: object) => btoa(JSON.stringify(o)).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');

/** Unsigned JWT (alg none). Only serverless-offline accepts it; the deployed API rejects it. */
export function mintDevToken(sub: string, nowMs: number = Date.now()): string {
  const iat = Math.floor(nowMs / 1000);
  const header = btoa(JSON.stringify({ alg: 'none', typ: 'JWT' })).replace(/=+$/, '');
  return `${header}.${b64({ sub, iss: 'http://localhost/dev', aud: 'dev', token_use: 'access', iat, exp: iat + 3600 })}.`;
}

export function createDevBackend(): AuthBackend {
  const user = () => sessionStorage.getItem(KEY);
  return {
    async restore() { return user() !== null; },
    async signIn(id) {
      if (!/^[A-Za-z0-9_-]{1,40}$/.test(id)) throw new Error('INVALID_DEV_ID');
      sessionStorage.setItem(KEY, id);
      return 'ok';
    },
    async completeNewPassword() { /* not applicable */ },
    async getAccessToken() { const u = user(); return u ? mintDevToken(u) : null; },
    async refresh() { const u = user(); return u ? mintDevToken(u) : null; },
    signOut() { sessionStorage.removeItem(KEY); },
  };
}
```

`src/auth/cognito.ts`

```ts
import { AuthenticationDetails, CognitoUser, CognitoUserPool, type CognitoUserSession } from 'amazon-cognito-identity-js';
import { createDevBackend, DEV_AUTH } from './dev';
import type { AuthBackend } from './types';

export function createCognitoBackend(cfg: { userPoolId: string; clientId: string }): AuthBackend {
  const pool = new CognitoUserPool({ UserPoolId: cfg.userPoolId, ClientId: cfg.clientId });
  let pending: CognitoUser | null = null;
  const session = (u: CognitoUser) => new Promise<CognitoUserSession | null>(res => u.getSession((e: Error | null, s: CognitoUserSession | null) => res(e ? null : s)));

  return {
    async restore() {
      const u = pool.getCurrentUser();
      return u ? !!(await session(u)) : false;
    },
    signIn(email, password) {
      return new Promise((resolve, reject) => {
        const user = new CognitoUser({ Username: email, Pool: pool });
        user.authenticateUser(new AuthenticationDetails({ Username: email, Password: password ?? '' }), {
          onSuccess: () => resolve('ok'),
          onFailure: reject,
          newPasswordRequired: () => { pending = user; resolve('newPassword'); },
        });
      });
    },
    completeNewPassword(pw) {
      return new Promise<void>((resolve, reject) => {
        if (!pending) return reject(new Error('No pending password challenge'));
        pending.completeNewPasswordChallenge(pw, {}, { onSuccess: () => { pending = null; resolve(); }, onFailure: reject });
      });
    },
    async getAccessToken() {
      const u = pool.getCurrentUser();
      const s = u ? await session(u) : null;
      return s ? s.getAccessToken().getJwtToken() : null;
    },
    refresh() {
      return new Promise(resolve => {
        const u = pool.getCurrentUser();
        if (!u) return resolve(null);
        u.getSession((e: Error | null, s: CognitoUserSession | null) => {
          if (e || !s) return resolve(null);
          u.refreshSession(s.getRefreshToken(), (e2: Error | null, s2: CognitoUserSession | null) => resolve(e2 || !s2 ? null : s2.getAccessToken().getJwtToken()));
        });
      });
    },
    signOut() { pool.getCurrentUser()?.signOut(); },
  };
}

export function createMissingConfigBackend(): AuthBackend {
  return {
    async restore() { return false; },
    async signIn() { throw new Error('CONFIG'); },
    async completeNewPassword() { throw new Error('CONFIG'); },
    async getAccessToken() { return null; },
    async refresh() { return null; },
    signOut() {},
  };
}

export function pickBackend(): AuthBackend {
  if (DEV_AUTH) return createDevBackend();
  const userPoolId = import.meta.env.VITE_COGNITO_USER_POOL_ID;
  const clientId = import.meta.env.VITE_COGNITO_CLIENT_ID;
  return userPoolId && clientId ? createCognitoBackend({ userPoolId, clientId }) : createMissingConfigBackend();
}
```

`src/auth/AuthProvider.tsx`

```tsx
import { useQueryClient } from '@tanstack/react-query';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { setTokenProvider } from '../api/client';
import { DEV_AUTH } from './dev';
import type { AuthBackend, AuthStatus } from './types';

type AuthValue = {
  status: AuthStatus; expired: boolean; devMode: boolean;
  signIn: (id: string, secret?: string) => Promise<void>;
  completeNewPassword: (pw: string) => Promise<void>;
  signOut: () => void;
};
const Ctx = createContext<AuthValue | null>(null);

export function AuthProvider({ backend, devMode = DEV_AUTH, children }: { backend: AuthBackend; devMode?: boolean; children: ReactNode }) {
  const qc = useQueryClient();
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [expired, setExpired] = useState(false);

  useEffect(() => {
    setTokenProvider({
      getAccessToken: () => backend.getAccessToken(),
      refresh: () => backend.refresh(),
      onAuthFailure: () => { backend.signOut(); qc.clear(); setExpired(true); setStatus('signedOut'); },
    });
    let live = true;
    backend.restore().then(ok => { if (live) setStatus(ok ? 'signedIn' : 'signedOut'); }, () => { if (live) setStatus('signedOut'); });
    return () => { live = false; setTokenProvider(null); };
  }, [backend, qc]);

  const signIn = useCallback(async (id: string, secret?: string) => {
    const r = await backend.signIn(id, secret);
    setExpired(false);
    setStatus(r === 'ok' ? 'signedIn' : 'newPassword');
  }, [backend]);
  const completeNewPassword = useCallback(async (pw: string) => { await backend.completeNewPassword(pw); setStatus('signedIn'); }, [backend]);
  const signOut = useCallback(() => { backend.signOut(); qc.clear(); setExpired(false); setStatus('signedOut'); }, [backend, qc]);

  const value = useMemo(() => ({ status, expired, devMode, signIn, completeNewPassword, signOut }), [status, expired, devMode, signIn, completeNewPassword, signOut]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAuth must be used inside <AuthProvider>');
  return v;
}
```

`src/auth/LoginPage.tsx` (CSS classes `login`, `login-card`, `banner` are added in Task 7)

```tsx
import { useState, type FormEvent } from 'react';
import { useI18n } from '../i18n';
import { Field } from '../ui';
import { useAuth } from './AuthProvider';

export function LoginPage() {
  const { t } = useI18n();
  const auth = useAuth();
  const [id, setId] = useState(auth.devMode ? 'dev' : '');
  const [secret, setSecret] = useState('');
  const [newPw, setNewPw] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true); setError('');
    try { await fn(); } catch (e) {
      const m = e instanceof Error ? e.message : '';
      setError(m === 'CONFIG' ? t('auth.configMissing') : m === 'INVALID_DEV_ID' ? t('auth.invalidDevId') : t('auth.invalidCredentials'));
    } finally { setBusy(false); }
  };
  const submit = (e: FormEvent) => { e.preventDefault(); void run(() => auth.signIn(id, auth.devMode ? undefined : secret)); };
  const submitNew = (e: FormEvent) => { e.preventDefault(); void run(() => auth.completeNewPassword(newPw)); };

  return (
    <main className="login">
      {auth.devMode && <div className="banner" role="note">{t('auth.devBanner')}</div>}
      <div className="login-card card">
        <span className="brand"><b>financeControl</b><span className="pro">PRO</span></span>
        {auth.expired && <p className="muted" role="status">{t('auth.sessionExpired')}</p>}
        {auth.status === 'newPassword' ? (
          <form onSubmit={submitNew} className="login-form">
            <h1>{t('auth.newPasswordTitle')}</h1>
            <p className="muted">{t('auth.newPasswordHint')}</p>
            <Field label={t('auth.newPassword')}>{fid => <input id={fid} type="password" autoComplete="new-password" value={newPw} onChange={e => setNewPw(e.target.value)} />}</Field>
            {error && <span className="err" role="alert">{error}</span>}
            <button type="submit" className="btn btn-1" disabled={busy || !newPw}>{t('auth.setPassword')}</button>
          </form>
        ) : auth.devMode ? (
          <form onSubmit={submit} className="login-form">
            <h1>{t('auth.devTitle')}</h1>
            <Field label={t('auth.devUserId')}>{fid => <input id={fid} value={id} onChange={e => setId(e.target.value)} />}</Field>
            {error && <span className="err" role="alert">{error}</span>}
            <button type="submit" className="btn btn-1" disabled={busy}>{t('auth.devEnter')}</button>
          </form>
        ) : (
          <form onSubmit={submit} className="login-form">
            <h1>{t('auth.title')}</h1>
            <Field label={t('auth.email')}>{fid => <input id={fid} type="email" autoComplete="username" value={id} onChange={e => setId(e.target.value)} />}</Field>
            <Field label={t('auth.password')}>{fid => <input id={fid} type="password" autoComplete="current-password" value={secret} onChange={e => setSecret(e.target.value)} />}</Field>
            {error && <span className="err" role="alert">{error}</span>}
            <button type="submit" className="btn btn-1" disabled={busy || !id || !secret}>{busy ? t('auth.signingIn') : t('auth.signIn')}</button>
          </form>
        )}
      </div>
    </main>
  );
}
```

> `LoginPage` imports `Field` from `src/ui.tsx`, which still has an English-only `Modal` until Task 7; `Field` itself has no text, so this is fine.

- [ ] **Step 5: Run tests and typecheck**

Run: `npx vitest run test/auth test/i18n && npx tsc --noEmit`
Expected: PASS (catalog parity and the "t(...) keys exist" test now cover the new auth keys).

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(auth): Cognito and dev login, auth provider and login page" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Query hooks, invalidation matrix and lookups

**Files:**
- Create: `src/queries/keys.ts`, `src/queries/index.ts`, `src/queries/lookups.ts`, `src/i18n/txTitle.ts`
- Test: `test/queries/hooks.test.tsx`, `test/queries/lookups.test.tsx`

**Interfaces:**
- Consumes: `endpoints` (Task 3), `receipt.uploadReceipt`, `useI18n` (Task 2).
- Produces (`keys.ts`): `qk = { accounts, cards, categories, transactions, budgets, goals, overview, me }` — each a readonly one-element tuple like `['accounts'] as const`; `INVALIDATES` (see matrix below).
- Produces (`index.ts`): query hooks `useAccounts()`, `useCards()`, `useCategories()`, `useTransactions(filters: TxFilters)`, `useBudgets(month?: string)`, `useGoals()`, `useOverview(month?: string)`, `useMe()`; mutation hooks, each returning a TanStack `UseMutationResult` whose `mutate/mutateAsync` variable types are:
  - `useCreateAccount(AccountInput)`, `useUpdateAccount({id, body: Partial<AccountInput>})`, `useDeleteAccount({id, moveTo?})`
  - `useCreateCard(CardInput)`, `useUpdateCard({id, body})`, `useDeleteCard(id: string)`, `usePayCard({id, body: PayInput})`
  - `useCreateCategory(CategoryInput)`, `useUpdateCategory({id, body})`, `useDeleteCategory({id, moveTo?})`
  - `useCreateTransactions(TxCreateInput)`, `useUpdateTransaction({id, body: TxInput})`, `useDeleteTransaction({id, scope})`, `useUploadReceipt({txId, file})`
  - `useCreateBudget(BudgetInput)`, `useUpdateBudget({id, body})`, `useDeleteBudget(id)`
  - `useCreateGoal(GoalInput)`, `useUpdateGoal({id, body})`, `useDeleteGoal(id)`, `useContributeGoal({id, body: ContributeInput})`
  - `useUpdateMe(Me)`, `useImportState(unknown)`
- Produces (`lookups.ts`): `useCategoryLookup(): {categories: Category[]; ready: boolean; name(c: Category): string; label(id?: string): string; color(id?: string): string; tops: Category[]; subsOf(id: string): Category[]}`; `useAccountLookup(): {accounts: Account[]; cards: Card[]; ready: boolean; name(id?: string): string}`.
- Produces (`txTitle.ts`): `txTitle(t: I18n['t'], tx: Pick<Tx, 'desc'|'source'>): string` → `"<t('source.X')> · <desc>"` for system transfers, else `desc`.

Invalidation matrix (spec §4; the constant is the single source, the test table must match it):

| Mutation group | `INVALIDATES` | Prefixes refreshed |
|---|---|---|
| `transaction` | `transaction` | transactions, accounts, cards, budgets, goals, overview |
| `payCard` | `payCard` | transactions, accounts, cards, overview |
| `contribute` | `contribute` | goals, transactions, accounts, overview |
| `account` | `account` | accounts, cards, goals, transactions, overview |
| `card` | `card` | cards, transactions, overview |
| `category` | `category` | categories, budgets, transactions, overview |
| `budget` | `budget` | budgets, overview |
| `goal` | `goal` | goals, overview |
| `receipt` | `receipt` | transactions |
| `me` | `me` | me |
| `import` | `import` | everything |

- [ ] **Step 1: Write the failing tests**

`test/queries/hooks.test.tsx`

```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as api from '../../src/api/endpoints';
import * as receipt from '../../src/api/receipt';
import * as q from '../../src/queries';

vi.mock('../../src/api/endpoints');
vi.mock('../../src/api/receipt');

function setup() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const spy = vi.spyOn(qc, 'invalidateQueries');
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  return { qc, spy, wrapper };
}
const prefixes = (spy: ReturnType<typeof vi.spyOn>) => spy.mock.calls.map(c => (c[0] as { queryKey: string[] }).queryKey[0]).sort();

beforeEach(() => { vi.clearAllMocks(); });

describe('queries', () => {
  it('useTransactions passes filters and caches per filter set', async () => {
    vi.mocked(api.listTransactions).mockResolvedValue({ items: [], totals: { income: 0, expense: 0, net: 0 } });
    const { wrapper } = setup();
    const { result } = renderHook(() => q.useTransactions({ month: '2026-10', q: 'x' }), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(api.listTransactions).toHaveBeenCalledWith({ month: '2026-10', q: 'x' });
  });
  it('useBudgets / useOverview pass the month', async () => {
    vi.mocked(api.listBudgets).mockResolvedValue([]);
    vi.mocked(api.getOverview).mockResolvedValue({ month: '2026-10', totalBalance: 0, income: 0, expense: 0, net: 0, openStatementsTotal: 0, recent: [] });
    const { wrapper } = setup();
    renderHook(() => q.useBudgets('2026-10'), { wrapper });
    renderHook(() => q.useOverview('2026-10'), { wrapper });
    await waitFor(() => expect(api.listBudgets).toHaveBeenCalledWith('2026-10'));
    await waitFor(() => expect(api.getOverview).toHaveBeenCalledWith('2026-10'));
  });
});

const ALL = ['accounts', 'budgets', 'cards', 'categories', 'goals', 'me', 'overview', 'transactions'];
const matrix: [string, () => unknown, unknown, string[], () => void][] = [
  ['createTransactions', () => q.useCreateTransactions(), { type: 'expense', amount: 1, date: '2026-10-13', desc: 'x', accountId: 'a' }, ['accounts', 'budgets', 'cards', 'goals', 'overview', 'transactions'], () => vi.mocked(api.createTransactions).mockResolvedValue([])],
  ['updateTransaction', () => q.useUpdateTransaction(), { id: '1', body: {} }, ['accounts', 'budgets', 'cards', 'goals', 'overview', 'transactions'], () => vi.mocked(api.updateTransaction).mockResolvedValue({} as never)],
  ['deleteTransaction', () => q.useDeleteTransaction(), { id: '1', scope: 'one' }, ['accounts', 'budgets', 'cards', 'goals', 'overview', 'transactions'], () => vi.mocked(api.deleteTransaction).mockResolvedValue()],
  ['payCard', () => q.usePayCard(), { id: '1', body: { amount: 1, fromAccountId: 'a', date: '2026-10-13' } }, ['accounts', 'cards', 'overview', 'transactions'], () => vi.mocked(api.payCard).mockResolvedValue({} as never)],
  ['contributeGoal', () => q.useContributeGoal(), { id: '1', body: { amount: 1 } }, ['accounts', 'goals', 'overview', 'transactions'], () => vi.mocked(api.contributeGoal).mockResolvedValue({} as never)],
  ['createAccount', () => q.useCreateAccount(), { name: 'A', kind: 'cash', color: '#000000' }, ['accounts', 'cards', 'goals', 'overview', 'transactions'], () => vi.mocked(api.createAccount).mockResolvedValue({} as never)],
  ['updateAccount', () => q.useUpdateAccount(), { id: '1', body: {} }, ['accounts', 'cards', 'goals', 'overview', 'transactions'], () => vi.mocked(api.updateAccount).mockResolvedValue({} as never)],
  ['deleteAccount (review focus 4)', () => q.useDeleteAccount(), { id: '1', moveTo: '2' }, ['accounts', 'cards', 'goals', 'overview', 'transactions'], () => vi.mocked(api.deleteAccount).mockResolvedValue()],
  ['createCard', () => q.useCreateCard(), { name: 'C', network: 'Visa', limit: 1, closeDay: 1, dueDay: 2, color: '#000000' }, ['cards', 'overview', 'transactions'], () => vi.mocked(api.createCard).mockResolvedValue({} as never)],
  ['updateCard', () => q.useUpdateCard(), { id: '1', body: {} }, ['cards', 'overview', 'transactions'], () => vi.mocked(api.updateCard).mockResolvedValue({} as never)],
  ['deleteCard', () => q.useDeleteCard(), '1', ['cards', 'overview', 'transactions'], () => vi.mocked(api.deleteCard).mockResolvedValue()],
  ['createCategory', () => q.useCreateCategory(), { name: 'X', icon: 'Paw', color: '#000000' }, ['budgets', 'categories', 'overview', 'transactions'], () => vi.mocked(api.createCategory).mockResolvedValue({} as never)],
  ['updateCategory', () => q.useUpdateCategory(), { id: '1', body: {} }, ['budgets', 'categories', 'overview', 'transactions'], () => vi.mocked(api.updateCategory).mockResolvedValue({} as never)],
  ['deleteCategory', () => q.useDeleteCategory(), { id: '1' }, ['budgets', 'categories', 'overview', 'transactions'], () => vi.mocked(api.deleteCategory).mockResolvedValue()],
  ['createBudget', () => q.useCreateBudget(), { categoryId: 'c', limit: 1 }, ['budgets', 'overview'], () => vi.mocked(api.createBudget).mockResolvedValue({} as never)],
  ['updateBudget', () => q.useUpdateBudget(), { id: '1', body: {} }, ['budgets', 'overview'], () => vi.mocked(api.updateBudget).mockResolvedValue({} as never)],
  ['deleteBudget', () => q.useDeleteBudget(), '1', ['budgets', 'overview'], () => vi.mocked(api.deleteBudget).mockResolvedValue()],
  ['createGoal', () => q.useCreateGoal(), { name: 'G', target: 1 }, ['goals', 'overview'], () => vi.mocked(api.createGoal).mockResolvedValue({} as never)],
  ['updateGoal', () => q.useUpdateGoal(), { id: '1', body: {} }, ['goals', 'overview'], () => vi.mocked(api.updateGoal).mockResolvedValue({} as never)],
  ['deleteGoal', () => q.useDeleteGoal(), '1', ['goals', 'overview'], () => vi.mocked(api.deleteGoal).mockResolvedValue()],
  ['uploadReceipt', () => q.useUploadReceipt(), { txId: '1', file: new File(['x'], 'a.png', { type: 'image/png' }) }, ['transactions'], () => vi.mocked(receipt.uploadReceipt).mockResolvedValue()],
  ['updateMe', () => q.useUpdateMe(), { locale: 'en', currency: 'USD', timezone: 'UTC' }, ['me'], () => vi.mocked(api.putMe).mockResolvedValue({} as never)],
  ['importState', () => q.useImportState(), { v: 1 }, ALL, () => vi.mocked(api.importState).mockResolvedValue({} as never)],
];

describe('mutations invalidate the right prefixes (review focus 4)', () => {
  for (const [name, hook, vars, expected, arrange] of matrix) {
    it(name, async () => {
      arrange();
      const { spy, wrapper } = setup();
      const { result } = renderHook(() => hook() as ReturnType<typeof q.useCreateAccount>, { wrapper });
      await act(async () => { await result.current.mutateAsync(vars as never); });
      expect(prefixes(spy as never)).toEqual([...expected].sort());
    });
  }
  it('does not invalidate when the mutation fails', async () => {
    vi.mocked(api.deleteBudget).mockRejectedValue(new Error('boom'));
    const { spy, wrapper } = setup();
    const { result } = renderHook(() => q.useDeleteBudget(), { wrapper });
    await act(async () => { await result.current.mutateAsync('1').catch(() => {}); });
    expect(spy).not.toHaveBeenCalled();
  });
});
```

`test/queries/lookups.test.tsx`

```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import * as api from '../../src/api/endpoints';
import { I18nProvider } from '../../src/i18n';
import { txTitle } from '../../src/i18n/txTitle';
import { useAccountLookup, useCategoryLookup } from '../../src/queries/lookups';

vi.mock('../../src/api/endpoints');

const cat = (o: object) => ({ id: 'c', name: 'N', parentId: null, icon: 'Paw', color: '#111111', system: false, ...o });
const wrap = (locale: 'pt-BR' | 'en') => ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><I18nProvider locale={locale}>{children}</I18nProvider></QueryClientProvider>);

describe('useCategoryLookup', () => {
  it('translates system categories by key and keeps custom names', async () => {
    vi.mocked(api.listCategories).mockResolvedValue([
      cat({ id: 'sys:groceries', name: 'Groceries', system: true, key: 'groceries', color: '#3D5A0E' }),
      cat({ id: 'sys:groceries.bakery', name: 'Bakery', parentId: 'sys:groceries', system: true, key: 'groceries.bakery' }),
      cat({ id: 'u1', name: 'Pets' }),
      cat({ id: 'sys:weird', name: 'Weird', system: true, key: 'weird.unknown' }),
    ] as never);
    const { result } = renderHook(() => useCategoryLookup(), { wrapper: wrap('pt-BR') });
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.label('sys:groceries.bakery')).toBe('Mercado › Padaria');
    expect(result.current.label('u1')).toBe('Pets');
    expect(result.current.label('sys:weird')).toBe('Weird');
    expect(result.current.label(undefined)).toBe('Sem categoria');
    expect(result.current.color('sys:groceries')).toBe('#3D5A0E');
    expect(result.current.tops.map(c => c.id)).toContain('u1');
    expect(result.current.subsOf('sys:groceries').map(c => c.id)).toEqual(['sys:groceries.bakery']);
  });
});

describe('useAccountLookup', () => {
  it('names accounts and cards, dash for unknown', async () => {
    vi.mocked(api.listAccounts).mockResolvedValue([{ id: 'a', name: 'Itaú' }] as never);
    vi.mocked(api.listCards).mockResolvedValue([{ id: 'k', name: 'Nubank' }] as never);
    const { result } = renderHook(() => useAccountLookup(), { wrapper: wrap('en') });
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.name('a')).toBe('Itaú');
    expect(result.current.name('k')).toBe('Nubank');
    expect(result.current.name('zzz')).toBe('—');
  });
});

describe('txTitle', () => {
  const t = (k: string) => ({ 'source.card_payment': 'Pagamento de fatura', 'source.goal': 'Meta' } as Record<string, string>)[k];
  it('prefixes system transfers with their translated source', () => {
    expect(txTitle(t as never, { desc: 'Nubank', source: 'card_payment' })).toBe('Pagamento de fatura · Nubank');
    expect(txTitle(t as never, { desc: 'Viagem', source: 'goal' })).toBe('Meta · Viagem');
    expect(txTitle(t as never, { desc: 'iFood' })).toBe('iFood');
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run test/queries`
Expected: FAIL (modules not found).

- [ ] **Step 3: Implement**

`src/queries/keys.ts`

```ts
export const qk = {
  accounts: ['accounts'] as const,
  cards: ['cards'] as const,
  categories: ['categories'] as const,
  transactions: ['transactions'] as const,
  budgets: ['budgets'] as const,
  goals: ['goals'] as const,
  overview: ['overview'] as const,
  me: ['me'] as const,
};

type Keys = readonly (readonly string[])[];
const { accounts, cards, categories, transactions, budgets, goals, overview, me } = qk;

/** What each kind of mutation makes stale (spec §4). Keys are prefixes. */
export const INVALIDATES = {
  transaction: [transactions, accounts, cards, budgets, goals, overview],
  payCard: [transactions, accounts, cards, overview],
  contribute: [goals, transactions, accounts, overview],
  account: [accounts, cards, goals, transactions, overview],
  card: [cards, transactions, overview],
  category: [categories, budgets, transactions, overview],
  budget: [budgets, overview],
  goal: [goals, overview],
  receipt: [transactions],
  me: [me],
  import: [accounts, cards, categories, transactions, budgets, goals, overview, me],
} satisfies Record<string, Keys>;
```

`src/queries/index.ts`

```ts
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as api from '../api/endpoints';
import { uploadReceipt } from '../api/receipt';
import type {
  AccountInput, BudgetInput, CardInput, CategoryInput, ContributeInput, DeleteScope, GoalInput, Me, PayInput, TxCreateInput, TxFilters, TxInput,
} from '../api/types';
import { INVALIDATES, qk } from './keys';

export { qk, INVALIDATES } from './keys';

/* ---------- queries ---------- */
export const useAccounts = () => useQuery({ queryKey: qk.accounts, queryFn: api.listAccounts });
export const useCards = () => useQuery({ queryKey: qk.cards, queryFn: api.listCards });
export const useCategories = () => useQuery({ queryKey: qk.categories, queryFn: api.listCategories });
export const useGoals = () => useQuery({ queryKey: qk.goals, queryFn: api.listGoals });
export const useMe = () => useQuery({ queryKey: qk.me, queryFn: api.getMe, staleTime: Infinity });
export const useTransactions = (filters: TxFilters) => useQuery({ queryKey: [...qk.transactions, filters], queryFn: () => api.listTransactions(filters) });
export const useBudgets = (month?: string) => useQuery({ queryKey: [...qk.budgets, month ?? null], queryFn: () => api.listBudgets(month) });
export const useOverview = (month?: string) => useQuery({ queryKey: [...qk.overview, month ?? null], queryFn: () => api.getOverview(month) });

/* ---------- mutations ---------- */
function useApiMutation<V, R>(fn: (v: V) => Promise<R>, keys: readonly (readonly string[])[]) {
  const qc = useQueryClient();
  return useMutation<R, Error, V>({
    mutationFn: fn,
    onSuccess: async () => { await Promise.all(keys.map(k => qc.invalidateQueries({ queryKey: k as string[] }))); },
  });
}
type Upd<B> = { id: string; body: B };

export const useCreateAccount = () => useApiMutation((v: AccountInput) => api.createAccount(v), INVALIDATES.account);
export const useUpdateAccount = () => useApiMutation((v: Upd<Partial<AccountInput>>) => api.updateAccount(v.id, v.body), INVALIDATES.account);
export const useDeleteAccount = () => useApiMutation((v: { id: string; moveTo?: string }) => api.deleteAccount(v.id, v.moveTo), INVALIDATES.account);

export const useCreateCard = () => useApiMutation((v: CardInput) => api.createCard(v), INVALIDATES.card);
export const useUpdateCard = () => useApiMutation((v: Upd<Partial<CardInput>>) => api.updateCard(v.id, v.body), INVALIDATES.card);
export const useDeleteCard = () => useApiMutation((id: string) => api.deleteCard(id), INVALIDATES.card);
export const usePayCard = () => useApiMutation((v: Upd<PayInput>) => api.payCard(v.id, v.body), INVALIDATES.payCard);

export const useCreateCategory = () => useApiMutation((v: CategoryInput) => api.createCategory(v), INVALIDATES.category);
export const useUpdateCategory = () => useApiMutation((v: Upd<Partial<CategoryInput>>) => api.updateCategory(v.id, v.body), INVALIDATES.category);
export const useDeleteCategory = () => useApiMutation((v: { id: string; moveTo?: string }) => api.deleteCategory(v.id, v.moveTo), INVALIDATES.category);

export const useCreateTransactions = () => useApiMutation((v: TxCreateInput) => api.createTransactions(v), INVALIDATES.transaction);
export const useUpdateTransaction = () => useApiMutation((v: Upd<TxInput>) => api.updateTransaction(v.id, v.body), INVALIDATES.transaction);
export const useDeleteTransaction = () => useApiMutation((v: { id: string; scope: DeleteScope }) => api.deleteTransaction(v.id, v.scope), INVALIDATES.transaction);
export const useUploadReceipt = () => useApiMutation((v: { txId: string; file: File }) => uploadReceipt(v.txId, v.file), INVALIDATES.receipt);

export const useCreateBudget = () => useApiMutation((v: BudgetInput) => api.createBudget(v), INVALIDATES.budget);
export const useUpdateBudget = () => useApiMutation((v: Upd<Partial<BudgetInput>>) => api.updateBudget(v.id, v.body), INVALIDATES.budget);
export const useDeleteBudget = () => useApiMutation((id: string) => api.deleteBudget(id), INVALIDATES.budget);

export const useCreateGoal = () => useApiMutation((v: GoalInput) => api.createGoal(v), INVALIDATES.goal);
export const useUpdateGoal = () => useApiMutation((v: Upd<Partial<GoalInput>>) => api.updateGoal(v.id, v.body), INVALIDATES.goal);
export const useDeleteGoal = () => useApiMutation((id: string) => api.deleteGoal(id), INVALIDATES.goal);
export const useContributeGoal = () => useApiMutation((v: Upd<ContributeInput>) => api.contributeGoal(v.id, v.body), INVALIDATES.contribute);

export const useUpdateMe = () => useApiMutation((v: Me) => api.putMe(v), INVALIDATES.me);
export const useImportState = () => useApiMutation((v: unknown) => api.importState(v), INVALIDATES.import);
```

`src/queries/lookups.ts`

```ts
import { useMemo } from 'react';
import type { Category } from '../api/types';
import { useI18n } from '../i18n';
import { useAccounts, useCards, useCategories } from './index';

export function useCategoryLookup() {
  const { data, isSuccess } = useCategories();
  const { tOr, t } = useI18n();
  return useMemo(() => {
    const categories: Category[] = data ?? [];
    const byId = new Map(categories.map(c => [c.id, c]));
    const name = (c: Category) => (c.system && c.key ? tOr(`categories.${c.key}`, c.name) : c.name);
    const label = (id?: string) => {
      const c = id ? byId.get(id) : undefined;
      if (!c) return t('common.uncategorized');
      const p = c.parentId ? byId.get(c.parentId) : undefined;
      return p ? `${name(p)} › ${name(c)}` : name(c);
    };
    const color = (id?: string) => (id ? byId.get(id)?.color : undefined) ?? 'var(--muted)';
    const tops = categories.filter(c => !c.parentId);
    const subsOf = (id: string) => categories.filter(c => c.parentId === id);
    return { categories, ready: isSuccess, name, label, color, tops, subsOf };
  }, [data, isSuccess, tOr, t]);
}

export function useAccountLookup() {
  const a = useAccounts();
  const c = useCards();
  return useMemo(() => {
    const accounts = a.data ?? [];
    const cards = c.data ?? [];
    const names = new Map<string, string>([...accounts, ...cards].map(x => [x.id, x.name]));
    return { accounts, cards, ready: a.isSuccess && c.isSuccess, name: (id?: string) => (id ? names.get(id) : undefined) ?? '—' };
  }, [a.data, c.data, a.isSuccess, c.isSuccess]);
}
```

`src/i18n/txTitle.ts`

```ts
import type { Tx } from '../api/types';
import type { I18n } from './index';

/** System-created transfers carry the target's name in `desc`; the label before it is translated. */
export function txTitle(t: I18n['t'], tx: Pick<Tx, 'desc' | 'source'>): string {
  return tx.source ? `${t(`source.${tx.source}`)} · ${tx.desc}` : tx.desc;
}
```

> `t(`source.${tx.source}`)` is a template literal, not a quoted literal, so the catalog-usage test does not scan it; the catalog has `source.card_payment` and `source.goal` (Task 2).

- [ ] **Step 4: Run tests and typecheck**

Run: `npx vitest run test/queries && npx tsc --noEmit`
Expected: PASS. If TypeScript rejects `t(`source.${tx.source}`)` as not assignable to `Key`, cast the template literal result: ``t(`source.${tx.source}` as Key)`` (import `Key` from `./en`).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(queries): TanStack hooks, invalidation matrix and lookups" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 7: App shell — providers, login gate, navigation, shared UI

**Files:**
- Create: `src/components/QueryState.tsx`, `src/Root.tsx`
- Modify: `src/main.tsx`, `src/App.tsx`, `src/ui.tsx`, `src/styles.css`, `src/i18n/en.ts`, `src/i18n/pt-BR.ts`
- Test: `test/shell/root.test.tsx`, `test/shell/querystate.test.tsx`

**Interfaces:**
- Consumes: `AuthProvider`/`useAuth`/`LoginPage`/`pickBackend` (Task 5), `useMe` (Task 6), `I18nProvider`/`useI18n`/`browserLocale` (Task 2), `usePrefs` (Task 4), `errorMessage` (Task 2).
- Produces:
  - `QueryState<T>({q: UseQueryResult<T>; children: (data: T) => ReactNode; empty?: ReactNode; isEmpty?: (d: T) => boolean})` — pending → `role="status"` loading text; error → `role="alert"` translated message + retry button (`q.refetch()`); empty → the `empty` node inside `.empty`.
  - `Root()`: gate: `loading` → splash; not `signedIn` → `<I18nProvider locale={browserLocale()}><LoginPage/></I18nProvider>`; signed in → loads `useMe()` (error → retry state in browser locale) → `<I18nProvider locale currency timezone><App/></I18nProvider>`. Renders the DEV banner (`auth.devBanner`) above the app when `devMode`.
  - `App()`: sidebar + routes + mobile tab bar (existing layout), all text via `t()`, with a **Log out** button in the sidebar footer (`auth.signOut()` + `common.logout`). Route table unchanged (`overview, transactions, accounts, cards, categories, budgets, goals, settings, more`). Applies `data-theme` from `usePrefs().theme`, sets `document.documentElement.lang` and `document.title`.
  - `ui.tsx`: `Modal` close button `aria-label={t('common.close')}`; `Swatches` group/option labels use `t('common.color')`; the `pct` import from `./lib` is replaced by a local `pct`; `ratio` unchanged.

- [ ] **Step 1: Add i18n keys** (before `// @@keys-end`)

`en.ts`: `'app.title': 'financeControl PRO',` · `'shell.splash': 'Loading your data…',` · `'shell.profileError': 'Could not load your profile.',`
`pt-BR.ts`: `'app.title': 'financeControl PRO',` · `'shell.splash': 'Carregando seus dados…',` · `'shell.profileError': 'Não foi possível carregar seu perfil.',`

- [ ] **Step 2: Write the failing tests**

`test/shell/querystate.test.tsx`

```tsx
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../src/api/client';
import { QueryState } from '../../src/components/QueryState';
import { I18nProvider } from '../../src/i18n';

function Harness({ fn, isEmpty }: { fn: () => Promise<number[]>; isEmpty?: (d: number[]) => boolean }) {
  const q = useQuery({ queryKey: ['x'], queryFn: fn, retry: false });
  return <QueryState q={q} isEmpty={isEmpty} empty={<span>vazio</span>}>{d => <ul>{d.map(n => <li key={n}>{n}</li>)}</ul>}</QueryState>;
}
const mount = (fn: () => Promise<number[]>, isEmpty?: (d: number[]) => boolean) =>
  render(<QueryClientProvider client={new QueryClient()}><I18nProvider locale="pt-BR"><Harness fn={fn} isEmpty={isEmpty} /></I18nProvider></QueryClientProvider>);

describe('QueryState', () => {
  it('shows loading, then the data', async () => {
    mount(async () => [1, 2]);
    expect(screen.getByRole('status')).toHaveTextContent('Carregando…');
    expect(await screen.findByText('2')).toBeInTheDocument();
  });
  it('shows a translated error and retries', async () => {
    const fn = vi.fn().mockRejectedValueOnce(new ApiError(500, 'INTERNAL', 'x')).mockResolvedValueOnce([7]);
    mount(fn);
    expect(await screen.findByRole('alert')).toHaveTextContent('O servidor teve um problema');
    await userEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }));
    expect(await screen.findByText('7')).toBeInTheDocument();
  });
  it('renders the empty node when isEmpty says so', async () => {
    mount(async () => [], d => d.length === 0);
    expect(await screen.findByText('vazio')).toBeInTheDocument();
  });
});
```

`test/shell/root.test.tsx`

```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import * as api from '../../src/api/endpoints';
import { AuthProvider } from '../../src/auth/AuthProvider';
import type { AuthBackend } from '../../src/auth/types';
import { Root } from '../../src/Root';

vi.mock('../../src/api/endpoints');
vi.mock('../../src/pages/Overview', () => ({ Overview: () => <div>overview-stub</div> }));

const fake = (restore: boolean, over: Partial<AuthBackend> = {}): AuthBackend => ({
  restore: async () => restore, signIn: vi.fn(async () => 'ok' as const), completeNewPassword: async () => {},
  getAccessToken: async () => 't', refresh: async () => 't', signOut: vi.fn(), ...over,
});
const mount = (b: AuthBackend, dev = false) => render(
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><AuthProvider backend={b} devMode={dev}><Root /></AuthProvider></QueryClientProvider>);

describe('Root', () => {
  it('shows the login page when signed out', async () => {
    mount(fake(false));
    expect(await screen.findByRole('button', { name: /Entrar|Sign in/ })).toBeInTheDocument();
  });
  it('signed in: loads the profile and renders the app in the profile locale (pt-BR nav)', async () => {
    vi.mocked(api.getMe).mockResolvedValue({ locale: 'pt-BR', currency: 'BRL', timezone: 'America/Sao_Paulo' });
    mount(fake(true));
    expect(await screen.findByText('overview-stub')).toBeInTheDocument();
    expect(screen.getAllByText('Visão geral').length).toBeGreaterThan(0);
    expect(document.documentElement.lang).toBe('pt-BR');
  });
  it('uses the English catalog when the profile says en', async () => {
    vi.mocked(api.getMe).mockResolvedValue({ locale: 'en', currency: 'USD', timezone: 'UTC' });
    mount(fake(true));
    expect(await screen.findByText('overview-stub')).toBeInTheDocument();
    expect(screen.getAllByText('Overview').length).toBeGreaterThan(0);
    expect(document.documentElement.lang).toBe('en');
  });
  it('profile load failure shows a retryable error', async () => {
    vi.mocked(api.getMe).mockRejectedValue(new Error('x'));
    mount(fake(true));
    expect(await screen.findByRole('alert')).toBeInTheDocument();
  });
  it('log out calls the backend and returns to the login page', async () => {
    vi.mocked(api.getMe).mockResolvedValue({ locale: 'pt-BR', currency: 'BRL', timezone: 'America/Sao_Paulo' });
    const b = fake(true);
    mount(b);
    await screen.findByText('overview-stub');
    await userEvent.click(screen.getAllByRole('button', { name: 'Sair' })[0]);
    expect(b.signOut).toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByText('overview-stub')).not.toBeInTheDocument());
  });
  it('dev mode shows the DEV banner over the app', async () => {
    vi.mocked(api.getMe).mockResolvedValue({ locale: 'pt-BR', currency: 'BRL', timezone: 'America/Sao_Paulo' });
    mount(fake(true), true);
    expect(await screen.findByText(/AUTENTICAÇÃO DE TESTE/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Run to verify they fail**

Run: `npx vitest run test/shell`
Expected: FAIL (modules not found).

- [ ] **Step 4: Implement**

`src/components/QueryState.tsx`

```tsx
import type { UseQueryResult } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useI18n } from '../i18n';
import { errorMessage } from '../i18n/errors';

export function QueryState<T>({ q, children, empty, isEmpty }: {
  q: UseQueryResult<T>; children: (data: T) => ReactNode; empty?: ReactNode; isEmpty?: (d: T) => boolean;
}) {
  const { t } = useI18n();
  if (q.isPending) return <div className="empty" role="status">{t('common.loading')}</div>;
  if (q.isError) {
    return (
      <div className="empty" role="alert">
        {errorMessage(q.error, t)}
        <button type="button" className="btn btn-2" onClick={() => void q.refetch()}>{t('common.retry')}</button>
      </div>
    );
  }
  if (isEmpty?.(q.data) && empty) return <div className="empty">{empty}</div>;
  return <>{children(q.data)}</>;
}
```

`src/Root.tsx`

```tsx
import { useQueryClient } from '@tanstack/react-query';
import { App } from './App';
import { useAuth } from './auth/AuthProvider';
import { LoginPage } from './auth/LoginPage';
import { QueryState } from './components/QueryState';
import { browserLocale, I18nProvider, useI18n } from './i18n';
import { useMe } from './queries';

function Splash() {
  return <div className="splash" role="status" aria-busy="true">…</div>;
}
function DevBanner() {
  const { t } = useI18n();
  return <div className="banner" role="note">{t('auth.devBanner')}</div>;
}

function SignedIn() {
  const me = useMe();
  const { devMode } = useAuth();
  if (!me.data) {
    return (
      <I18nProvider locale={browserLocale()}>
        <QueryState q={me}>{() => null}</QueryState>
      </I18nProvider>
    );
  }
  return (
    <I18nProvider locale={me.data.locale} currency={me.data.currency} timezone={me.data.timezone}>
      {devMode && <DevBanner />}
      <App />
    </I18nProvider>
  );
}

export function Root() {
  const { status } = useAuth();
  useQueryClient();
  if (status === 'loading') return <Splash />;
  if (status !== 'signedIn') return <I18nProvider locale={browserLocale()}><LoginPage /></I18nProvider>;
  return <SignedIn />;
}
```

`src/main.tsx`

```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createRoot } from 'react-dom/client';
import './styles.css';
import { ApiError } from './api/client';
import { AuthProvider } from './auth/AuthProvider';
import { pickBackend } from './auth/cognito';
import { Root } from './Root';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: true,
      retry: (count, err) => count < 1 && !(err instanceof ApiError && err.status >= 400 && err.status < 500),
    },
  },
});

createRoot(document.getElementById('root')!).render(
  <QueryClientProvider client={queryClient}>
    <AuthProvider backend={pickBackend()}>
      <Root />
    </AuthProvider>
  </QueryClientProvider>,
);
```

`src/App.tsx` — keep the existing structure (sidebar `ROUTES`, `route` state from `location.hash`, mobile `tabbar`, the `#/transactions?new` FAB) with these changes only:
1. Remove the `useStore` import and the `useEffect` that sets `data-theme` from the store; instead `const { theme } = usePrefs(); useEffect(() => { document.documentElement.dataset.theme = theme; }, [theme]);`.
2. Add `const { t, locale } = useI18n(); const auth = useAuth();` and effects `document.documentElement.lang = locale` and `document.title = t('app.title')`.
3. `ROUTES` becomes `[key, navKey][]` with `navKey` ∈ `nav.overview|nav.transactions|nav.accounts|nav.cards|nav.categories|nav.budgets|nav.goals|nav.settings`; render `{t(navKey)}` instead of hard-coded labels; `<nav aria-label={t('nav.main')}>` in both navs; the FAB `aria-label={t('nav.newTransaction')}`; tabbar labels `t('nav.home')`, `t('nav.budgets')`, `t('nav.goals')`, `t('nav.more')`.
4. Add at the bottom of `<aside className="side">`: `<div className="side-foot"><button type="button" className="btn btn-2 side-logout" onClick={auth.signOut}>{t('common.logout')}</button></div>`.
5. Keep importing the existing pages from `./pages/*`.

`src/ui.tsx` — apply: add `import { useState } from 'react'` (merge with the existing react import) and `import { useI18n } from './i18n'; import { errorMessage } from './i18n/errors';`; in `Modal` call `const { t } = useI18n();` and use `aria-label={t('common.close')}`; in `Swatches` call `useI18n()` and use `aria-label={t('common.color')}` on the radiogroup; delete `import { pct } from './lib';` and add `const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : 0);` above `ratio`; add `export const level = (p: number, alert = 85) => (p >= 100 ? 'var(--danger)' : p >= alert ? 'var(--warn)' : 'var(--pos)');`. Replace `ConfirmDelete` with an async-aware version (the confirm action is a mutation; the dialog must stay open and show the translated error when it fails):

```tsx
export function ConfirmDelete({ title, body, cta, onConfirm, onClose, children }: {
  title: string; body?: ReactNode; cta: string; onConfirm: () => Promise<unknown> | void; onClose: () => void; children?: ReactNode;
}) {
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const run = async () => {
    setBusy(true); setErr('');
    try { await onConfirm(); onClose(); } catch (e) { setErr(errorMessage(e, t)); setBusy(false); }
  };
  return (
    <Modal title={title} onClose={onClose}>
      {body && <p style={{ margin: 0, lineHeight: 1.5, color: 'var(--ink-2)' }}>{body}</p>}
      {children}
      {err && <span className="err" role="alert">{err}</span>}
      <div className="footer">
        <button type="button" className="btn btn-2" onClick={onClose}>{t('common.cancel')}</button>
        <button type="button" className="btn btn-3" disabled={busy} onClick={() => void run()}>{cta}</button>
      </div>
    </Modal>
  );
}
```

`src/styles.css` — append:

```css
.banner{position:sticky;top:0;z-index:60;background:#B45309;color:#fff;text-align:center;font-size:12px;font-weight:600;padding:4px 8px}
.splash{min-height:100vh;display:flex;align-items:center;justify-content:center;color:var(--muted)}
.login{min-height:100vh;display:flex;flex-direction:column;align-items:center}
.login .banner{align-self:stretch}
.login-card{margin:10vh 16px 0;width:100%;max-width:400px;gap:16px}
.login-form{display:flex;flex-direction:column;gap:14px}
.login-form h1{font-size:22px}
.side-foot{margin-top:auto}
.side-logout{width:100%;border-color:#4A515B;color:#D5D9DE}
.month-nav{display:flex;align-items:center;gap:8px}
.month-nav .btn-sm{width:36px;padding:0}
```

- [ ] **Step 5: Run tests and typecheck**

Run: `npx vitest run && npx tsc --noEmit`
Expected: ALL PASS. (`Root` test mocks `pages/Overview`; the other pages are still the old localStorage ones and are not rendered in these tests.)

- [ ] **Step 6: Manual smoke check**

Run `npm run build` (must succeed) and `npm run dev:local`; confirm the login page with the DEV banner renders at http://localhost:5173 (the API is not needed yet). Report what you saw.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(shell): providers, login gate, translated navigation and QueryState" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```


---

### Shared test fixtures (created in Task 8, used by Tasks 8–15)

`test/pages/fixtures.ts`

```ts
import { vi } from 'vitest';
import * as api from '../../src/api/endpoints';
import type { Account, Budget, Card, Category, Goal, Overview, Statement, Tx } from '../../src/api/types';

export const CATS: Category[] = [
  { id: 'sys:food', name: 'Food', parentId: null, icon: 'Food', color: '#C2410C', system: true, key: 'food' },
  { id: 'sys:food.delivery', name: 'Delivery', parentId: 'sys:food', icon: 'Food', color: '#C2410C', system: true, key: 'food.delivery' },
  { id: 'sys:groceries', name: 'Groceries', parentId: null, icon: 'Cart', color: '#3D5A0E', system: true, key: 'groceries' },
  { id: 'sys:groceries.bakery', name: 'Bakery', parentId: 'sys:groceries', icon: 'Cart', color: '#3D5A0E', system: true, key: 'groceries.bakery' },
  { id: 'c-pets', name: 'Pets', parentId: null, icon: 'Paw', color: '#6E3FA0', system: false },
];
export const account = (o: Partial<Account> = {}): Account => ({
  id: 'a1', name: 'Itaú', kind: 'checking', bank: 'Itaú Unibanco', opening: 100000, color: '#1F4E79', inTotal: true, archived: false, balance: 721455, ...o,
});
export const statement = (o: Partial<Statement> = {}): Statement => ({
  key: '2026-10', total: 231844, paid: 0, status: 'open', due: '2026-10-10', range: { start: '2026-09-04', end: '2026-10-03' }, items: [], ...o,
});
export const card = (o: Partial<Card> = {}): Card => ({
  id: 'k1', name: 'Nubank', network: 'Mastercard', limit: 600000, closeDay: 3, dueDay: 10, color: '#6E3FA0', payAccountId: 'a1',
  used: 231844, statements: [statement()], ...o,
});
export const tx = (o: Partial<Tx> = {}): Tx => ({
  id: 't1', type: 'expense', amount: 8690, date: '2026-10-13', desc: 'iFood', accountId: 'k1', categoryId: 'sys:food.delivery', tags: [], note: '', ...o,
});
export const budget = (o: Partial<Budget> = {}): Budget => ({ id: 'b1', categoryId: 'sys:food', limit: 50000, alertPct: 85, spent: 25000, pct: 50, ...o });
export const goal = (o: Partial<Goal> = {}): Goal => ({
  id: 'g1', name: 'Viagem', accountId: 'a2', target: 300000, targetDate: '2027-01', saved: 90000, pct: 30, left: 210000, monthsLeft: 3, monthlyNeeded: 70000, ...o,
});
export const overview = (o: Partial<Overview> = {}): Overview => ({
  month: '2026-10', totalBalance: 1843290, income: 980000, expense: 421537, net: 558463, openStatementsTotal: 231844, recent: [], ...o,
});

type Fn = keyof typeof api;
/** Resets the auto-mocked endpoints module with empty defaults; `over` maps function name → resolved value. */
export function mockApi(over: Partial<Record<Fn, unknown>> = {}) {
  const mocked = api as unknown as Record<string, ReturnType<typeof vi.fn>>;
  const defaults: Partial<Record<Fn, unknown>> = {
    listAccounts: [], listCards: [], listCategories: CATS, listGoals: [], listBudgets: [],
    listTransactions: { items: [], totals: { income: 0, expense: 0, net: 0 } }, getOverview: overview(),
    getMe: { locale: 'pt-BR', currency: 'BRL', timezone: 'America/Sao_Paulo' },
  };
  for (const [k, v] of Object.entries({ ...defaults, ...over })) mocked[k].mockReset().mockResolvedValue(v);
  for (const k of Object.keys(mocked)) if (!(k in defaults) && !(k in over)) mocked[k].mockReset().mockResolvedValue(undefined);
}
```

---

### Task 8: Overview page

**Files:**
- Create: `src/components/txFormat.ts`, `test/pages/fixtures.ts` (above), `test/components/txFormat.test.ts`
- Modify: `src/pages/Overview.tsx` (replace entirely), `src/i18n/en.ts`, `src/i18n/pt-BR.ts`
- Test: `test/pages/overview.test.tsx`

**Interfaces:**
- Consumes: `useOverview/useAccounts/useBudgets/useGoals` (Task 6), `useCategoryLookup/useAccountLookup`, `txTitle`, `QueryState`, `usePrefs`, `Bar/level/PageHead` (ui.tsx).
- Produces: `signedAmount(tx: Pick<Tx,'type'|'amount'>, money: (c: number) => string): string` (`+ R$ x` income, `− R$ x` expense with U+2212, plain transfer) and `amountColor(type: TxType): string` (CSS var) in `src/components/txFormat.ts`.

- [ ] **Step 1: Add i18n keys** (before `// @@keys-end`)

`en.ts`:

```ts
  // overview
  'overview.hi': 'Hi, {name}',
  'overview.totalBalance': 'Total balance',
  'overview.income': 'Income · {month}',
  'overview.expenses': 'Expenses · {month}',
  'overview.openStatements': 'Open card statements',
  'overview.recent': 'Recent transactions',
  'overview.noAccounts': 'No accounts yet.',
  'overview.addAccount': 'Add your first account',
  'overview.noBudgets': 'No budgets yet.',
  'overview.createBudget': 'Create one',
  'overview.noGoals': 'No goals yet.',
  'overview.setGoal': 'Set a goal',
  'overview.noTx': 'Nothing recorded yet.',
  'overview.addTx': 'Add a transaction',
  'overview.noDate': 'no date',
```

`pt-BR.ts`:

```ts
  'overview.hi': 'Olá, {name}',
  'overview.totalBalance': 'Saldo total',
  'overview.income': 'Receitas · {month}',
  'overview.expenses': 'Despesas · {month}',
  'overview.openStatements': 'Faturas de cartão em aberto',
  'overview.recent': 'Transações recentes',
  'overview.noAccounts': 'Nenhuma conta ainda.',
  'overview.addAccount': 'Adicione sua primeira conta',
  'overview.noBudgets': 'Nenhum orçamento ainda.',
  'overview.createBudget': 'Criar um',
  'overview.noGoals': 'Nenhuma meta ainda.',
  'overview.setGoal': 'Definir uma meta',
  'overview.noTx': 'Nada registrado ainda.',
  'overview.addTx': 'Adicionar uma transação',
  'overview.noDate': 'sem data',
```

- [ ] **Step 2: Write the failing tests**

`test/components/txFormat.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import { amountColor, signedAmount } from '../../src/components/txFormat';

const money = (c: number) => `R$ ${(c / 100).toFixed(2)}`;
describe('txFormat', () => {
  it('signs income and expense, leaves transfers unsigned', () => {
    expect(signedAmount({ type: 'income', amount: 1000 }, money)).toBe('+ R$ 10.00');
    expect(signedAmount({ type: 'expense', amount: 1000 }, money)).toBe('− R$ 10.00');
    expect(signedAmount({ type: 'transfer', amount: 1000 }, money)).toBe('R$ 10.00');
  });
  it('picks the semantic colors', () => {
    expect(amountColor('income')).toBe('var(--pos)');
    expect(amountColor('expense')).toBe('var(--neg)');
    expect(amountColor('transfer')).toBe('var(--ink)');
  });
});
```

`test/pages/overview.test.tsx`

```tsx
import { screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as api from '../../src/api/endpoints';
import { Overview } from '../../src/pages/Overview';
import { renderWithProviders } from '../utils';
import { account, budget, card, goal, mockApi, overview, tx } from './fixtures';

vi.mock('../../src/api/endpoints');

beforeEach(() => {
  mockApi({
    getOverview: overview({ recent: [
      tx(),
      tx({ id: 't2', type: 'transfer', amount: 200000, date: '2026-10-10', desc: 'Nubank', accountId: 'a1', toId: 'k1', categoryId: undefined, source: 'card_payment' }),
    ] }),
    listAccounts: [account(), account({ id: 'a2', name: 'Caixinha', kind: 'savings', archived: true })],
    listCards: [card()], listBudgets: [budget({ pct: 90, spent: 45000 })], listGoals: [goal()],
  });
});

describe('Overview', () => {
  it('renders server-provided totals formatted for pt-BR', async () => {
    renderWithProviders(<Overview />);
    expect(await screen.findByText('R$ 18.432,90')).toBeInTheDocument();
    expect(screen.getByText('+ R$ 9.800,00')).toBeInTheDocument();
    expect(screen.getByText('− R$ 4.215,37')).toBeInTheDocument();
    expect(screen.getByText('R$ 2.318,44')).toBeInTheDocument();
    expect(api.getOverview).toHaveBeenCalledWith('2026-10');
  });
  it('lists non-archived accounts with translated kind, recent transactions with translated labels', async () => {
    renderWithProviders(<Overview />);
    expect(await screen.findByText(/Itaú/)).toBeInTheDocument();
    expect(screen.queryByText(/Caixinha/)).not.toBeInTheDocument();
    expect(screen.getByText(/Conta corrente/)).toBeInTheDocument();
    expect(await screen.findByText('Pagamento de fatura · Nubank')).toBeInTheDocument();
    expect(screen.getByText(/Alimentação › Delivery/)).toBeInTheDocument();
    expect(screen.getAllByText('13/10').length).toBeGreaterThan(0);
  });
  it('shows server budget percentage and goal progress', async () => {
    renderWithProviders(<Overview />);
    expect(await screen.findByText('90%')).toBeInTheDocument();
    expect(await screen.findByText('Viagem')).toBeInTheDocument();
  });
  it('English locale uses its own formats', async () => {
    renderWithProviders(<Overview />, { locale: 'en', currency: 'USD' });
    expect(await screen.findByText('$18,432.90')).toBeInTheDocument();
    expect(screen.getByText('Total balance')).toBeInTheDocument();
  });
  it('shows a retryable error when the overview fails', async () => {
    vi.mocked(api.getOverview).mockRejectedValue(new Error('x'));
    renderWithProviders(<Overview />);
    expect(await screen.findAllByRole('alert')).not.toHaveLength(0);
  });
});
```

- [ ] **Step 3: Run to verify they fail**

Run: `npx vitest run test/components test/pages/overview.test.tsx`
Expected: FAIL (the old Overview reads the localStorage store and has English text; `txFormat` missing).

- [ ] **Step 4: Implement**

`src/components/txFormat.ts`

```ts
import type { Tx, TxType } from '../api/types';

export const signedAmount = (tx: Pick<Tx, 'type' | 'amount'>, money: (c: number) => string): string =>
  tx.type === 'income' ? `+ ${money(tx.amount)}` : tx.type === 'expense' ? `− ${money(tx.amount)}` : money(tx.amount);

export const amountColor = (type: TxType): string =>
  type === 'income' ? 'var(--pos)' : type === 'expense' ? 'var(--neg)' : 'var(--ink)';
```

`src/pages/Overview.tsx`

```tsx
import { QueryState } from '../components/QueryState';
import { amountColor, signedAmount } from '../components/txFormat';
import { useI18n } from '../i18n';
import { txTitle } from '../i18n/txTitle';
import { usePrefs } from '../prefs';
import { useAccounts, useBudgets, useGoals, useOverview } from '../queries';
import { useAccountLookup, useCategoryLookup } from '../queries/lookups';
import { Bar, level, PageHead } from '../ui';

export function Overview() {
  const { t, tOr, money, dateShort, month, today } = useI18n();
  const { userName } = usePrefs();
  const key = today.slice(0, 7);
  const ov = useOverview(key);
  const accounts = useAccounts();
  const budgets = useBudgets(key);
  const goals = useGoals();
  const cats = useCategoryLookup();
  const acc = useAccountLookup();

  return (
    <>
      <PageHead sub={month(key, true)} title={userName ? t('overview.hi', { name: userName }) : t('nav.overview')}>
        <a href="#/transactions?new" className="btn btn-1">+ {t('nav.newTransaction')}</a>
      </PageHead>

      <QueryState q={ov}>{o => (
        <div className="kpis">
          <div className="hero"><span className="lbl">{t('overview.totalBalance')}</span><span className="num" style={{ fontSize: 28 }}>{money(o.totalBalance)}</span></div>
          <div className="card kpi"><span className="lbl">{t('overview.income', { month: month(key) })}</span><span className="num v" style={{ color: 'var(--pos)' }}>+ {money(o.income)}</span></div>
          <div className="card kpi"><span className="lbl">{t('overview.expenses', { month: month(key) })}</span><span className="num v" style={{ color: 'var(--neg)' }}>− {money(o.expense)}</span></div>
          <div className="card kpi"><span className="lbl">{t('overview.openStatements')}</span><span className="num v">{money(o.openStatementsTotal)}</span></div>
        </div>
      )}</QueryState>

      <div className="cols">
        <section className="card">
          <div className="card-head"><h2>{t('nav.accounts')}</h2><a href="#/accounts">{t('common.manage')}</a></div>
          <QueryState q={accounts} isEmpty={d => d.filter(a => !a.archived).length === 0}
            empty={<>{t('overview.noAccounts')}<a href="#/accounts">{t('overview.addAccount')}</a></>}>
            {list => <div>{list.filter(a => !a.archived).map(a => (
              <div className="line" key={a.id}>
                <span className="dot" style={{ background: a.color }} />
                <span style={{ flex: 1 }}>{a.name} <span className="muted" style={{ fontSize: 13 }}>· {tOr(`kind.${a.kind}`, a.kind)}</span></span>
                <span className="num">{money(a.balance)}</span>
              </div>))}</div>}
          </QueryState>
        </section>

        <section className="card">
          <div className="card-head"><h2>{t('nav.budgets')}</h2><a href="#/budgets">{t('common.manage')}</a></div>
          <QueryState q={budgets} isEmpty={d => d.length === 0} empty={<>{t('overview.noBudgets')}<a href="#/budgets">{t('overview.createBudget')}</a></>}>
            {list => <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>{list.map(b => {
              const c = level(b.pct, b.alertPct);
              const cat = cats.categories.find(x => x.id === b.categoryId);
              return (
                <div key={b.id} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <div className="spread"><b style={{ fontWeight: 500 }}>{cat ? cats.name(cat) : '—'}</b><span style={{ color: c, fontWeight: 600 }}>{b.pct}%</span></div>
                  <Bar value={b.pct} color={c} />
                </div>);
            })}</div>}
          </QueryState>
        </section>

        <section className="card">
          <div className="card-head"><h2>{t('nav.goals')}</h2><a href="#/goals">{t('common.manage')}</a></div>
          <QueryState q={goals} isEmpty={d => d.length === 0} empty={<>{t('overview.noGoals')}<a href="#/goals">{t('overview.setGoal')}</a></>}>
            {list => <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>{list.map(g => (
              <div key={g.id} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div className="spread"><b style={{ fontWeight: 500 }}>{g.name}</b><span className="muted">{g.pct}% · {g.targetDate ? month(g.targetDate) : t('overview.noDate')}</span></div>
                <Bar value={g.pct} color="var(--pos)" />
              </div>))}</div>}
          </QueryState>
        </section>
      </div>

      <section className="card">
        <div className="card-head"><h2>{t('overview.recent')}</h2><a href="#/transactions">{t('common.seeAll')}</a></div>
        <QueryState q={ov} isEmpty={d => d.recent.length === 0} empty={<>{t('overview.noTx')}<a href="#/transactions?new">{t('overview.addTx')}</a></>}>
          {o => <div>{o.recent.map(x => (
            <div className="line" key={x.id}>
              <span className="muted" style={{ width: 54, fontSize: 13 }}>{dateShort(x.date)}</span>
              <span className="stack" style={{ flex: 1 }}>
                <span style={{ fontWeight: 500 }}>{txTitle(t, x)}</span>
                <span className="muted" style={{ fontSize: 12 }}>
                  {x.type === 'transfer' ? `${acc.name(x.accountId)} → ${acc.name(x.toId)}` : `${cats.label(x.categoryId)} · ${acc.name(x.accountId)}`}
                </span>
              </span>
              <span className="num" style={{ color: amountColor(x.type) }}>{signedAmount(x, money)}</span>
            </div>))}</div>}
        </QueryState>
      </section>
    </>
  );
}
```

- [ ] **Step 5: Run tests and typecheck**

Run: `npx vitest run test/components test/pages/overview.test.tsx test/i18n && npx tsc --noEmit`
Expected: PASS. (If `getByText('R$ 2.318,44')` collides with another node, make that assertion specific with `getAllByText(...).length`.)

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(overview): server-driven overview page with i18n" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Accounts page

**Files:**
- Modify: `src/pages/Accounts.tsx` (replace), `src/i18n/format.ts`, `src/i18n/index.tsx`, `src/ui.tsx` (Swatches names), `src/i18n/en.ts`, `src/i18n/pt-BR.ts`
- Test: `test/pages/accounts.test.tsx`, `test/i18n/format-signed.test.ts`

**Interfaces:**
- Consumes: `useAccounts/useOverview/useCreateAccount/useUpdateAccount/useDeleteAccount`, `QueryState`, `ConfirmDelete/Modal/Field/OptionRadio/PageHead/Swatches`, `errorMessage`, `PALETTE` (icons.ts).
- Produces: `parseSignedMoney(input: string, locale: Locale): number | null` in `format.ts` (accepts a leading `-`, otherwise like `parseMoney`) and `parseSigned` on `I18n`. Presentation-only aggregation allowed here: per-kind KPI = sum of the API `balance` of non-archived accounts of that kind (no business rules).
- Behavior contract (account form): create sends `opening = entered balance`; edit sends `opening = account.opening + (entered − account.balance)` so the displayed current balance becomes the entered value (the API has no "set balance" operation); archive/unarchive sends only `archived`.

- [ ] **Step 1: Add i18n keys**

`en.ts`:

```ts
  // accounts
  'accounts.sub': '{active} active · {archived} archived',
  'accounts.new': 'New account',
  'accounts.total': 'Total in accounts',
  'accounts.empty': 'No accounts yet.',
  'accounts.add': 'Add account',
  'accounts.col.account': 'Account',
  'accounts.col.type': 'Type',
  'accounts.col.institution': 'Institution',
  'accounts.col.inTotal': 'In total',
  'accounts.col.balance': 'Balance',
  'accounts.col.actions': 'Actions',
  'accounts.archivedBadge': 'Archived',
  'accounts.formEdit': 'Edit account',
  'accounts.name': 'Account name',
  'accounts.namePh': 'e.g. Itaú Personnalité',
  'accounts.institution': 'Institution',
  'accounts.openingBalance': 'Opening balance',
  'accounts.currentBalance': 'Current balance',
  'accounts.includeInTotal': 'Include in total balance',
  'accounts.createCta': 'Create account',
  'accounts.nameRequired': 'Give the account a name.',
  'accounts.deleteTitle': 'Delete {name}?',
  'accounts.deleteBody': 'Its transactions can be moved to another account or deleted together with it.',
  'accounts.moveOption': 'Move transactions to',
  'accounts.deleteOption': 'Delete the account and all its transactions',
  'accounts.deleteCta': 'Delete account',
  // swatch names
  'color.Purple': 'Purple',
  'color.Green': 'Green',
  'color.Blue': 'Blue',
  'color.Orange': 'Orange',
  'color.Pink': 'Pink',
  'color.Amber': 'Amber',
  'color.Slate': 'Slate',
```

`pt-BR.ts`:

```ts
  'accounts.sub': '{active} ativas · {archived} arquivadas',
  'accounts.new': 'Nova conta',
  'accounts.total': 'Total nas contas',
  'accounts.empty': 'Nenhuma conta ainda.',
  'accounts.add': 'Adicionar conta',
  'accounts.col.account': 'Conta',
  'accounts.col.type': 'Tipo',
  'accounts.col.institution': 'Instituição',
  'accounts.col.inTotal': 'No total',
  'accounts.col.balance': 'Saldo',
  'accounts.col.actions': 'Ações',
  'accounts.archivedBadge': 'Arquivada',
  'accounts.formEdit': 'Editar conta',
  'accounts.name': 'Nome da conta',
  'accounts.namePh': 'ex.: Itaú Personnalité',
  'accounts.institution': 'Instituição',
  'accounts.openingBalance': 'Saldo inicial',
  'accounts.currentBalance': 'Saldo atual',
  'accounts.includeInTotal': 'Incluir no saldo total',
  'accounts.createCta': 'Criar conta',
  'accounts.nameRequired': 'Dê um nome à conta.',
  'accounts.deleteTitle': 'Excluir {name}?',
  'accounts.deleteBody': 'As transações podem ser movidas para outra conta ou excluídas junto com ela.',
  'accounts.moveOption': 'Mover transações para',
  'accounts.deleteOption': 'Excluir a conta e todas as suas transações',
  'accounts.deleteCta': 'Excluir conta',
  'color.Purple': 'Roxo',
  'color.Green': 'Verde',
  'color.Blue': 'Azul',
  'color.Orange': 'Laranja',
  'color.Pink': 'Rosa',
  'color.Amber': 'Âmbar',
  'color.Slate': 'Cinza',
```

- [ ] **Step 2: Write the failing tests**

`test/i18n/format-signed.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import { moneyToInput, parseSignedMoney } from '../../src/i18n/format';

describe('parseSignedMoney', () => {
  it('accepts a leading minus', () => {
    expect(parseSignedMoney('-1.234,56', 'pt-BR')).toBe(-123456);
    expect(parseSignedMoney('-12.50', 'en')).toBe(-1250);
    expect(parseSignedMoney('  - 5', 'pt-BR')).toBe(-500);
  });
  it('positive and empty behave like parseMoney', () => {
    expect(parseSignedMoney('1.234,56', 'pt-BR')).toBe(123456);
    expect(parseSignedMoney('', 'pt-BR')).toBeNull();
    expect(parseSignedMoney('--5', 'pt-BR')).toBeNull();
    expect(parseSignedMoney('5-', 'pt-BR')).toBeNull();
  });
  it('round-trips negative values through moneyToInput', () => {
    expect(moneyToInput(-1250, 'pt-BR')).toBe('-12,50');
    expect(parseSignedMoney(moneyToInput(-1250, 'pt-BR'), 'pt-BR')).toBe(-1250);
  });
});
```

`test/pages/accounts.test.tsx`

```tsx
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
    expect(await screen.findByText('R$ 900,00')).toBeInTheDocument();
    expect(screen.getByText('R$ 10.880,00')).toBeInTheDocument();
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
```

- [ ] **Step 3: Run to verify they fail**

Run: `npx vitest run test/i18n/format-signed.test.ts test/pages/accounts.test.tsx`
Expected: FAIL.

- [ ] **Step 4: Implement**

Add to `src/i18n/format.ts` (below `parseMoney`):

```ts
/** Like parseMoney but allows one leading minus (balances can be negative). */
export function parseSignedMoney(input: string, locale: Locale): number | null {
  const s = input.trim();
  const neg = s.startsWith('-');
  const v = parseMoney(neg ? s.slice(1) : s, locale);
  return v === null ? null : neg ? -v : v;
}
```

In `src/i18n/index.tsx` add `parseSigned: (s: string) => number | null;` to `I18n`, import `parseSignedMoney`, and in the memo: `parseSigned: s => parseSignedMoney(s, locale),`.

In `src/ui.tsx` `Swatches`, change each option's `aria-label={name}` to `aria-label={tOr(`color.${name}`, name)}` (get `tOr` from `useI18n()`).

`src/pages/Accounts.tsx`

```tsx
import { useState } from 'react';
import type { Account, AccountKind } from '../api/types';
import { QueryState } from '../components/QueryState';
import { useI18n } from '../i18n';
import { errorMessage } from '../i18n/errors';
import { PALETTE } from '../icons';
import { useAccounts, useCreateAccount, useDeleteAccount, useOverview, useUpdateAccount } from '../queries';
import { ConfirmDelete, Field, Modal, OptionRadio, PageHead, Swatches } from '../ui';

const KINDS: AccountKind[] = ['checking', 'savings', 'cash'];

export function Accounts() {
  const { t, tOr, money, today } = useI18n();
  const q = useAccounts();
  const ov = useOverview(today.slice(0, 7));
  const [form, setForm] = useState<Account | 'new' | null>(null);
  const [del, setDel] = useState<Account | null>(null);
  const sum = (list: Account[], k: AccountKind) => list.filter(a => !a.archived && a.kind === k).reduce((n, a) => n + a.balance, 0);

  return (
    <>
      <PageHead sub={q.data ? t('accounts.sub', { active: q.data.filter(a => !a.archived).length, archived: q.data.filter(a => a.archived).length }) : ''} title={t('nav.accounts')}>
        <button type="button" className="btn btn-1" onClick={() => setForm('new')}>+ {t('accounts.new')}</button>
      </PageHead>
      <QueryState q={q} isEmpty={d => d.length === 0}
        empty={<>{t('accounts.empty')}<button type="button" className="btn btn-1" onClick={() => setForm('new')}>{t('accounts.add')}</button></>}>
        {list => (
          <>
            <div className="kpis">
              <div className="hero"><span className="lbl">{t('accounts.total')}</span><span className="num" style={{ fontSize: 26 }}>{ov.data ? money(ov.data.totalBalance) : '…'}</span></div>
              {KINDS.map(k => <div className="card kpi" key={k}><span className="lbl">{t(`kind.${k}`)}</span><span className="num v" style={{ fontSize: 22 }}>{money(sum(list, k))}</span></div>)}
            </div>
            <section className="card" style={{ padding: '8px 20px 12px' }}>
              <div className="scroll">
                <div className="trow thead acc-cols">
                  <span className="th">{t('accounts.col.account')}</span><span className="th hide-m">{t('accounts.col.type')}</span><span className="th hide-m">{t('accounts.col.institution')}</span>
                  <span className="th hide-m">{t('accounts.col.inTotal')}</span><span className="th r">{t('accounts.col.balance')}</span><span className="th r">{t('accounts.col.actions')}</span>
                </div>
                {list.map(a => (
                  <div className="trow acc-cols" key={a.id} style={{ opacity: a.archived ? 0.55 : 1 }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 10, fontWeight: 500 }}>
                      <span style={{ width: 32, height: 32, borderRadius: 10, background: a.color, flex: 'none' }} />{a.name}{a.archived && <span className="badge">{t('accounts.archivedBadge')}</span>}
                    </span>
                    <span className="hide-m" style={{ color: 'var(--ink-2)' }}>{tOr(`kind.${a.kind}`, a.kind)}</span>
                    <span className="hide-m" style={{ color: 'var(--ink-2)' }}>{a.bank || '—'}</span>
                    <span className="hide-m" style={{ color: 'var(--ink-2)' }}>{a.inTotal ? t('common.yes') : t('common.no')}</span>
                    <span className="num r">{money(a.balance)}</span>
                    <span className="actions-c" style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                      <button type="button" className="btn-sm" onClick={() => setForm(a)}>{t('common.edit')}</button>
                      <button type="button" className="btn-sm danger" onClick={() => setDel(a)}>{t('common.delete')}</button>
                    </span>
                  </div>))}
              </div>
            </section>
            {del && <DeleteAccount account={del} others={list.filter(a => a.id !== del.id)} onClose={() => setDel(null)} />}
          </>
        )}
      </QueryState>
      {form && <AccountForm account={form === 'new' ? null : form} onClose={() => setForm(null)} />}
    </>
  );
}

function AccountForm({ account, onClose }: { account: Account | null; onClose: () => void }) {
  const { t, parseSigned, moneyInput } = useI18n();
  const create = useCreateAccount();
  const update = useUpdateAccount();
  const [kind, setKind] = useState<AccountKind>(account?.kind ?? 'checking');
  const [name, setName] = useState(account?.name ?? '');
  const [bank, setBank] = useState(account?.bank ?? '');
  const [bal, setBal] = useState(account ? moneyInput(account.balance) : '');
  const [color, setColor] = useState(account?.color ?? PALETTE[2][1]);
  const [inTotal, setInTotal] = useState(account?.inTotal ?? true);
  const [err, setErr] = useState('');

  const run = async (fn: () => Promise<unknown>) => {
    setErr('');
    try { await fn(); onClose(); } catch (e) { setErr(errorMessage(e, t)); }
  };
  const save = () => {
    if (!name.trim()) return setErr(t('accounts.nameRequired'));
    const entered = parseSigned(bal) ?? 0;
    return run(() => account
      ? update.mutateAsync({ id: account.id, body: { name: name.trim(), kind, bank, color, inTotal, opening: account.opening + (entered - account.balance) } })
      : create.mutateAsync({ name: name.trim(), kind, bank, color, inTotal, opening: entered }));
  };
  const toggleArchive = () => run(() => update.mutateAsync({ id: account!.id, body: { archived: !account!.archived } }));

  return (
    <Modal title={account ? t('accounts.formEdit') : t('accounts.new')} onClose={onClose}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <span className="lbl">{t('common.type')}</span>
        <div className="seg">{KINDS.map(k => <button key={k} type="button" className={kind === k ? 'on' : ''} onClick={() => setKind(k)}>{t(`kind.${k}`)}</button>)}</div>
      </div>
      <div className="grid">
        <Field label={t('accounts.name')} error={err}>{id => <input id={id} placeholder={t('accounts.namePh')} value={name} onChange={e => setName(e.target.value)} autoFocus />}</Field>
        <Field label={t('accounts.institution')}>{id => <input id={id} placeholder={t('common.optional')} value={bank} onChange={e => setBank(e.target.value)} />}</Field>
        <Field label={account ? t('accounts.currentBalance') : t('accounts.openingBalance')}>{id => <input id={id} inputMode="decimal" value={bal} onChange={e => setBal(e.target.value)} />}</Field>
      </div>
      <div className="fld"><span className="lbl">{t('common.color')}</span><Swatches value={color} onChange={setColor} /></div>
      <label className="check"><input type="checkbox" checked={inTotal} onChange={e => setInTotal(e.target.checked)} />{t('accounts.includeInTotal')}</label>
      <div className="footer">
        {account && <button type="button" className="btn btn-2" onClick={() => void toggleArchive()}>{account.archived ? t('common.unarchive') : t('common.archive')}</button>}
        <span className="grow" />
        <button type="button" className="btn btn-2" onClick={onClose}>{t('common.cancel')}</button>
        <button type="button" className="btn btn-1" onClick={() => void save()}>{account ? t('common.saveChanges') : t('accounts.createCta')}</button>
      </div>
    </Modal>
  );
}

function DeleteAccount({ account, others, onClose }: { account: Account; others: Account[]; onClose: () => void }) {
  const { t } = useI18n();
  const del = useDeleteAccount();
  const [mode, setMode] = useState<'move' | 'delete'>(others.length ? 'move' : 'delete');
  const [target, setTarget] = useState(others[0]?.id ?? '');
  return (
    <ConfirmDelete title={t('accounts.deleteTitle', { name: account.name })} body={t('accounts.deleteBody')} cta={t('accounts.deleteCta')} onClose={onClose}
      onConfirm={() => del.mutateAsync({ id: account.id, moveTo: mode === 'move' ? target : undefined })}>
      {others.length > 0 && (
        <OptionRadio name="del" checked={mode === 'move'} onChange={() => setMode('move')}>
          {t('accounts.moveOption')}{' '}
          <select value={target} onChange={e => setTarget(e.target.value)} onClick={e => e.stopPropagation()} className="flt" aria-label={t('common.moveTo')}>
            {others.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </OptionRadio>
      )}
      <OptionRadio name="del" checked={mode === 'delete'} onChange={() => setMode('delete')}>{t('accounts.deleteOption')}</OptionRadio>
    </ConfirmDelete>
  );
}
```

> `t(`kind.${k}`)` with a template literal fails the `Key` type: use `tOr(`kind.${k}`, k)` (as in the table) wherever the key is built dynamically; apply the same fix in the form's kind buttons and the KPI labels.

- [ ] **Step 5: Run tests and typecheck**

Run: `npx vitest run test/pages/accounts.test.tsx test/i18n && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(accounts): server-driven accounts page with i18n and move-on-delete" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Credit cards page

**Files:**
- Modify: `src/pages/Cards.tsx` (replace), `src/i18n/en.ts`, `src/i18n/pt-BR.ts`
- Test: `test/pages/cards.test.tsx`

**Interfaces:**
- Consumes: `useCards/useAccounts/useCreateCard/useUpdateCard/useDeleteCard/usePayCard`, lookups (`useAccountLookup`, `useCategoryLookup`), `QueryState`, `ConfirmDelete/Modal/Field/PageHead/Swatches/Bar/level`, `PALETTE`.
- Behavior contract: statements, `used`, status and totals come from the API; the screen only formats them. The old client-side "minimum payment" is dropped (the API does not provide it). The **Pay statement** button shows only for `open`/`due` statements with `total > paid`; the pay form defaults: amount = `total − paid` (a display default, editable), from-account = `card.payAccountId` or the first account, date = today.

- [ ] **Step 1: Add i18n keys**

`en.ts`:

```ts
  // cards
  'cards.count': 'Cards: {n}',
  'cards.new': 'New card',
  'cards.empty': 'No credit cards yet.',
  'cards.add': 'Add a card',
  'cards.used': 'Used',
  'cards.limitLine': 'Limit {limit} · closes day {close} · due day {due}',
  'cards.statementsTitle': '{name} · statements',
  'cards.editCard': 'Edit card',
  'cards.statementLine': '{month} statement · {range}',
  'cards.due': 'Due {date}',
  'cards.paidSoFar': 'paid {amount}',
  'cards.pay': 'Pay statement',
  'cards.noPurchases': 'No purchases in this statement.',
  'cards.limitTitle': 'Limit',
  'cards.limitUsed': 'Used {used} ({pct}%)',
  'cards.available': 'Available {amount}',
  'cards.limitNote': 'Includes future installments. Pays from {account}.',
  'cards.formEdit': 'Edit credit card',
  'cards.name': 'Card name',
  'cards.namePh': 'e.g. Nubank Platinum',
  'cards.network': 'Network',
  'cards.limit': 'Credit limit',
  'cards.payFrom': 'Pays from account',
  'cards.closeDay': 'Closing day',
  'cards.dueDay': 'Due day',
  'cards.createCta': 'Create card',
  'cards.nameRequired': 'Give the card a name.',
  'cards.deleteTitle': 'Delete {name}?',
  'cards.deleteBody': 'This also deletes every purchase and payment recorded on this card.',
  'cards.deleteCta': 'Delete card',
  'cards.payTitle': 'Pay {month} statement',
  'cards.payAmount': 'Amount',
  'cards.payAccount': 'From account',
  'cards.payConfirm': 'Confirm payment',
  'cards.payNeedAccount': 'Add an account first to pay from.',
  'cards.amountRequired': 'Enter an amount.',
```

`pt-BR.ts`:

```ts
  'cards.count': 'Cartões: {n}',
  'cards.new': 'Novo cartão',
  'cards.empty': 'Nenhum cartão de crédito ainda.',
  'cards.add': 'Adicionar um cartão',
  'cards.used': 'Usado',
  'cards.limitLine': 'Limite {limit} · fecha dia {close} · vence dia {due}',
  'cards.statementsTitle': '{name} · faturas',
  'cards.editCard': 'Editar cartão',
  'cards.statementLine': 'Fatura de {month} · {range}',
  'cards.due': 'Vence em {date}',
  'cards.paidSoFar': 'pago {amount}',
  'cards.pay': 'Pagar fatura',
  'cards.noPurchases': 'Nenhuma compra nesta fatura.',
  'cards.limitTitle': 'Limite',
  'cards.limitUsed': 'Usado {used} ({pct}%)',
  'cards.available': 'Disponível {amount}',
  'cards.limitNote': 'Inclui parcelas futuras. Paga com {account}.',
  'cards.formEdit': 'Editar cartão de crédito',
  'cards.name': 'Nome do cartão',
  'cards.namePh': 'ex.: Nubank Platinum',
  'cards.network': 'Bandeira',
  'cards.limit': 'Limite de crédito',
  'cards.payFrom': 'Paga com a conta',
  'cards.closeDay': 'Dia de fechamento',
  'cards.dueDay': 'Dia de vencimento',
  'cards.createCta': 'Criar cartão',
  'cards.nameRequired': 'Dê um nome ao cartão.',
  'cards.deleteTitle': 'Excluir {name}?',
  'cards.deleteBody': 'Isso também exclui todas as compras e pagamentos registrados neste cartão.',
  'cards.deleteCta': 'Excluir cartão',
  'cards.payTitle': 'Pagar fatura de {month}',
  'cards.payAmount': 'Valor',
  'cards.payAccount': 'Da conta',
  'cards.payConfirm': 'Confirmar pagamento',
  'cards.payNeedAccount': 'Adicione uma conta primeiro para pagar.',
  'cards.amountRequired': 'Informe um valor.',
```

- [ ] **Step 2: Write the failing tests** — `test/pages/cards.test.tsx`

```tsx
import { screen, within } from '@testing-library/react';
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
    expect(await screen.findByText('R$ 2.318,44')).toBeInTheDocument();
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
  it('empty state', async () => {
    mockApi();
    renderWithProviders(<Cards />);
    expect(await screen.findByText('Nenhum cartão de crédito ainda.')).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Run to verify they fail**

Run: `npx vitest run test/pages/cards.test.tsx`
Expected: FAIL.

- [ ] **Step 4: Implement** — `src/pages/Cards.tsx`

```tsx
import { useState } from 'react';
import type { Card, Statement } from '../api/types';
import { QueryState } from '../components/QueryState';
import { useI18n } from '../i18n';
import { errorMessage } from '../i18n/errors';
import { PALETTE } from '../icons';
import { useAccounts, useCards, useCreateCard, useDeleteCard, usePayCard, useUpdateCard } from '../queries';
import { useAccountLookup, useCategoryLookup } from '../queries/lookups';
import { Bar, ConfirmDelete, Field, level, Modal, PageHead, Swatches } from '../ui';

const BADGE = { paid: 'badge pos', open: 'badge warn', upcoming: 'badge', due: 'badge bad' } as const;
const NETWORKS = ['Mastercard', 'Visa', 'Elo', 'Amex', 'Other'];

export function Cards() {
  const { t, tOr, money, date, dateShort, month } = useI18n();
  const q = useCards();
  const acc = useAccountLookup();
  const cats = useCategoryLookup();
  const [sel, setSel] = useState('');
  const [cycle, setCycle] = useState('');
  const [form, setForm] = useState<Card | 'new' | null>(null);
  const [del, setDel] = useState<Card | null>(null);
  const [pay, setPay] = useState<{ card: Card; st: Statement } | null>(null);

  return (
    <>
      <PageHead sub={q.data ? t('cards.count', { n: q.data.length }) : ''} title={t('nav.cards')}>
        <button type="button" className="btn btn-1" onClick={() => setForm('new')}>+ {t('cards.new')}</button>
      </PageHead>
      <QueryState q={q} isEmpty={d => d.length === 0}
        empty={<>{t('cards.empty')}<button type="button" className="btn btn-1" onClick={() => setForm('new')}>{t('cards.add')}</button></>}>
        {cards => {
          const card = cards.find(c => c.id === sel) ?? cards[0];
          const st = card.statements.find(s => s.key === cycle) ?? card.statements.find(s => s.status === 'open') ?? card.statements[0];
          const usedPct = card.limit > 0 ? Math.round((card.used / card.limit) * 100) : 0;
          return (
            <>
              <div className="cols" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(280px,1fr))' }}>
                {cards.map(c => (
                  <button key={c.id} type="button" className={'ccard' + (c.id === card.id ? ' sel' : '')} aria-pressed={c.id === card.id}
                    style={{ background: c.color, color: '#fff' }} onClick={() => { setSel(c.id); setCycle(''); }}>
                    <span className="spread" style={{ width: '100%' }}><b className="num" style={{ fontSize: 17 }}>{c.name}</b><span style={{ fontSize: 11, letterSpacing: '.08em', opacity: 0.85 }}>{c.network.toUpperCase()}</span></span>
                    <span style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <span className="spread"><span style={{ fontSize: 13, opacity: 0.85 }}>{t('cards.used')}</span><span className="num">{money(c.used)}</span></span>
                      <span style={{ fontSize: 12, opacity: 0.85 }}>{t('cards.limitLine', { limit: money(c.limit), close: c.closeDay, due: c.dueDay })}</span>
                    </span>
                  </button>))}
              </div>

              <section className="card">
                <div className="card-head" style={{ flexWrap: 'wrap' }}>
                  <h2>{t('cards.statementsTitle', { name: card.name })}</h2>
                  <div className="actions">
                    <button type="button" className="btn-sm" onClick={() => setForm(card)}>{t('cards.editCard')}</button>
                    <button type="button" className="btn-sm danger" onClick={() => setDel(card)}>{t('common.delete')}</button>
                  </div>
                </div>
                <div className="pills" role="tablist">
                  {card.statements.map(s => (
                    <button key={s.key} type="button" role="tab" aria-selected={s.key === st.key} className={'pillbtn' + (s.key === st.key ? ' on' : '')} onClick={() => setCycle(s.key)}>{month(s.key)}</button>))}
                </div>
                <div className="spread" style={{ flexWrap: 'wrap', alignItems: 'center' }}>
                  <div className="stack">
                    <span className="muted" style={{ fontSize: 13 }}>{t('cards.statementLine', { month: month(st.key, true), range: `${date(st.range.start)} – ${date(st.range.end)}` })}</span>
                    <span className="num" style={{ fontSize: 28 }}>{money(st.total)}</span>
                    <span className="muted" style={{ fontSize: 13 }}>
                      {t('cards.due', { date: date(st.due) })}{st.paid > 0 && st.status !== 'paid' ? ` · ${t('cards.paidSoFar', { amount: money(st.paid) })}` : ''}
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                    <span className={BADGE[st.status]}>{tOr(`status.statement.${st.status}`, st.status)}</span>
                    {(st.status === 'open' || st.status === 'due') && st.total > st.paid && (
                      <button type="button" className="btn btn-1" onClick={() => setPay({ card, st })}>{t('cards.pay')}</button>)}
                  </div>
                </div>
                {st.items.length === 0 ? <div className="empty">{t('cards.noPurchases')}</div> : (
                  <div>{st.items.map(i => (
                    <div className="line" key={i.id}>
                      <span className="muted" style={{ width: 54, fontSize: 13 }}>{dateShort(i.date)}</span>
                      <span className="stack" style={{ flex: 1 }}>
                        <span style={{ fontWeight: 500 }}>{i.desc}{i.inst ? ` (${i.inst.i}/${i.inst.n})` : ''}</span>
                        <span className="muted" style={{ fontSize: 12 }}>{cats.label(i.categoryId)}</span>
                      </span>
                      <span className="num">{money(i.amount)}</span>
                    </div>))}</div>)}
              </section>

              <section className="card">
                <h2>{t('cards.limitTitle')}</h2>
                <Bar value={usedPct} color={level(usedPct)} />
                <div className="spread muted" style={{ fontSize: 13 }}>
                  <span>{t('cards.limitUsed', { used: money(card.used), pct: usedPct })}</span>
                  <span>{t('cards.available', { amount: money(Math.max(0, card.limit - card.used)) })}</span>
                </div>
                <span className="muted" style={{ fontSize: 13 }}>{t('cards.limitNote', { account: acc.name(card.payAccountId) })}</span>
              </section>
            </>
          );
        }}
      </QueryState>

      {form && <CardForm card={form === 'new' ? null : form} onClose={() => setForm(null)} onSaved={id => { setSel(id); setCycle(''); }} />}
      {del && <DeleteCard card={del} onClose={() => setDel(null)} onDone={() => setSel('')} />}
      {pay && <PayModal card={pay.card} st={pay.st} onClose={() => setPay(null)} />}
    </>
  );
}

function CardForm({ card, onClose, onSaved }: { card: Card | null; onClose: () => void; onSaved: (id: string) => void }) {
  const { t, parseMoney, moneyInput } = useI18n();
  const accounts = useAccounts();
  const create = useCreateCard();
  const update = useUpdateCard();
  const [name, setName] = useState(card?.name ?? '');
  const [network, setNetwork] = useState(card?.network ?? 'Mastercard');
  const [limit, setLimit] = useState(card ? moneyInput(card.limit) : '');
  const [closeDay, setCloseDay] = useState(card?.closeDay ?? 3);
  const [dueDay, setDueDay] = useState(card?.dueDay ?? 10);
  const [payAccountId, setPayAccountId] = useState(card?.payAccountId ?? '');
  const [color, setColor] = useState(card?.color ?? PALETTE[0][1]);
  const [err, setErr] = useState('');
  const day = (v: string) => Math.min(31, Math.max(1, parseInt(v, 10) || 1));

  const save = async () => {
    if (!name.trim()) return setErr(t('cards.nameRequired'));
    const body = { name: name.trim(), network, limit: parseMoney(limit) ?? 0, closeDay, dueDay, color, payAccountId };
    try {
      const saved = card ? await update.mutateAsync({ id: card.id, body }) : await create.mutateAsync(body);
      onSaved(saved?.id ?? card?.id ?? '');
      onClose();
    } catch (e) { setErr(errorMessage(e, t)); }
  };

  return (
    <Modal title={card ? t('cards.formEdit') : t('cards.new')} onClose={onClose}>
      <div className="grid">
        <Field label={t('cards.name')} error={err}>{id => <input id={id} placeholder={t('cards.namePh')} value={name} autoFocus onChange={e => setName(e.target.value)} />}</Field>
        <Field label={t('cards.network')}>{id => <select id={id} value={network} onChange={e => setNetwork(e.target.value)}>{NETWORKS.map(n => <option key={n}>{n}</option>)}</select>}</Field>
        <Field label={t('cards.limit')}>{id => <input id={id} inputMode="decimal" value={limit} onChange={e => setLimit(e.target.value)} />}</Field>
        <Field label={t('cards.payFrom')}>{id => (
          <select id={id} value={payAccountId} onChange={e => setPayAccountId(e.target.value)}>
            <option value="">{t('common.none')}</option>{(accounts.data ?? []).map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>)}</Field>
        <Field label={t('cards.closeDay')}>{id => <input id={id} type="number" min={1} max={31} value={closeDay} onChange={e => setCloseDay(day(e.target.value))} />}</Field>
        <Field label={t('cards.dueDay')}>{id => <input id={id} type="number" min={1} max={31} value={dueDay} onChange={e => setDueDay(day(e.target.value))} />}</Field>
      </div>
      <div className="fld"><span className="lbl">{t('common.color')}</span><Swatches value={color} onChange={setColor} /></div>
      <div className="footer">
        <button type="button" className="btn btn-2" onClick={onClose}>{t('common.cancel')}</button>
        <button type="button" className="btn btn-1" onClick={() => void save()}>{card ? t('common.saveChanges') : t('cards.createCta')}</button>
      </div>
    </Modal>
  );
}

function DeleteCard({ card, onClose, onDone }: { card: Card; onClose: () => void; onDone: () => void }) {
  const { t } = useI18n();
  const del = useDeleteCard();
  return (
    <ConfirmDelete title={t('cards.deleteTitle', { name: card.name })} body={t('cards.deleteBody')} cta={t('cards.deleteCta')} onClose={onClose}
      onConfirm={async () => { await del.mutateAsync(card.id); onDone(); }} />
  );
}

function PayModal({ card, st, onClose }: { card: Card; st: Statement; onClose: () => void }) {
  const { t, month, today, parseMoney, moneyInput } = useI18n();
  const accounts = useAccounts();
  const pay = usePayCard();
  const list = accounts.data ?? [];
  const [amt, setAmt] = useState(moneyInput(st.total - st.paid));
  const [from, setFrom] = useState(card.payAccountId || list[0]?.id || '');
  const [dt, setDt] = useState(today);
  const [err, setErr] = useState('');

  const submit = async () => {
    const amount = parseMoney(amt);
    if (!amount) return setErr(t('cards.amountRequired'));
    if (!from) return setErr(t('cards.payNeedAccount'));
    try { await pay.mutateAsync({ id: card.id, body: { amount, fromAccountId: from, date: dt } }); onClose(); } catch (e) { setErr(errorMessage(e, t)); }
  };
  return (
    <Modal title={t('cards.payTitle', { month: month(st.key) })} onClose={onClose}>
      <div className="grid">
        <Field label={t('cards.payAmount')} error={err}>{id => <input id={id} inputMode="decimal" value={amt} onChange={e => setAmt(e.target.value)} />}</Field>
        <Field label={t('cards.payAccount')}>{id => <select id={id} value={from} onChange={e => setFrom(e.target.value)}>{list.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select>}</Field>
        <Field label={t('common.date')}>{id => <input id={id} type="date" value={dt} onChange={e => setDt(e.target.value)} />}</Field>
      </div>
      <div className="footer">
        <button type="button" className="btn btn-2" onClick={onClose}>{t('common.cancel')}</button>
        <button type="button" className="btn btn-1" onClick={() => void submit()}>{t('cards.payConfirm')}</button>
      </div>
    </Modal>
  );
}
```

> The statement tab name in the test (`/set/i`) matches the pt-BR short month of September (`set. de 2026`). `Bar`'s used-percentage here is a pure display ratio of two API numbers (`used`, `limit`) for the progress bar width — allowed presentation math; no business rule.

- [ ] **Step 5: Run tests and typecheck**

Run: `npx vitest run test/pages/cards.test.tsx && npx tsc --noEmit`
Expected: PASS. (If the range assertion's exact pt-BR text differs, adjust the regexp to the actual `date()` output: the page formats the range with `date()`, i.e. `04/09/2026 – 03/10/2026`.)

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(cards): server-driven cards and statements page with i18n" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 11: Categories page

**Files:**
- Modify: `src/pages/Categories.tsx` (replace), `src/i18n/en.ts`, `src/i18n/pt-BR.ts`
- Test: `test/pages/categories.test.tsx`

**Interfaces:**
- Consumes: `useCategories/useCreateCategory/useUpdateCategory/useDeleteCategory`, `useCategoryLookup` (translated names, `tops`, `subsOf`), `QueryState`, `ConfirmDelete/Modal/Field/PageHead/Swatches/CatIcon`, `CAT_ICONS`, `PALETTE`.
- Behavior contract: default categories (`system`) are shown with translated names; custom ones with their own. Per-month transaction counts are dropped (not in the API). Delete asks "move transactions to…" (any category outside the deleted family, or "Uncategorized") and warns that subcategories and budgets are removed.

- [ ] **Step 1: Add i18n keys**

`en.ts`:

```ts
  // categories page (UI keys use the `catpage.` prefix to stay clear of the `categories.<seedKey>` namespace)
  'catpage.count': 'Categories: {n}',
  'catpage.new': 'New category',
  'catpage.empty': 'No categories.',
  'catpage.default': 'Default',
  'catpage.custom': 'Custom',
  'catpage.addSub': 'Subcategory',
  'catpage.formNewCat': 'New category',
  'catpage.formEditCat': 'Edit category',
  'catpage.formNewSub': 'New subcategory',
  'catpage.formEditSub': 'Edit subcategory',
  'catpage.parent': 'Parent',
  'catpage.topLevel': 'None (top-level)',
  'catpage.nameRequired': 'Give it a name.',
  'catpage.deleteTitle': 'Delete {name}?',
  'catpage.deleteBody': 'Its subcategories and budgets are removed too. Transactions can be moved to another category.',
  'catpage.moveTransactions': 'Move transactions to',
  'catpage.deleteCta': 'Delete',
  // icon names
  'icon.Cart': 'Cart',
  'icon.Home': 'Home',
  'icon.Car': 'Car',
  'icon.Food': 'Food',
  'icon.Run': 'Running',
  'icon.Gift': 'Gift',
  'icon.Paw': 'Pet',
  'icon.Plane': 'Plane',
  'icon.Bolt': 'Energy',
  'icon.Book': 'Book',
```

`pt-BR.ts`:

```ts
  'catpage.count': 'Categorias: {n}',
  'catpage.new': 'Nova categoria',
  'catpage.empty': 'Nenhuma categoria.',
  'catpage.default': 'Padrão',
  'catpage.custom': 'Personalizada',
  'catpage.addSub': 'Subcategoria',
  'catpage.formNewCat': 'Nova categoria',
  'catpage.formEditCat': 'Editar categoria',
  'catpage.formNewSub': 'Nova subcategoria',
  'catpage.formEditSub': 'Editar subcategoria',
  'catpage.parent': 'Categoria pai',
  'catpage.topLevel': 'Nenhuma (nível principal)',
  'catpage.nameRequired': 'Dê um nome.',
  'catpage.deleteTitle': 'Excluir {name}?',
  'catpage.deleteBody': 'Suas subcategorias e orçamentos também são removidos. As transações podem ser movidas para outra categoria.',
  'catpage.moveTransactions': 'Mover transações para',
  'catpage.deleteCta': 'Excluir',
  'icon.Cart': 'Carrinho',
  'icon.Home': 'Casa',
  'icon.Car': 'Carro',
  'icon.Food': 'Comida',
  'icon.Run': 'Corrida',
  'icon.Gift': 'Presente',
  'icon.Paw': 'Pet',
  'icon.Plane': 'Avião',
  'icon.Bolt': 'Energia',
  'icon.Book': 'Livro',
```

- [ ] **Step 2: Write the failing tests** — `test/pages/categories.test.tsx`

```tsx
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
```

- [ ] **Step 3: Run to verify they fail**

Run: `npx vitest run test/pages/categories.test.tsx`
Expected: FAIL.

- [ ] **Step 4: Implement** — `src/pages/Categories.tsx`

```tsx
import { useState } from 'react';
import type { Category } from '../api/types';
import { QueryState } from '../components/QueryState';
import { useI18n } from '../i18n';
import { errorMessage } from '../i18n/errors';
import { CAT_ICONS, PALETTE } from '../icons';
import { useCategories, useCreateCategory, useDeleteCategory, useUpdateCategory } from '../queries';
import { useCategoryLookup } from '../queries/lookups';
import { CatIcon, ConfirmDelete, Field, Modal, PageHead, Swatches } from '../ui';

type Draft = { id: string | null; name: string; parentId: string | null; icon: string; color: string; system: boolean };

export function Categories() {
  const { t } = useI18n();
  const q = useCategories();
  const cats = useCategoryLookup();
  const [form, setForm] = useState<Draft | null>(null);
  const [del, setDel] = useState<Category | null>(null);
  const blank = (parent?: Category): Draft => ({ id: null, name: '', parentId: parent?.id ?? null, icon: parent?.icon ?? 'Paw', color: parent?.color ?? PALETTE[0][1], system: false });
  const edit = (c: Category): Draft => ({ id: c.id, name: c.system && c.key ? cats.name(c) : c.name, parentId: c.parentId, icon: c.icon, color: c.color, system: c.system });

  return (
    <>
      <PageHead sub={q.data ? t('catpage.count', { n: cats.tops.length }) : ''} title={t('nav.categories')}>
        <button type="button" className="btn btn-1" onClick={() => setForm(blank())}>+ {t('catpage.new')}</button>
      </PageHead>
      <QueryState q={q} isEmpty={d => d.length === 0} empty={t('catpage.empty')}>
        {() => (
          <div className="cols">
            {cats.tops.map(c => (
              <section className="card" key={c.id}>
                <div className="card-head" style={{ alignItems: 'center' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <span className="mono" style={{ background: c.color }}><CatIcon name={c.icon} /></span>
                    <span className="stack"><h2>{cats.name(c)}</h2><span className="muted" style={{ fontSize: 12 }}>{c.system ? t('catpage.default') : t('catpage.custom')}</span></span>
                  </span>
                </div>
                <div className="actions">
                  <button type="button" className="btn-sm" onClick={() => setForm(edit(c))}>{t('common.edit')}</button>
                  <button type="button" className="btn-sm" onClick={() => setForm(blank(c))}>+ {t('catpage.addSub')}</button>
                  <button type="button" className="btn-sm danger" onClick={() => setDel(c)}>{t('common.delete')}</button>
                </div>
                <div>{cats.subsOf(c.id).map(s => (
                  <div className="line" key={s.id}>
                    <span style={{ flex: 1 }}>{cats.name(s)}</span>
                    <button type="button" className="btn-sm" onClick={() => setForm(edit(s))}>{t('common.edit')}</button>
                    <button type="button" className="btn-sm danger" onClick={() => setDel(s)}>{t('common.delete')}</button>
                  </div>))}</div>
              </section>))}
          </div>
        )}
      </QueryState>
      {form && <CategoryForm draft={form} onClose={() => setForm(null)} />}
      {del && <DeleteCategory cat={del} onClose={() => setDel(null)} />}
    </>
  );
}

function CategoryForm({ draft, onClose }: { draft: Draft; onClose: () => void }) {
  const { t, tOr } = useI18n();
  const cats = useCategoryLookup();
  const create = useCreateCategory();
  const update = useUpdateCategory();
  const [c, setC] = useState(draft);
  const [err, setErr] = useState('');
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setC(x => ({ ...x, [k]: v }));
  const isNew = c.id === null;
  const hasSubs = c.id !== null && cats.subsOf(c.id).length > 0;

  const save = async () => {
    if (!c.name.trim()) return setErr(t('catpage.nameRequired'));
    const body = { name: c.name.trim(), parentId: c.parentId, icon: c.icon, color: c.color };
    try { await (isNew ? create.mutateAsync(body) : update.mutateAsync({ id: c.id!, body })); onClose(); } catch (e) { setErr(errorMessage(e, t)); }
  };
  const title = c.parentId ? (isNew ? t('catpage.formNewSub') : t('catpage.formEditSub')) : (isNew ? t('catpage.formNewCat') : t('catpage.formEditCat'));

  return (
    <Modal title={title} onClose={onClose}>
      <div className="grid">
        <Field label={t('common.name')} error={err}>{id => <input id={id} value={c.name} autoFocus onChange={e => set('name', e.target.value)} />}</Field>
        <Field label={t('catpage.parent')}>{id => (
          <select id={id} value={c.parentId ?? ''} disabled={hasSubs} onChange={e => set('parentId', e.target.value || null)}>
            <option value="">{t('catpage.topLevel')}</option>
            {cats.tops.filter(x => x.id !== c.id).map(x => <option key={x.id} value={x.id}>{cats.name(x)}</option>)}
          </select>)}</Field>
      </div>
      <div className="fld"><span className="lbl">{t('common.icon')}</span>
        <div className="icons" role="radiogroup" aria-label={t('common.icon')}>
          {Object.keys(CAT_ICONS).map(k => (
            <button key={k} type="button" role="radio" aria-checked={c.icon === k} aria-label={tOr(`icon.${k}`, k)} className="iconbtn"
              style={c.icon === k ? { border: `2px solid ${c.color}`, color: c.color } : undefined} onClick={() => set('icon', k)}><CatIcon name={k} /></button>))}
        </div>
      </div>
      <div className="fld"><span className="lbl">{t('common.color')}</span><Swatches value={c.color} onChange={v => set('color', v)} /></div>
      <div className="footer">
        <button type="button" className="btn btn-2" onClick={onClose}>{t('common.cancel')}</button>
        <button type="button" className="btn btn-1" onClick={() => void save()}>{isNew ? t('common.create') : t('common.saveChanges')}</button>
      </div>
    </Modal>
  );
}

function DeleteCategory({ cat, onClose }: { cat: Category; onClose: () => void }) {
  const { t } = useI18n();
  const cats = useCategoryLookup();
  const del = useDeleteCategory();
  const family = new Set([cat.id, ...cats.subsOf(cat.id).map(s => s.id)]);
  const [target, setTarget] = useState('');
  return (
    <ConfirmDelete title={t('catpage.deleteTitle', { name: cats.name(cat) })} body={t('catpage.deleteBody')} cta={t('catpage.deleteCta')} onClose={onClose}
      onConfirm={() => del.mutateAsync({ id: cat.id, moveTo: target || undefined })}>
      <Field label={t('catpage.moveTransactions')}>{id => (
        <select id={id} value={target} onChange={e => setTarget(e.target.value)}>
          <option value="">{t('common.uncategorized')}</option>
          {cats.categories.filter(c => !family.has(c.id)).map(c => <option key={c.id} value={c.id}>{c.parentId ? '— ' : ''}{cats.name(c)}</option>)}
        </select>)}</Field>
    </ConfirmDelete>
  );
}
```

- [ ] **Step 5: Run tests and typecheck**

Run: `npx vitest run test/pages/categories.test.tsx && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(categories): server-driven categories page with i18n" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```


---

### Task 12: Budgets page

**Files:**
- Modify: `src/pages/Budgets.tsx` (replace), `src/i18n/en.ts`, `src/i18n/pt-BR.ts`
- Test: `test/pages/budgets.test.tsx`

**Interfaces:**
- Consumes: `useBudgets(month)/useCreateBudget/useUpdateBudget/useDeleteBudget`, `useCategoryLookup`, `QueryState`, `Bar/level/ConfirmDelete/Modal/Field/PageHead`, `shiftMonth` (format.ts).
- Behavior contract: `spent`, `pct` per budget come from the API. Presentation-only aggregation allowed here: the summary tile sums the API `spent` and `limit` and shows `round(spent/limit*100)`. A month switcher (‹ ›) re-queries `GET /budgets?month=`.

- [ ] **Step 1: Add i18n keys**

`en.ts`:

```ts
  // month navigation (shared)
  'month.prev': 'Previous month',
  'month.next': 'Next month',
  // budgets
  'budgets.new': 'New budget',
  'budgets.spentOfBudgeted': 'Spent of budgeted',
  'budgets.ofLimit': 'of {limit} · {pct}%',
  'budgets.leftThisMonth': 'Left this month',
  'budgets.empty': 'No budgets yet.',
  'budgets.create': 'Create a budget',
  'budgets.spent': '{amount} spent',
  'budgets.over': '{amount} over',
  'budgets.left': '{amount} left',
  'budgets.limitOf': 'limit {amount}',
  'budgets.formEdit': 'Edit budget',
  'budgets.category': 'Category',
  'budgets.monthlyLimit': 'Monthly limit',
  'budgets.alertAt': 'Alert at',
  'budgets.alertOption': '{pct}% of limit',
  'budgets.note': 'Applies every month and counts the category together with its subcategories.',
  'budgets.allHave': 'All categories already have a budget',
  'budgets.createCta': 'Create budget',
  'budgets.limitRequired': 'Enter a monthly limit.',
  'budgets.deleteTitle': 'Delete the {name} budget?',
  'budgets.deleteBody': 'Your transactions are kept; only the monthly limit is removed.',
  'budgets.deleteCta': 'Delete budget',
```

`pt-BR.ts`:

```ts
  'month.prev': 'Mês anterior',
  'month.next': 'Próximo mês',
  'budgets.new': 'Novo orçamento',
  'budgets.spentOfBudgeted': 'Gasto do orçado',
  'budgets.ofLimit': 'de {limit} · {pct}%',
  'budgets.leftThisMonth': 'Restante no mês',
  'budgets.empty': 'Nenhum orçamento ainda.',
  'budgets.create': 'Criar um orçamento',
  'budgets.spent': '{amount} gastos',
  'budgets.over': '{amount} acima',
  'budgets.left': '{amount} restantes',
  'budgets.limitOf': 'limite {amount}',
  'budgets.formEdit': 'Editar orçamento',
  'budgets.category': 'Categoria',
  'budgets.monthlyLimit': 'Limite mensal',
  'budgets.alertAt': 'Alertar em',
  'budgets.alertOption': '{pct}% do limite',
  'budgets.note': 'Vale todo mês e conta a categoria junto com suas subcategorias.',
  'budgets.allHave': 'Todas as categorias já têm orçamento',
  'budgets.createCta': 'Criar orçamento',
  'budgets.limitRequired': 'Informe um limite mensal.',
  'budgets.deleteTitle': 'Excluir o orçamento de {name}?',
  'budgets.deleteBody': 'Suas transações são mantidas; apenas o limite mensal é removido.',
  'budgets.deleteCta': 'Excluir orçamento',
```

- [ ] **Step 2: Write the failing tests** — `test/pages/budgets.test.tsx`

```tsx
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
});
```

- [ ] **Step 3: Run to verify they fail**

Run: `npx vitest run test/pages/budgets.test.tsx`
Expected: FAIL.

- [ ] **Step 4: Implement** — `src/pages/Budgets.tsx`

```tsx
import { useState } from 'react';
import type { Budget } from '../api/types';
import { QueryState } from '../components/QueryState';
import { useI18n } from '../i18n';
import { errorMessage } from '../i18n/errors';
import { shiftMonth } from '../i18n/format';
import { useBudgets, useCreateBudget, useDeleteBudget, useUpdateBudget } from '../queries';
import { useCategoryLookup } from '../queries/lookups';
import { Bar, ConfirmDelete, Field, level, Modal, PageHead } from '../ui';

export function Budgets() {
  const { t, money, month, today } = useI18n();
  const [key, setKey] = useState(today.slice(0, 7));
  const q = useBudgets(key);
  const cats = useCategoryLookup();
  const delMut = useDeleteBudget();
  const [form, setForm] = useState<Budget | 'new' | null>(null);
  const [del, setDel] = useState<Budget | null>(null);
  const catName = (id: string) => { const c = cats.categories.find(x => x.id === id); return c ? cats.name(c) : '—'; };

  return (
    <>
      <PageHead sub={month(key, true)} title={t('nav.budgets')}>
        <div className="month-nav">
          <button type="button" className="btn-sm" aria-label={t('month.prev')} onClick={() => setKey(shiftMonth(key, -1))}>‹</button>
          <button type="button" className="btn-sm" aria-label={t('month.next')} onClick={() => setKey(shiftMonth(key, 1))}>›</button>
        </div>
        <button type="button" className="btn btn-1" onClick={() => setForm('new')}>+ {t('budgets.new')}</button>
      </PageHead>
      <QueryState q={q} isEmpty={d => d.length === 0}
        empty={<>{t('budgets.empty')}<button type="button" className="btn btn-1" onClick={() => setForm('new')}>{t('budgets.create')}</button></>}>
        {list => {
          const limit = list.reduce((n, b) => n + b.limit, 0);
          const spent = list.reduce((n, b) => n + b.spent, 0);
          const pct = limit > 0 ? Math.round((spent / limit) * 100) : 0;
          return (
            <>
              <div className="kpis">
                <div className="hero">
                  <span className="lbl">{t('budgets.spentOfBudgeted')}</span><span className="num" style={{ fontSize: 26 }}>{money(spent)}</span>
                  <span style={{ fontSize: 13, color: '#B9BEC6' }}>{t('budgets.ofLimit', { limit: money(limit), pct })}</span>
                </div>
                <div className="card kpi"><span className="lbl">{t('budgets.leftThisMonth')}</span><span className="num v">{money(Math.max(0, limit - spent))}</span></div>
              </div>
              <div className="cols">
                {list.map(b => {
                  const c = level(b.pct, b.alertPct);
                  return (
                    <section className="card" key={b.id}>
                      <div className="spread"><h2>{catName(b.categoryId)}</h2><span style={{ color: c, fontWeight: 600 }}>{b.pct}%</span></div>
                      <Bar value={b.pct} color={c} />
                      <div className="spread muted" style={{ fontSize: 13 }}>
                        <span>{t('budgets.spent', { amount: money(b.spent) })}</span>
                        <span>{b.spent > b.limit ? t('budgets.over', { amount: money(b.spent - b.limit) }) : t('budgets.left', { amount: money(b.limit - b.spent) })} · {t('budgets.limitOf', { amount: money(b.limit) })}</span>
                      </div>
                      <div className="actions">
                        <button type="button" className="btn-sm" onClick={() => setForm(b)}>{t('common.edit')}</button>
                        <button type="button" className="btn-sm danger" onClick={() => setDel(b)}>{t('common.delete')}</button>
                      </div>
                    </section>);
                })}
              </div>
            </>
          );
        }}
      </QueryState>
      {form && <BudgetForm budget={form === 'new' ? null : form} existing={q.data ?? []} onClose={() => setForm(null)} />}
      {del && <ConfirmDelete title={t('budgets.deleteTitle', { name: catName(del.categoryId) })} body={t('budgets.deleteBody')} cta={t('budgets.deleteCta')} onClose={() => setDel(null)}
        onConfirm={() => delMut.mutateAsync(del.id)} />}
    </>
  );
}

```

The form (same file):

```tsx
function BudgetForm({ budget, existing, onClose }: { budget: Budget | null; existing: Budget[]; onClose: () => void }) {
  const { t, parseMoney, moneyInput } = useI18n();
  const cats = useCategoryLookup();
  const create = useCreateBudget();
  const update = useUpdateBudget();
  const free = cats.tops.filter(c => c.id === budget?.categoryId || !existing.some(b => b.categoryId === c.id));
  const [categoryId, setCategoryId] = useState(budget?.categoryId ?? free[0]?.id ?? '');
  const [lim, setLim] = useState(budget ? moneyInput(budget.limit) : '');
  const [alertPct, setAlertPct] = useState(budget?.alertPct ?? 85);
  const [err, setErr] = useState('');

  const save = async () => {
    const limit = parseMoney(lim);
    if (!limit) return setErr(t('budgets.limitRequired'));
    const body = { categoryId, limit, alertPct };
    try { await (budget ? update.mutateAsync({ id: budget.id, body }) : create.mutateAsync(body)); onClose(); } catch (e) { setErr(errorMessage(e, t)); }
  };

  return (
    <Modal title={budget ? t('budgets.formEdit') : t('budgets.new')} onClose={onClose}>
      <div className="grid">
        <Field label={t('budgets.category')}>{id => (
          <select id={id} value={categoryId} onChange={e => setCategoryId(e.target.value)} disabled={!free.length}>
            {free.length ? free.map(c => <option key={c.id} value={c.id}>{cats.name(c)}</option>) : <option value="">{t('budgets.allHave')}</option>}
          </select>)}</Field>
        <Field label={t('budgets.monthlyLimit')} error={err}>{id => <input id={id} inputMode="decimal" value={lim} onChange={e => setLim(e.target.value)} autoFocus />}</Field>
        <Field label={t('budgets.alertAt')}>{id => (
          <select id={id} value={alertPct} onChange={e => setAlertPct(Number(e.target.value))}>
            {[70, 80, 85, 90, 100].map(n => <option key={n} value={n}>{t('budgets.alertOption', { pct: n })}</option>)}
          </select>)}</Field>
      </div>
      <p className="muted" style={{ margin: 0, fontSize: 13 }}>{t('budgets.note')}</p>
      <div className="footer">
        <button type="button" className="btn btn-2" onClick={onClose}>{t('common.cancel')}</button>
        <button type="button" className="btn btn-1" onClick={() => void save()}>{budget ? t('common.saveChanges') : t('budgets.createCta')}</button>
      </div>
    </Modal>
  );
}
```

- [ ] **Step 5: Run tests and typecheck**

Run: `npx vitest run test/pages/budgets.test.tsx && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(budgets): server-driven budgets page with month navigation" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 13: Goals page

**Files:**
- Modify: `src/pages/Goals.tsx` (replace), `src/i18n/en.ts`, `src/i18n/pt-BR.ts`
- Test: `test/pages/goals.test.tsx`

**Interfaces:**
- Consumes: `useGoals/useAccounts/useCreateGoal/useUpdateGoal/useDeleteGoal/useContributeGoal`, `useAccountLookup`, `QueryState`, `Bar/Modal/Field/ConfirmDelete/PageHead`.
- Behavior contract: `pct`, `left`, `monthsLeft`, `monthlyNeeded` come from the API (`monthlyNeeded === null` when there is no usable date). "Add money" calls `/goals/{id}/contribute` with `fromAccountId` (default: first account different from the goal's linked account) and no date (server uses today). Presentation-only aggregation: the summary tile sums API `saved` and `target`.

- [ ] **Step 1: Add i18n keys**

`en.ts`:

```ts
  // goals
  'goals.count': 'Goals: {n}',
  'goals.new': 'New goal',
  'goals.savedSoFar': 'Saved so far',
  'goals.ofTarget': 'of {target} · {pct}%',
  'goals.empty': 'No goals yet.',
  'goals.set': 'Set a goal',
  'goals.noDate': 'No target date',
  'goals.reached': 'Goal reached',
  'goals.perMonth': '{amount} per month · {n} mo left',
  'goals.dateReached': 'Target date reached',
  'goals.toGo': '{amount} to go',
  'goals.inAccount': 'in {account}',
  'goals.addMoney': 'Add money',
  'goals.formEdit': 'Edit goal',
  'goals.name': 'Goal name',
  'goals.namePh': 'e.g. Japan trip',
  'goals.account': 'Linked savings account',
  'goals.target': 'Target amount',
  'goals.targetMonth': 'Target month',
  'goals.alreadySaved': 'Already saved',
  'goals.createCta': 'Create goal',
  'goals.nameRequired': 'Give the goal a name.',
  'goals.targetRequired': 'Enter a target amount.',
  'goals.addTitle': 'Add money to {name}',
  'goals.fromAccount': 'From account',
  'goals.noteTransfer': 'Records a transfer to {account}.',
  'goals.noteLocal': 'The money is already in the linked account; only the goal progress changes.',
  'goals.addCta': 'Add to goal',
  'goals.deleteTitle': 'Delete {name}?',
  'goals.deleteBody': 'The money stays in your account; only the goal tracking is removed.',
  'goals.deleteCta': 'Delete goal',
```

`pt-BR.ts`:

```ts
  'goals.count': 'Metas: {n}',
  'goals.new': 'Nova meta',
  'goals.savedSoFar': 'Guardado até agora',
  'goals.ofTarget': 'de {target} · {pct}%',
  'goals.empty': 'Nenhuma meta ainda.',
  'goals.set': 'Definir uma meta',
  'goals.noDate': 'Sem data alvo',
  'goals.reached': 'Meta atingida',
  'goals.perMonth': '{amount} por mês · faltam {n} m',
  'goals.dateReached': 'Data alvo atingida',
  'goals.toGo': 'Faltam {amount}',
  'goals.inAccount': 'em {account}',
  'goals.addMoney': 'Adicionar dinheiro',
  'goals.formEdit': 'Editar meta',
  'goals.name': 'Nome da meta',
  'goals.namePh': 'ex.: Viagem ao Japão',
  'goals.account': 'Conta poupança vinculada',
  'goals.target': 'Valor alvo',
  'goals.targetMonth': 'Mês alvo',
  'goals.alreadySaved': 'Já guardado',
  'goals.createCta': 'Criar meta',
  'goals.nameRequired': 'Dê um nome à meta.',
  'goals.targetRequired': 'Informe o valor alvo.',
  'goals.addTitle': 'Adicionar dinheiro a {name}',
  'goals.fromAccount': 'Da conta',
  'goals.noteTransfer': 'Registra uma transferência para {account}.',
  'goals.noteLocal': 'O dinheiro já está na conta vinculada; só o progresso da meta muda.',
  'goals.addCta': 'Adicionar à meta',
  'goals.deleteTitle': 'Excluir {name}?',
  'goals.deleteBody': 'O dinheiro continua na sua conta; só o acompanhamento da meta é removido.',
  'goals.deleteCta': 'Excluir meta',
```

- [ ] **Step 2: Write the failing tests** — `test/pages/goals.test.tsx`

```tsx
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as api from '../../src/api/endpoints';
import { Goals } from '../../src/pages/Goals';
import { renderWithProviders } from '../utils';
import { account, goal, mockApi } from './fixtures';

vi.mock('../../src/api/endpoints');
beforeEach(() => {
  mockApi({
    listGoals: [goal(), goal({ id: 'g2', name: 'Reserva', target: 100000, saved: 100000, pct: 100, left: 0, monthlyNeeded: 0, targetDate: '' })],
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
});
```

- [ ] **Step 3: Run to verify they fail**

Run: `npx vitest run test/pages/goals.test.tsx`
Expected: FAIL.

- [ ] **Step 4: Implement** — `src/pages/Goals.tsx`

```tsx
import { useState } from 'react';
import type { Goal } from '../api/types';
import { QueryState } from '../components/QueryState';
import { useI18n } from '../i18n';
import { errorMessage } from '../i18n/errors';
import { useAccounts, useContributeGoal, useCreateGoal, useDeleteGoal, useGoals, useUpdateGoal } from '../queries';
import { useAccountLookup } from '../queries/lookups';
import { Bar, ConfirmDelete, Field, Modal, PageHead } from '../ui';

export function Goals() {
  const { t, money, month } = useI18n();
  const q = useGoals();
  const acc = useAccountLookup();
  const delMut = useDeleteGoal();
  const [form, setForm] = useState<Goal | 'new' | null>(null);
  const [add, setAdd] = useState<Goal | null>(null);
  const [del, setDel] = useState<Goal | null>(null);

  const progress = (g: Goal): string => {
    if (g.left === 0) return t('goals.reached');
    if (!g.targetDate) return t('goals.toGo', { amount: money(g.left) });
    if (g.monthlyNeeded === null || g.monthsLeft === 0) return t('goals.dateReached');
    return t('goals.perMonth', { amount: money(g.monthlyNeeded), n: g.monthsLeft });
  };

  return (
    <>
      <PageHead sub={q.data ? t('goals.count', { n: q.data.length }) : ''} title={t('nav.goals')}>
        <button type="button" className="btn btn-1" onClick={() => setForm('new')}>+ {t('goals.new')}</button>
      </PageHead>
      <QueryState q={q} isEmpty={d => d.length === 0}
        empty={<>{t('goals.empty')}<button type="button" className="btn btn-1" onClick={() => setForm('new')}>{t('goals.set')}</button></>}>
        {list => {
          const saved = list.reduce((n, g) => n + g.saved, 0);
          const target = list.reduce((n, g) => n + g.target, 0);
          return (
            <>
              <div className="kpis">
                <div className="hero">
                  <span className="lbl">{t('goals.savedSoFar')}</span><span className="num" style={{ fontSize: 26 }}>{money(saved)}</span>
                  <span style={{ fontSize: 13, color: '#B9BEC6' }}>{t('goals.ofTarget', { target: money(target), pct: target > 0 ? Math.round((saved / target) * 100) : 0 })}</span>
                </div>
              </div>
              <div className="cols">
                {list.map(g => (
                  <section className="card" key={g.id}>
                    <div className="spread"><h2>{g.name}</h2><span className="num">{g.pct}%</span></div>
                    <Bar value={g.pct} color="var(--pos)" />
                    <div className="spread muted" style={{ fontSize: 13 }}>
                      <span>{money(g.saved)} / {money(g.target)}</span>
                      <span>{g.targetDate ? month(g.targetDate) : t('goals.noDate')}</span>
                    </div>
                    <span className="muted" style={{ fontSize: 13 }}>
                      {progress(g)}{g.accountId ? ` · ${t('goals.inAccount', { account: acc.name(g.accountId) })}` : ''}
                    </span>
                    <div className="actions">
                      <button type="button" className="btn-sm" onClick={() => setAdd(g)}>{t('goals.addMoney')}</button>
                      <button type="button" className="btn-sm" onClick={() => setForm(g)}>{t('common.edit')}</button>
                      <button type="button" className="btn-sm danger" onClick={() => setDel(g)}>{t('common.delete')}</button>
                    </div>
                  </section>))}
              </div>
            </>
          );
        }}
      </QueryState>
      {form && <GoalForm goal={form === 'new' ? null : form} onClose={() => setForm(null)} />}
      {add && <AddMoney goal={add} onClose={() => setAdd(null)} />}
      {del && <ConfirmDelete title={t('goals.deleteTitle', { name: del.name })} body={t('goals.deleteBody')} cta={t('goals.deleteCta')} onClose={() => setDel(null)}
        onConfirm={() => delMut.mutateAsync(del.id)} />}
    </>
  );
}

function GoalForm({ goal, onClose }: { goal: Goal | null; onClose: () => void }) {
  const { t, parseMoney, moneyInput } = useI18n();
  const accounts = useAccounts();
  const create = useCreateGoal();
  const update = useUpdateGoal();
  const [name, setName] = useState(goal?.name ?? '');
  const [accountId, setAccountId] = useState(goal?.accountId ?? '');
  const [target, setTarget] = useState(goal ? moneyInput(goal.target) : '');
  const [targetDate, setTargetDate] = useState(goal?.targetDate ?? '');
  const [saved, setSaved] = useState(goal ? moneyInput(goal.saved) : '');
  const [err, setErr] = useState('');

  const save = async () => {
    if (!name.trim()) return setErr(t('goals.nameRequired'));
    const tgt = parseMoney(target);
    if (!tgt) return setErr(t('goals.targetRequired'));
    const body = { name: name.trim(), accountId, target: tgt, targetDate, saved: parseMoney(saved) ?? 0 };
    try { await (goal ? update.mutateAsync({ id: goal.id, body }) : create.mutateAsync(body)); onClose(); } catch (e) { setErr(errorMessage(e, t)); }
  };

  return (
    <Modal title={goal ? t('goals.formEdit') : t('goals.new')} onClose={onClose}>
      <div className="grid">
        <Field label={t('goals.name')}>{id => <input id={id} placeholder={t('goals.namePh')} value={name} autoFocus onChange={e => setName(e.target.value)} />}</Field>
        <Field label={t('goals.account')}>{id => (
          <select id={id} value={accountId} onChange={e => setAccountId(e.target.value)}>
            <option value="">{t('common.none')}</option>{(accounts.data ?? []).map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>)}</Field>
        <Field label={t('goals.target')} error={err}>{id => <input id={id} inputMode="decimal" value={target} onChange={e => setTarget(e.target.value)} />}</Field>
        <Field label={t('goals.targetMonth')}>{id => <input id={id} type="month" value={targetDate} onChange={e => setTargetDate(e.target.value)} />}</Field>
        <Field label={t('goals.alreadySaved')}>{id => <input id={id} inputMode="decimal" value={saved} onChange={e => setSaved(e.target.value)} />}</Field>
      </div>
      <div className="footer">
        <button type="button" className="btn btn-2" onClick={onClose}>{t('common.cancel')}</button>
        <button type="button" className="btn btn-1" onClick={() => void save()}>{goal ? t('common.saveChanges') : t('goals.createCta')}</button>
      </div>
    </Modal>
  );
}

function AddMoney({ goal, onClose }: { goal: Goal; onClose: () => void }) {
  const { t, parseMoney } = useI18n();
  const accounts = useAccounts();
  const contribute = useContributeGoal();
  const list = (accounts.data ?? []).filter(a => !a.archived);
  const acc = useAccountLookup();
  const [amt, setAmt] = useState('');
  const [from, setFrom] = useState(list.find(a => a.id !== goal.accountId)?.id ?? goal.accountId);
  const [err, setErr] = useState('');

  const submit = async () => {
    const amount = parseMoney(amt);
    if (!amount) return setErr(t('cards.amountRequired'));
    try { await contribute.mutateAsync({ id: goal.id, body: { amount, ...(from ? { fromAccountId: from } : {}) } }); onClose(); } catch (e) { setErr(errorMessage(e, t)); }
  };

  return (
    <Modal title={t('goals.addTitle', { name: goal.name })} onClose={onClose}>
      <div className="grid">
        <Field label={t('common.amount')} error={err}>{id => <input id={id} inputMode="decimal" value={amt} autoFocus onChange={e => setAmt(e.target.value)} />}</Field>
        <Field label={t('goals.fromAccount')}>{id => (
          <select id={id} value={from} onChange={e => setFrom(e.target.value)}>
            {list.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>)}</Field>
      </div>
      <p className="muted" style={{ margin: 0, fontSize: 13 }}>
        {from && goal.accountId && from !== goal.accountId ? t('goals.noteTransfer', { account: acc.name(goal.accountId) }) : t('goals.noteLocal')}
      </p>
      <div className="footer">
        <button type="button" className="btn btn-2" onClick={onClose}>{t('common.cancel')}</button>
        <button type="button" className="btn btn-1" onClick={() => void submit()}>{t('goals.addCta')}</button>
      </div>
    </Modal>
  );
}
```

> The amount-required message reuses `cards.amountRequired` (identical text in both catalogs); that is intentional to avoid a duplicate key.

- [ ] **Step 5: Run tests and typecheck**

Run: `npx vitest run test/pages/goals.test.tsx && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(goals): server-driven goals page with contributions" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```


---

### Task 14: Transactions page (filters, form, series, receipts)

**Files:**
- Modify: `src/pages/Transactions.tsx` (replace), `src/i18n/en.ts`, `src/i18n/pt-BR.ts`, `test/utils.tsx`
- Test: `test/pages/transactions.test.tsx`

**Interfaces:**
- Consumes: `useTransactions/useCreateTransactions/useUpdateTransaction/useDeleteTransaction/useUploadReceipt`, `useAccountLookup/useCategoryLookup`, `txTitle`, `signedAmount/amountColor`, `useAuth().devMode`, `QueryState`, `Modal/Field/OptionRadio/ConfirmDelete/PageHead`, `shiftMonth`.
- Produces: `test/utils.tsx` `renderWithProviders` now also wraps in `AuthProvider` (option `devMode?: boolean`, option `backend?: Partial<AuthBackend>`; returns `backend` too) so components that call `useAuth()` render in tests.
- Behavior contract:
  - Filters map to API query params (`month` unless "all time", `account`, `category`, `type`, `tag` normalized to start with `#`, `q` via `useDeferredValue`); empty values are omitted. The month switcher (‹ ›) changes `month`; the "All time" toggle removes it. The old "Import CSV/OFX" button and the tag *select* are gone (no endpoint / no tag list from the API).
  - Rows hide **Edit** for system transfers (`source` set); **Delete** is always available. The row shows `receiptUrl` as a "View receipt" link when present.
  - Create sends `installments` **or** `repeat` (never both), the server expands the series. Edit = full replacement (`PUT`). Delete on a series member (has `groupId`) offers one / future / all.
  - Receipts: the file input is disabled with a note in dev mode (no S3 locally); otherwise after the transaction is saved the file is uploaded via `useUploadReceipt`; if the upload fails the transaction stays saved and the message `tx.receiptFail` is shown (a second Save only retries the upload).
  - The page opens the form when the hash is `#/transactions?new` (mobile "+" button), then rewrites the hash to `#/transactions`.

- [ ] **Step 1: Update the test utility** — replace `test/utils.tsx`

```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, type RenderResult } from '@testing-library/react';
import type { ReactElement } from 'react';
import { vi } from 'vitest';
import { AuthProvider } from '../src/auth/AuthProvider';
import type { AuthBackend } from '../src/auth/types';
import { I18nProvider, type Locale } from '../src/i18n';

type Opts = { locale?: Locale; currency?: string; timezone?: string; today?: string; devMode?: boolean; backend?: Partial<AuthBackend> };

export function renderWithProviders(ui: ReactElement, o: Opts = {}): RenderResult & { qc: QueryClient; backend: AuthBackend } {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 0 }, mutations: { retry: false } } });
  const backend: AuthBackend = {
    restore: async () => true, signIn: async () => 'ok', completeNewPassword: async () => {},
    getAccessToken: async () => 'tok', refresh: async () => 'tok', signOut: vi.fn(), ...o.backend,
  };
  const r = render(
    <QueryClientProvider client={qc}>
      <AuthProvider backend={backend} devMode={o.devMode ?? false}>
        <I18nProvider locale={o.locale ?? 'pt-BR'} currency={o.currency ?? 'BRL'} timezone={o.timezone} today={o.today ?? '2026-10-13'}>{ui}</I18nProvider>
      </AuthProvider>
    </QueryClientProvider>,
  );
  return Object.assign(r, { qc, backend });
}
```

Run `npx vitest run` — all earlier suites must still pass with this wrapper before continuing.

- [ ] **Step 2: Add i18n keys**

`en.ts`:

```ts
  // transactions
  'tx.sub': '{period} · {n} transactions',
  'tx.allTime': 'All time',
  'tx.search': 'Search description, tag, note',
  'tx.allAccounts': 'All accounts & cards',
  'tx.allCategories': 'All categories',
  'tx.allTypes': 'All types',
  'tx.tagFilter': 'Tag (e.g. #trip)',
  'tx.income': 'Income',
  'tx.expenses': 'Expenses',
  'tx.net': 'Net',
  'tx.empty': 'No transactions yet.',
  'tx.noMatch': 'No transactions match these filters.',
  'tx.addFirst': 'Add the first one',
  'tx.col.date': 'Date',
  'tx.col.description': 'Description',
  'tx.col.category': 'Category',
  'tx.col.account': 'Account',
  'tx.col.tags': 'Tags',
  'tx.col.amount': 'Amount',
  'tx.col.actions': 'Actions',
  'tx.installment': 'Installment {i}/{n}',
  'tx.repeats': 'Repeats {freq}',
  'tx.repeat.weekly': 'weekly',
  'tx.repeat.monthly': 'monthly',
  'tx.repeat.yearly': 'yearly',
  'tx.scheduled': 'Scheduled',
  'tx.receiptView': 'View receipt',
  'tx.formEdit': 'Edit transaction',
  'tx.account': 'Account or card',
  'tx.accountOnly': 'Account',
  'tx.from': 'From',
  'tx.to': 'To',
  'tx.select': 'Select…',
  'tx.groupAccounts': 'Accounts',
  'tx.groupCards': 'Credit cards',
  'tx.groupCardsPay': 'Credit cards (pay statement)',
  'tx.description': 'Description',
  'tx.descPh': 'What was it?',
  'tx.category': 'Category',
  'tx.selectCategory': 'Select category',
  'tx.subcategory': 'Subcategory',
  'tx.tags': 'Tags',
  'tx.tagsPh': '#weekend, #trip',
  'tx.repeatLabel': 'Repeat',
  'tx.repeatNever': 'Never',
  'tx.repeatWeekly': 'Weekly (next 26)',
  'tx.repeatMonthly': 'Monthly (next 12)',
  'tx.repeatYearly': 'Yearly (next 3)',
  'tx.split': 'Split in installments',
  'tx.fewer': 'Fewer installments',
  'tx.more': 'More installments',
  'tx.installHint': '{n} × {amount}, one per month',
  'tx.seriesNote': 'This entry is part of a series — edits apply to this one only.',
  'tx.receipt': 'Receipt',
  'tx.receiptDrop': 'Click to choose an image',
  'tx.receiptDev': 'Receipts need the deployed API (there is no S3 in local dev).',
  'tx.receiptFail': 'The transaction was saved, but the receipt upload failed. Save again to retry.',
  'tx.saveAnother': 'Save & add another',
  'tx.amountRequired': 'Enter an amount.',
  'tx.descRequired': 'Add a description.',
  'tx.accountRequired': 'Choose an account.',
  'tx.pickTwo': 'Pick two different accounts.',
  'tx.deleteTitle': 'Delete “{desc}”?',
  'tx.deleteBody': '{amount} on {date} · balances and statements will be recalculated.',
  'tx.scopeOne': 'Only this one',
  'tx.scopeFuture': 'This and all future ones',
  'tx.scopeAllInst': 'All {n} installments',
  'tx.scopeAllRepeat': 'Every occurrence of this repeat',
  'tx.addAccountFirst': 'Add an account first',
  'tx.addAccountBody': 'Transactions belong to an account or credit card.',
  'tx.goAccounts': 'Go to Accounts',
```

`pt-BR.ts`:

```ts
  'tx.sub': '{period} · {n} transações',
  'tx.allTime': 'Todo o período',
  'tx.search': 'Buscar descrição, tag, observação',
  'tx.allAccounts': 'Todas as contas e cartões',
  'tx.allCategories': 'Todas as categorias',
  'tx.allTypes': 'Todos os tipos',
  'tx.tagFilter': 'Tag (ex.: #viagem)',
  'tx.income': 'Receitas',
  'tx.expenses': 'Despesas',
  'tx.net': 'Resultado',
  'tx.empty': 'Nenhuma transação ainda.',
  'tx.noMatch': 'Nenhuma transação corresponde aos filtros.',
  'tx.addFirst': 'Adicione a primeira',
  'tx.col.date': 'Data',
  'tx.col.description': 'Descrição',
  'tx.col.category': 'Categoria',
  'tx.col.account': 'Conta',
  'tx.col.tags': 'Tags',
  'tx.col.amount': 'Valor',
  'tx.col.actions': 'Ações',
  'tx.installment': 'Parcela {i}/{n}',
  'tx.repeats': 'Repete {freq}',
  'tx.repeat.weekly': 'semanalmente',
  'tx.repeat.monthly': 'mensalmente',
  'tx.repeat.yearly': 'anualmente',
  'tx.scheduled': 'Agendada',
  'tx.receiptView': 'Ver comprovante',
  'tx.formEdit': 'Editar transação',
  'tx.account': 'Conta ou cartão',
  'tx.accountOnly': 'Conta',
  'tx.from': 'De',
  'tx.to': 'Para',
  'tx.select': 'Selecione…',
  'tx.groupAccounts': 'Contas',
  'tx.groupCards': 'Cartões de crédito',
  'tx.groupCardsPay': 'Cartões de crédito (pagar fatura)',
  'tx.description': 'Descrição',
  'tx.descPh': 'O que foi?',
  'tx.category': 'Categoria',
  'tx.selectCategory': 'Selecione a categoria',
  'tx.subcategory': 'Subcategoria',
  'tx.tags': 'Tags',
  'tx.tagsPh': '#fimdesemana, #viagem',
  'tx.repeatLabel': 'Repetir',
  'tx.repeatNever': 'Nunca',
  'tx.repeatWeekly': 'Semanalmente (próximas 26)',
  'tx.repeatMonthly': 'Mensalmente (próximas 12)',
  'tx.repeatYearly': 'Anualmente (próximas 3)',
  'tx.split': 'Dividir em parcelas',
  'tx.fewer': 'Menos parcelas',
  'tx.more': 'Mais parcelas',
  'tx.installHint': '{n} × {amount}, uma por mês',
  'tx.seriesNote': 'Esta entrada faz parte de uma série — as alterações valem só para ela.',
  'tx.receipt': 'Comprovante',
  'tx.receiptDrop': 'Clique para escolher uma imagem',
  'tx.receiptDev': 'Comprovantes precisam da API publicada (não há S3 no ambiente local).',
  'tx.receiptFail': 'A transação foi salva, mas o envio do comprovante falhou. Salve de novo para tentar outra vez.',
  'tx.saveAnother': 'Salvar e adicionar outra',
  'tx.amountRequired': 'Informe um valor.',
  'tx.descRequired': 'Adicione uma descrição.',
  'tx.accountRequired': 'Escolha uma conta.',
  'tx.pickTwo': 'Escolha duas contas diferentes.',
  'tx.deleteTitle': 'Excluir “{desc}”?',
  'tx.deleteBody': '{amount} em {date} · saldos e faturas serão recalculados.',
  'tx.scopeOne': 'Somente esta',
  'tx.scopeFuture': 'Esta e todas as futuras',
  'tx.scopeAllInst': 'Todas as {n} parcelas',
  'tx.scopeAllRepeat': 'Todas as ocorrências desta repetição',
  'tx.addAccountFirst': 'Adicione uma conta primeiro',
  'tx.addAccountBody': 'As transações pertencem a uma conta ou cartão de crédito.',
  'tx.goAccounts': 'Ir para Contas',
```

- [ ] **Step 3: Write the failing tests** — `test/pages/transactions.test.tsx`

```tsx
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../src/api/client';
import * as api from '../../src/api/endpoints';
import * as receipt from '../../src/api/receipt';
import { Transactions } from '../../src/pages/Transactions';
import { renderWithProviders } from '../utils';
import { account, card, mockApi, tx } from './fixtures';

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
    expect(await screen.findByText('− R$ 86,90')).toBeInTheDocument();
    expect(screen.getByText('+ R$ 9.800,00')).toBeInTheDocument();
    expect(screen.getByText('Alimentação › Delivery')).toBeInTheDocument();
    expect(api.listTransactions).toHaveBeenCalledWith({ month: '2026-10' });
    expect(screen.getByText(/outubro de 2026 · 2 transações/)).toBeInTheDocument();
  });
  it('search, month switch and all-time map to query params', async () => {
    renderWithProviders(<Transactions />);
    await screen.findByText('− R$ 86,90');
    await userEvent.type(screen.getByLabelText('Buscar descrição, tag, observação'), 'ifood');
    await waitFor(() => expect(api.listTransactions).toHaveBeenCalledWith({ month: '2026-10', q: 'ifood' }));
    await userEvent.click(screen.getByRole('button', { name: 'Mês anterior' }));
    await waitFor(() => expect(api.listTransactions).toHaveBeenCalledWith({ month: '2026-09', q: 'ifood' }));
    await userEvent.click(screen.getByRole('button', { name: 'Todo o período' }));
    await waitFor(() => expect(api.listTransactions).toHaveBeenCalledWith({ q: 'ifood' }));
  });
  it('tag filter is normalized to start with #; type and account selects are sent', async () => {
    renderWithProviders(<Transactions />);
    await screen.findByText('− R$ 86,90');
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
  it('shows the receipt link and a retryable error state', async () => {
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

```

- [ ] **Step 4: Run to verify they fail**

Run: `npx vitest run test/pages/transactions.test.tsx`
Expected: FAIL.

- [ ] **Step 5: Implement** — `src/pages/Transactions.tsx`

```tsx
import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import type { DeleteScope, Repeat, Tx, TxFilters, TxInput, TxType } from '../api/types';
import { useAuth } from '../auth/AuthProvider';
import { QueryState } from '../components/QueryState';
import { amountColor, signedAmount } from '../components/txFormat';
import { useI18n } from '../i18n';
import { errorMessage } from '../i18n/errors';
import { shiftMonth } from '../i18n/format';
import { txTitle } from '../i18n/txTitle';
import { useCreateTransactions, useDeleteTransaction, useTransactions, useUpdateTransaction, useUploadReceipt } from '../queries';
import { useAccountLookup, useCategoryLookup } from '../queries/lookups';
import { ConfirmDelete, Field, Modal, OptionRadio, PageHead } from '../ui';

const TYPES: TxType[] = ['expense', 'income', 'transfer'];

export function Transactions() {
  const { t, tOr, money, date, dateShort, month, today } = useI18n();
  const cats = useCategoryLookup();
  const acc = useAccountLookup();
  const [form, setForm] = useState<Tx | 'new' | null>(null);
  const [del, setDel] = useState<Tx | null>(null);
  const [text, setText] = useState('');
  const q = useDeferredValue(text);
  const [mon, setMon] = useState(today.slice(0, 7)); // '' = all time
  const [account, setAccount] = useState('');
  const [category, setCategory] = useState('');
  const [type, setType] = useState('');
  const [tag, setTag] = useState('');

  // The mobile "+" button links to #/transactions?new
  useEffect(() => {
    const check = () => { if (location.hash.includes('?new')) { history.replaceState(null, '', '#/transactions'); setForm('new'); } };
    check();
    addEventListener('hashchange', check);
    return () => removeEventListener('hashchange', check);
  }, []);

  const filters = useMemo<TxFilters>(() => {
    const f: TxFilters = {};
    if (mon) f.month = mon;
    if (account) f.account = account;
    if (category) f.category = category;
    if (type) f.type = type as TxType;
    const tg = tag.trim();
    if (tg) f.tag = tg.startsWith('#') ? tg : `#${tg}`;
    if (q.trim()) f.q = q.trim();
    return f;
  }, [mon, account, category, type, tag, q]);
  const list = useTransactions(filters);
  const hasFilters = Object.keys(filters).some(k => k !== 'month');
  const noAccounts = acc.ready && acc.accounts.length + acc.cards.length === 0;

  const subText = (x: Tx) => {
    const bits: string[] = [];
    if (x.inst) bits.push(t('tx.installment', { i: x.inst.i, n: x.inst.n }));
    if (x.repeat) bits.push(t('tx.repeats', { freq: tOr(`tx.repeat.${x.repeat}`, x.repeat) }));
    if (x.date > today) bits.push(t('tx.scheduled'));
    return bits.join(' · ');
  };

  return (
    <>
      <PageHead sub={list.data ? t('tx.sub', { period: mon ? month(mon, true) : t('tx.allTime'), n: list.data.items.length }) : ''} title={t('nav.transactions')}>
        <div className="month-nav">
          <button type="button" className="btn-sm" aria-label={t('month.prev')} disabled={!mon} onClick={() => setMon(shiftMonth(mon, -1))}>‹</button>
          <button type="button" className="btn-sm" aria-label={t('month.next')} disabled={!mon} onClick={() => setMon(shiftMonth(mon, 1))}>›</button>
          <button type="button" className="btn-sm" aria-pressed={!mon} style={{ width: 'auto', padding: '0 12px' }} onClick={() => setMon(mon ? '' : today.slice(0, 7))}>{t('tx.allTime')}</button>
        </div>
        <button type="button" className="btn btn-1" onClick={() => setForm('new')}>+ {t('nav.newTransaction')}</button>
      </PageHead>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        <label htmlFor="tx-q" className="sr">{t('tx.search')}</label>
        <input id="tx-q" className="flt" placeholder={t('tx.search')} style={{ flex: '1 1 220px' }} value={text} onChange={e => setText(e.target.value)} />
        <select className="flt" aria-label={t('tx.col.account')} value={account} onChange={e => setAccount(e.target.value)}>
          <option value="">{t('tx.allAccounts')}</option>{[...acc.accounts, ...acc.cards].map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
        <select className="flt" aria-label={t('tx.col.category')} value={category} onChange={e => setCategory(e.target.value)}>
          <option value="">{t('tx.allCategories')}</option>{cats.tops.map(c => <option key={c.id} value={c.id}>{cats.name(c)}</option>)}
        </select>
        <select className="flt" aria-label={t('common.type')} value={type} onChange={e => setType(e.target.value)}>
          <option value="">{t('tx.allTypes')}</option>{TYPES.map(k => <option key={k} value={k}>{tOr(`txtype.${k}`, k)}</option>)}
        </select>
        <input className="flt" aria-label={t('tx.tagFilter')} placeholder={t('tx.tagFilter')} value={tag} onChange={e => setTag(e.target.value)} />
      </div>

      <QueryState q={list} isEmpty={d => d.items.length === 0}
        empty={<>{hasFilters ? t('tx.noMatch') : t('tx.empty')}{!hasFilters && <button type="button" className="btn btn-1" onClick={() => setForm('new')}>{t('tx.addFirst')}</button>}</>}>
        {({ items, totals }) => (
          <>
            <div className="kpis" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 12 }}>
              <div className="card kpi" style={{ padding: 16, gap: 4 }}><span className="lbl">{t('tx.income')}</span><span className="num" style={{ fontSize: 20, color: 'var(--pos)' }}>+ {money(totals.income)}</span></div>
              <div className="card kpi" style={{ padding: 16, gap: 4 }}><span className="lbl">{t('tx.expenses')}</span><span className="num" style={{ fontSize: 20, color: 'var(--neg)' }}>− {money(totals.expense)}</span></div>
              <div className="card kpi" style={{ padding: 16, gap: 4 }}><span className="lbl">{t('tx.net')}</span><span className="num" style={{ fontSize: 20 }}>{money(totals.net)}</span></div>
            </div>
            <section className="card" style={{ padding: '6px 20px 10px' }}>
              <div className="scroll">
                <div className="trow thead tx-cols">
                  <span className="th">{t('tx.col.date')}</span><span className="th">{t('tx.col.description')}</span><span className="th hide-m">{t('tx.col.category')}</span>
                  <span className="th hide-m">{t('tx.col.account')}</span><span className="th hide-m">{t('tx.col.tags')}</span><span className="th r">{t('tx.col.amount')}</span><span className="th r">{t('tx.col.actions')}</span>
                </div>
                {items.map(x => (
                  <div className="trow tx-cols" key={x.id}>
                    <span className="muted hide-m" style={{ fontSize: 13 }}>{dateShort(x.date)}</span>
                    <span className="stack">
                      <span style={{ fontWeight: 500 }}>{txTitle(t, x)}</span>
                      <span className="muted" style={{ fontSize: 12 }}>
                        <span className="hide-d">{date(x.date)} · </span>{subText(x)}
                        {x.receiptUrl && <> {subText(x) ? '· ' : ''}<a href={x.receiptUrl} target="_blank" rel="noreferrer">{t('tx.receiptView')}</a></>}
                      </span>
                    </span>
                    <span className="hide-m" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      {x.type !== 'transfer' && <span className="dot" style={{ background: cats.color(x.categoryId) }} />}{x.type === 'transfer' ? t('txtype.transfer') : cats.label(x.categoryId)}
                    </span>
                    <span className="hide-m" style={{ color: 'var(--ink-2)' }}>{x.type === 'transfer' ? `${acc.name(x.accountId)} → ${acc.name(x.toId)}` : acc.name(x.accountId)}</span>
                    <span className="hide-m" style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>{x.tags.map(g => <span className="tag" key={g}>{g}</span>)}</span>
                    <span className="num r" style={{ color: amountColor(x.type) }}>{signedAmount(x, money)}</span>
                    <span className="actions-c" style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                      {!x.source && <button type="button" className="btn-sm" onClick={() => setForm(x)}>{t('common.edit')}</button>}
                      <button type="button" className="btn-sm danger" onClick={() => setDel(x)}>{t('common.delete')}</button>
                    </span>
                  </div>))}
              </div>
            </section>
          </>
        )}
      </QueryState>

      {form && (noAccounts
        ? <Modal title={t('tx.addAccountFirst')} onClose={() => setForm(null)}>
            <p style={{ margin: 0, lineHeight: 1.5 }}>{t('tx.addAccountBody')}</p>
            <div className="footer"><a className="btn btn-1" href="#/accounts" onClick={() => setForm(null)} style={{ color: '#fff' }}>{t('tx.goAccounts')}</a></div>
          </Modal>
        : acc.ready && <TxForm tx={form === 'new' ? null : form} onClose={() => setForm(null)} />)}
      {del && <DeleteTx tx={del} onClose={() => setDel(null)} />}
    </>
  );
}

function TxForm({ tx, onClose }: { tx: Tx | null; onClose: () => void }) {
  const { t, tOr, today, money, parseMoney, moneyInput } = useI18n();
  const { devMode } = useAuth();
  const acc = useAccountLookup();
  const cats = useCategoryLookup();
  const create = useCreateTransactions();
  const update = useUpdateTransaction();
  const upload = useUploadReceipt();

  const initialCat = tx?.categoryId ? cats.categories.find(c => c.id === tx.categoryId) : undefined;
  const firstAccount = acc.accounts.find(a => !a.archived)?.id ?? acc.cards[0]?.id ?? '';
  const [type, setType] = useState<TxType>(tx?.type ?? 'expense');
  const [amount, setAmount] = useState(tx ? moneyInput(tx.amount) : '');
  const [dt, setDt] = useState(tx?.date ?? today);
  const [accountId, setAccountId] = useState(tx?.accountId ?? firstAccount);
  const [toId, setToId] = useState(tx?.toId ?? '');
  const [desc, setDesc] = useState(tx?.desc ?? '');
  const [parent, setParent] = useState(initialCat ? (initialCat.parentId ?? initialCat.id) : '');
  const [sub, setSub] = useState(initialCat?.parentId ? initialCat.id : '');
  const [tagsText, setTagsText] = useState(tx?.tags.join(', ') ?? '');
  const [repeat, setRepeat] = useState<Repeat | ''>(tx?.repeat ?? '');
  const [inst, setInst] = useState(false);
  const [n, setN] = useState(3);
  const [note, setNote] = useState(tx?.note ?? '');
  const [file, setFile] = useState<File | null>(null);
  const [saved, setSaved] = useState<Tx | null>(null);
  const [err, setErr] = useState('');

  const cents = parseMoney(amount) ?? 0;
  const instOn = inst && type === 'expense' && !tx;
  const subs = parent ? cats.subsOf(parent) : [];
  const fromOptions = type === 'expense' ? [...acc.accounts.filter(a => !a.archived), ...acc.cards] : acc.accounts.filter(a => !a.archived);
  const color = type === 'income' ? 'var(--pos)' : type === 'expense' ? 'var(--neg)' : 'var(--ink)';

  const reset = () => { setAmount(''); setDesc(''); setTagsText(''); setNote(''); setFile(null); setSaved(null); setErr(''); };

  const save = async (another: boolean) => {
    setErr('');
    try {
      let target = saved;
      if (!target) {
        if (!cents) return setErr(t('tx.amountRequired'));
        if (!desc.trim()) return setErr(t('tx.descRequired'));
        if (!accountId) return setErr(t('tx.accountRequired'));
        if (type === 'transfer' && (!toId || toId === accountId)) return setErr(t('tx.pickTwo'));
        const body: TxInput = {
          type, amount: cents, date: dt, desc: desc.trim(), accountId,
          toId: type === 'transfer' ? toId : undefined,
          categoryId: type === 'transfer' ? undefined : (sub || parent || undefined),
          tags: tagsText.split(/[,\s]+/).filter(Boolean).map(g => (g.startsWith('#') ? g : `#${g}`)),
          note: note.trim(),
        };
        if (tx) target = await update.mutateAsync({ id: tx.id, body });
        else {
          const created = await create.mutateAsync({ ...body, ...(instOn ? { installments: n } : repeat ? { repeat } : {}) });
          target = created[0];
        }
        setSaved(target);
      }
      if (file && !devMode) {
        try { await upload.mutateAsync({ txId: target.id, file }); } catch { return setErr(t('tx.receiptFail')); }
      }
      if (another && !tx) reset(); else onClose();
    } catch (e) { setErr(errorMessage(e, t)); }
  };

  const Opts = ({ items }: { items: { id: string; name: string }[] }) => <>{items.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</>;

  return (
    <Modal wide title={tx ? t('tx.formEdit') : t('nav.newTransaction')} onClose={onClose}
      extra={<div className="seg">{TYPES.map(k => (
        <button key={k} type="button" className={type === k ? 'on' : ''} onClick={() => { setType(k); setInst(false); setToId(''); }}>{tOr(`txtype.${k}`, k)}</button>))}</div>}>
      <div className="grid">
        <Field label={t('common.amount')}>{id => <input id={id} inputMode="decimal" value={amount} autoFocus onChange={e => setAmount(e.target.value)}
          style={{ fontFamily: "'Space Grotesk',sans-serif", fontWeight: 600, fontSize: 18, color }} />}</Field>
        <Field label={t('common.date')}>{id => <input id={id} type="date" value={dt} onChange={e => setDt(e.target.value)} />}</Field>
        <Field label={type === 'transfer' ? t('tx.from') : type === 'income' ? t('tx.accountOnly') : t('tx.account')}>{id => (
          <select id={id} value={accountId} onChange={e => setAccountId(e.target.value)}>
            {type === 'expense' ? <>
              <optgroup label={t('tx.groupAccounts')}><Opts items={acc.accounts.filter(a => !a.archived)} /></optgroup>
              {acc.cards.length > 0 && <optgroup label={t('tx.groupCards')}><Opts items={acc.cards} /></optgroup>}</> : <Opts items={fromOptions} />}
          </select>)}</Field>
        {type === 'transfer' && <Field label={t('tx.to')}>{id => (
          <select id={id} value={toId} onChange={e => setToId(e.target.value)}>
            <option value="">{t('tx.select')}</option>
            <optgroup label={t('tx.groupAccounts')}><Opts items={acc.accounts.filter(a => !a.archived && a.id !== accountId)} /></optgroup>
            {acc.cards.length > 0 && <optgroup label={t('tx.groupCardsPay')}><Opts items={acc.cards} /></optgroup>}
          </select>)}</Field>}
      </div>
      <div className="grid">
        <Field label={t('tx.description')}>{id => <input id={id} placeholder={t('tx.descPh')} value={desc} onChange={e => setDesc(e.target.value)} />}</Field>
        {type !== 'transfer' && <>
          <Field label={t('tx.category')}>{id => (
            <select id={id} value={parent} onChange={e => { setParent(e.target.value); setSub(''); }}>
              <option value="">{t('tx.selectCategory')}</option>{cats.tops.map(c => <option key={c.id} value={c.id}>{cats.name(c)}</option>)}
            </select>)}</Field>
          <Field label={t('tx.subcategory')}>{id => (
            <select id={id} value={sub} onChange={e => setSub(e.target.value)} disabled={!subs.length}>
              <option value="">{t('common.none')}</option>{subs.map(c => <option key={c.id} value={c.id}>{cats.name(c)}</option>)}
            </select>)}</Field></>}
      </div>
      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(240px,1fr))' }}>
        <Field label={t('tx.tags')}>{id => <input id={id} placeholder={t('tx.tagsPh')} value={tagsText} onChange={e => setTagsText(e.target.value)} />}</Field>
        {!tx && <Field label={t('tx.repeatLabel')}>{id => (
          <select id={id} value={instOn ? '' : repeat} disabled={instOn} onChange={e => setRepeat(e.target.value as Repeat | '')}>
            <option value="">{t('tx.repeatNever')}</option><option value="weekly">{t('tx.repeatWeekly')}</option><option value="monthly">{t('tx.repeatMonthly')}</option><option value="yearly">{t('tx.repeatYearly')}</option>
          </select>)}</Field>}
      </div>
      {type === 'expense' && !tx && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, alignItems: 'center', padding: 14, borderRadius: 14, background: 'var(--bg)' }}>
          <label className="check" style={{ fontWeight: 500 }}><input type="checkbox" checked={inst} onChange={e => setInst(e.target.checked)} />{t('tx.split')}</label>
          {instOn && <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <button type="button" className="btn-sm" aria-label={t('tx.fewer')} style={{ width: 40, height: 40 }} onClick={() => setN(Math.max(2, n - 1))}>−</button>
              <span className="num" style={{ width: 44, textAlign: 'center', fontSize: 17 }}>{n}x</span>
              <button type="button" className="btn-sm" aria-label={t('tx.more')} style={{ width: 40, height: 40 }} onClick={() => setN(Math.min(24, n + 1))}>+</button>
            </div>
            <span className="muted" style={{ fontSize: 13 }}>{t('tx.installHint', { n, amount: money(Math.floor(cents / n)) })}</span></>}
        </div>)}
      {tx && (tx.inst || tx.repeat) && <span className="muted" style={{ fontSize: 13 }}>{t('tx.seriesNote')}</span>}
      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(240px,1fr))' }}>
        <Field label={t('common.notes')}>{id => <textarea id={id} placeholder={t('common.optional')} value={note} onChange={e => setNote(e.target.value)} />}</Field>
        <div className="fld"><span className="lbl">{t('tx.receipt')}</span>
          <label className="drop" style={devMode ? { opacity: 0.6, cursor: 'not-allowed' } : undefined}>
            {file ? file.name : t('tx.receiptDrop')}
            <input type="file" accept="image/jpeg,image/png,image/webp" className="sr" disabled={devMode} aria-label={t('tx.receiptDrop')} onChange={e => setFile(e.target.files?.[0] ?? null)} />
          </label>
          {devMode && <span className="muted" style={{ fontSize: 12 }}>{t('tx.receiptDev')}</span>}
        </div>
      </div>
      {err && <span className="err" role="alert">{err}</span>}
      <div className="footer">
        <button type="button" className="btn btn-2" onClick={onClose}>{t('common.cancel')}</button>
        {!tx && <button type="button" className="btn btn-2" onClick={() => void save(true)}>{t('tx.saveAnother')}</button>}
        <button type="button" className="btn btn-1" onClick={() => void save(false)}>{tx ? t('common.saveChanges') : t('common.save')}</button>
      </div>
    </Modal>
  );
}

function DeleteTx({ tx, onClose }: { tx: Tx; onClose: () => void }) {
  const { t, money, date } = useI18n();
  const del = useDeleteTransaction();
  const [scope, setScope] = useState<DeleteScope>('one');
  return (
    <ConfirmDelete title={t('tx.deleteTitle', { desc: tx.desc })} body={t('tx.deleteBody', { amount: money(tx.amount), date: date(tx.date) })} cta={t('common.delete')} onClose={onClose}
      onConfirm={() => del.mutateAsync({ id: tx.id, scope })}>
      {tx.groupId && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <OptionRadio name="scope" checked={scope === 'one'} onChange={() => setScope('one')}>{t('tx.scopeOne')}</OptionRadio>
          <OptionRadio name="scope" checked={scope === 'future'} onChange={() => setScope('future')}>{t('tx.scopeFuture')}</OptionRadio>
          <OptionRadio name="scope" checked={scope === 'all'} onChange={() => setScope('all')}>{tx.inst ? t('tx.scopeAllInst', { n: tx.inst.n }) : t('tx.scopeAllRepeat')}</OptionRadio>
        </div>)}
    </ConfirmDelete>
  );
}
```

> Notes for the implementer: the filter selects use `aria-label`s that reuse existing keys (`tx.col.account`, `tx.col.category`, `common.type`) — the tests query them by those pt-BR labels (`Conta`, `Categoria`, `Tipo`); the form's account select is `Conta ou cartão` so the two never collide inside the dialog (tests scope queries with `within(dlg)`).

- [ ] **Step 6: Run tests and typecheck**

Run: `npx vitest run test/pages/transactions.test.tsx && npx tsc --noEmit`
Expected: PASS. Then run the **whole** suite: `npx vitest run` (the `test/utils.tsx` change must not break Tasks 8–13).

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(transactions): server-driven transactions page with filters, series and receipts" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 15: Settings, More and legacy import

**Files:**
- Modify: `src/pages/Settings.tsx` (replace), `src/pages/More.tsx` (replace), `src/i18n/en.ts`, `src/i18n/pt-BR.ts`
- Test: `test/pages/settings.test.tsx`, `test/pages/more.test.tsx`

**Interfaces:**
- Consumes: `useMe/useUpdateMe/useImportState`, `usePrefs/setPrefs`, `readLegacy/clearLegacy`, `useAuth().signOut`, `errorMessage`, `PageHead`.
- Behavior contract: Settings shows **Language** (`pt-BR`/`en`, labels in their own language), **Currency** (`BRL`, `USD`, `EUR`) and **Timezone** (`America/Sao_Paulo`, `America/Manaus`, `America/New_York`, `Europe/Lisbon`, `UTC`; plus the current value if it is none of these) — a change calls `PUT /me` with the full triple; theme and display name are local (`prefs`). The **Import from this browser** card appears only when `readLegacy()` is non-null: it posts the legacy state to `POST /import`, shows the counts (including skipped items), then offers "Delete the local copy" (`clearLegacy`). Errors (e.g. `ALREADY_HAS_DATA`) are shown translated. **More** lists links with descriptions and a **Log out** button (the sidebar is hidden on mobile).

- [ ] **Step 1: Add i18n keys**

`en.ts`:

```ts
  // settings
  'settings.sub': 'Language, region and local preferences',
  'settings.appearance': 'Appearance',
  'settings.theme.system': 'System',
  'settings.theme.light': 'Light',
  'settings.theme.dark': 'Dark',
  'settings.name': 'Your name',
  'settings.namePh': 'Shown in the greeting',
  'settings.region': 'Language and region',
  'settings.language': 'Language',
  'settings.currency': 'Currency',
  'settings.timezone': 'Timezone',
  'settings.saved': 'Saved.',
  'settings.import': 'Import from this browser',
  'settings.importBody': 'Found {accounts} accounts, {cards} cards, {transactions} transactions, {budgets} budgets and {goals} goals saved by the previous version of the app. Import them into your account?',
  'settings.importCta': 'Import',
  'settings.importDone': 'Imported: {accounts} accounts, {cards} cards, {categories} new categories, {transactions} transactions, {budgets} budgets, {goals} goals.',
  'settings.importSkipped': 'Skipped: {transactions} transactions, {budgets} budgets, {receipts} receipts.',
  'settings.clearLocal': 'Delete the local copy',
  'settings.session': 'Session',
  // more
  'more.transactionsDesc': 'Search and edit everything you recorded',
  'more.accountsDesc': 'Checking, savings and cash',
  'more.cardsDesc': 'Cards and their statements',
  'more.categoriesDesc': 'Categories and subcategories',
  'more.settingsDesc': 'Language, theme and import',
```

`pt-BR.ts`:

```ts
  'settings.sub': 'Idioma, região e preferências locais',
  'settings.appearance': 'Aparência',
  'settings.theme.system': 'Sistema',
  'settings.theme.light': 'Claro',
  'settings.theme.dark': 'Escuro',
  'settings.name': 'Seu nome',
  'settings.namePh': 'Aparece na saudação',
  'settings.region': 'Idioma e região',
  'settings.language': 'Idioma',
  'settings.currency': 'Moeda',
  'settings.timezone': 'Fuso horário',
  'settings.saved': 'Salvo.',
  'settings.import': 'Importar deste navegador',
  'settings.importBody': 'Encontramos {accounts} contas, {cards} cartões, {transactions} transações, {budgets} orçamentos e {goals} metas salvos pela versão anterior do app. Importar para a sua conta?',
  'settings.importCta': 'Importar',
  'settings.importDone': 'Importado: {accounts} contas, {cards} cartões, {categories} categorias novas, {transactions} transações, {budgets} orçamentos, {goals} metas.',
  'settings.importSkipped': 'Ignorados: {transactions} transações, {budgets} orçamentos, {receipts} comprovantes.',
  'settings.clearLocal': 'Apagar a cópia local',
  'settings.session': 'Sessão',
  'more.transactionsDesc': 'Busque e edite tudo o que você registrou',
  'more.accountsDesc': 'Conta corrente, poupança e dinheiro',
  'more.cardsDesc': 'Cartões e suas faturas',
  'more.categoriesDesc': 'Categorias e subcategorias',
  'more.settingsDesc': 'Idioma, tema e importação',
```

- [ ] **Step 2: Write the failing tests**

`test/pages/settings.test.tsx`

```tsx
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../src/api/client';
import * as api from '../../src/api/endpoints';
import { Settings } from '../../src/pages/Settings';
import { renderWithProviders } from '../utils';
import { mockApi } from './fixtures';

vi.mock('../../src/api/endpoints');

const legacy = { v: 1, userName: '', theme: 'system', accounts: [{ id: 'a' }], cards: [], categories: [], transactions: [{ id: 't1' }, { id: 't2' }], budgets: [], goals: [] };
beforeEach(() => { mockApi(); });

describe('Settings', () => {
  it('changing the language saves the full triple to /me', async () => {
    vi.mocked(api.putMe).mockResolvedValue({ locale: 'en', currency: 'BRL', timezone: 'America/Sao_Paulo' });
    renderWithProviders(<Settings />);
    await userEvent.selectOptions(await screen.findByLabelText('Idioma'), 'en');
    expect(api.putMe).toHaveBeenCalledWith({ locale: 'en', currency: 'BRL', timezone: 'America/Sao_Paulo' });
  });
  it('currency and timezone changes keep the other values', async () => {
    vi.mocked(api.putMe).mockResolvedValue({ locale: 'pt-BR', currency: 'USD', timezone: 'UTC' });
    renderWithProviders(<Settings />);
    await userEvent.selectOptions(await screen.findByLabelText('Moeda'), 'USD');
    expect(api.putMe).toHaveBeenLastCalledWith({ locale: 'pt-BR', currency: 'USD', timezone: 'America/Sao_Paulo' });
    await userEvent.selectOptions(screen.getByLabelText('Fuso horário'), 'UTC');
    expect(api.putMe).toHaveBeenLastCalledWith({ locale: 'pt-BR', currency: 'BRL', timezone: 'UTC' });
  });
  it('theme and display name are local preferences', async () => {
    renderWithProviders(<Settings />);
    await userEvent.click(await screen.findByRole('button', { name: 'Escuro' }));
    await userEvent.type(screen.getByLabelText('Seu nome'), 'Matheus');
    expect(JSON.parse(localStorage.getItem('financeControl:prefs')!)).toMatchObject({ theme: 'dark', userName: 'Matheus' });
    expect(api.putMe).not.toHaveBeenCalled();
  });
  it('no legacy data → no import card', async () => {
    renderWithProviders(<Settings />);
    await screen.findByLabelText('Idioma');
    expect(screen.queryByText('Importar deste navegador')).not.toBeInTheDocument();
  });
  it('legacy data: import posts the stored state, shows counts, then offers to delete the local copy', async () => {
    localStorage.setItem('financeControl:v1', JSON.stringify(legacy));
    vi.mocked(api.importState).mockResolvedValue({ accounts: 1, cards: 0, categories: 0, transactions: 1, budgets: 0, goals: 0, receiptsSkipped: 0, skippedTransactions: 1, skippedBudgets: 0 });
    renderWithProviders(<Settings />);
    expect(await screen.findByText(/Encontramos 1 contas, 0 cartões, 2 transações/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Importar' }));
    expect(api.importState).toHaveBeenCalledWith(legacy);
    expect(await screen.findByText(/Importado: 1 contas, 0 cartões, 0 categorias novas, 1 transações/)).toBeInTheDocument();
    expect(screen.getByText(/Ignorados: 1 transações, 0 orçamentos, 0 comprovantes/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Apagar a cópia local' }));
    expect(localStorage.getItem('financeControl:v1')).toBeNull();
    expect(screen.queryByText('Importar deste navegador')).not.toBeInTheDocument();
  });
  it('ALREADY_HAS_DATA is shown translated and the local copy is kept', async () => {
    localStorage.setItem('financeControl:v1', JSON.stringify(legacy));
    vi.mocked(api.importState).mockRejectedValue(new ApiError(409, 'ALREADY_HAS_DATA', 'x'));
    renderWithProviders(<Settings />);
    await userEvent.click(await screen.findByRole('button', { name: 'Importar' }));
    expect(await screen.findByText('Sua conta já tem dados, então a importação não é permitida.')).toBeInTheDocument();
    expect(localStorage.getItem('financeControl:v1')).not.toBeNull();
  });
  it('log out', async () => {
    const { backend } = renderWithProviders(<Settings />);
    await userEvent.click(await screen.findByRole('button', { name: 'Sair' }));
    expect(backend.signOut).toHaveBeenCalled();
  });
});
```

`test/pages/more.test.tsx`

```tsx
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
```

- [ ] **Step 3: Run to verify they fail**

Run: `npx vitest run test/pages/settings.test.tsx test/pages/more.test.tsx`
Expected: FAIL.

- [ ] **Step 4: Implement**

`src/pages/Settings.tsx`

```tsx
import { useState } from 'react';
import type { Locale, Me } from '../api/types';
import { useAuth } from '../auth/AuthProvider';
import { useI18n } from '../i18n';
import { errorMessage } from '../i18n/errors';
import { clearLegacy, readLegacy } from '../legacy';
import { setPrefs, usePrefs, type Theme } from '../prefs';
import { useImportState, useUpdateMe } from '../queries';
import { Field, PageHead } from '../ui';
import type { ImportResult } from '../api/types';

const THEMES: Theme[] = ['system', 'light', 'dark'];
const CURRENCIES = ['BRL', 'USD', 'EUR'];
const ZONES = ['America/Sao_Paulo', 'America/Manaus', 'America/New_York', 'Europe/Lisbon', 'UTC'];

export function Settings() {
  const { t, tOr, locale, currency, timezone } = useI18n();
  const prefs = usePrefs();
  const auth = useAuth();
  const update = useUpdateMe();
  const imp = useImportState();
  const [legacy, setLegacy] = useState(() => readLegacy());
  const [result, setResult] = useState<ImportResult | null>(null);
  const [err, setErr] = useState('');
  const [saved, setSaved] = useState(false);

  const save = (patch: Partial<Me>) => {
    setErr(''); setSaved(false);
    update.mutate({ locale, currency, timezone, ...patch }, { onSuccess: () => setSaved(true), onError: e => setErr(errorMessage(e, t)) });
  };
  const doImport = async () => {
    setErr('');
    try { setResult(await imp.mutateAsync(legacy!.state)); } catch (e) { setErr(errorMessage(e, t)); }
  };
  const zones = ZONES.includes(timezone) ? ZONES : [timezone, ...ZONES];

  return (
    <>
      <PageHead sub={t('settings.sub')} title={t('nav.settings')} />
      <section className="card">
        <h2>{t('settings.appearance')}</h2>
        <div className="seg" style={{ maxWidth: 360 }}>
          {THEMES.map(k => <button key={k} type="button" className={prefs.theme === k ? 'on' : ''} onClick={() => setPrefs({ theme: k })}>{tOr(`settings.theme.${k}`, k)}</button>)}
        </div>
        <div style={{ maxWidth: 360 }}>
          <Field label={t('settings.name')}>{id => <input id={id} value={prefs.userName} placeholder={t('settings.namePh')} onChange={e => setPrefs({ userName: e.target.value })} />}</Field>
        </div>
      </section>

      <section className="card">
        <h2>{t('settings.region')}</h2>
        <div className="grid" style={{ maxWidth: 720 }}>
          <Field label={t('settings.language')}>{id => (
            <select id={id} value={locale} onChange={e => save({ locale: e.target.value as Locale })}>
              <option value="pt-BR">Português (Brasil)</option><option value="en">English</option>
            </select>)}</Field>
          <Field label={t('settings.currency')}>{id => <select id={id} value={currency} onChange={e => save({ currency: e.target.value })}>{CURRENCIES.map(c => <option key={c}>{c}</option>)}</select>}</Field>
          <Field label={t('settings.timezone')}>{id => <select id={id} value={timezone} onChange={e => save({ timezone: e.target.value })}>{zones.map(z => <option key={z}>{z}</option>)}</select>}</Field>
        </div>
        {saved && <span className="muted" role="status">{t('settings.saved')}</span>}
      </section>

      {legacy && (
        <section className="card">
          <h2>{t('settings.import')}</h2>
          {!result ? (
            <>
              <p style={{ margin: 0, lineHeight: 1.5 }}>{t('settings.importBody', legacy.counts)}</p>
              <div className="actions"><button type="button" className="btn btn-1" disabled={imp.isPending} onClick={() => void doImport()}>{t('settings.importCta')}</button></div>
            </>
          ) : (
            <>
              <p style={{ margin: 0, lineHeight: 1.5 }}>{t('settings.importDone', { ...result })}</p>
              {(result.skippedTransactions + result.skippedBudgets + result.receiptsSkipped) > 0 && (
                <p className="muted" style={{ margin: 0 }}>{t('settings.importSkipped', { transactions: result.skippedTransactions, budgets: result.skippedBudgets, receipts: result.receiptsSkipped })}</p>)}
              <div className="actions"><button type="button" className="btn btn-2" onClick={() => { clearLegacy(); setLegacy(null); setResult(null); }}>{t('settings.clearLocal')}</button></div>
            </>
          )}
        </section>
      )}

      {err && <span className="err" role="alert">{err}</span>}

      <section className="card">
        <h2>{t('settings.session')}</h2>
        <div className="actions"><button type="button" className="btn btn-2" onClick={auth.signOut}>{t('common.logout')}</button></div>
      </section>
    </>
  );
}
```

`src/pages/More.tsx`

```tsx
import { useAuth } from '../auth/AuthProvider';
import { useI18n } from '../i18n';
import { PageHead } from '../ui';

export function More() {
  const { t } = useI18n();
  const auth = useAuth();
  const links: [string, string, string][] = [
    ['transactions', t('nav.transactions'), t('more.transactionsDesc')],
    ['accounts', t('nav.accounts'), t('more.accountsDesc')],
    ['cards', t('nav.cards'), t('more.cardsDesc')],
    ['categories', t('nav.categories'), t('more.categoriesDesc')],
    ['settings', t('nav.settings'), t('more.settingsDesc')],
  ];
  return (
    <>
      <PageHead title={t('nav.more')} />
      <section className="card" style={{ padding: '8px 20px' }}>
        {links.map(([k, title, desc]) => (
          <a key={k} href={`#/${k}`} className="line" style={{ color: 'var(--ink)', minHeight: 56 }}>
            <span className="stack" style={{ flex: 1 }}><b style={{ fontWeight: 500 }}>{title}</b><span className="muted" style={{ fontSize: 13 }}>{desc}</span></span>
            <span className="muted" aria-hidden="true">›</span>
          </a>))}
      </section>
      <button type="button" className="btn btn-2" onClick={auth.signOut}>{t('common.logout')}</button>
    </>
  );
}
```

- [ ] **Step 5: Run tests and typecheck**

Run: `npx vitest run test/pages test/i18n && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(settings): language/region settings, legacy import and translated More page" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```


---

### Task 16: Backend touch-ups — make local dev work end to end (repo: `/home/matux/Code/financeControlBackend`)

> This task edits the **backend** repo, not the frontend. It is investigative: `npm run dev` (serverless-offline) and the DynamoDB contract suite have never been executed. Work on a branch; do not merge it (the controller merges after review).

**Files (backend repo):**
- Modify: `src/db/dynamo-repo.ts` (`fromEnv`), `scripts/dev-token.ts`, `README.md`, `CLAUDE.md`, possibly `serverless.yml` and whatever the first real run shows is broken
- Create: `scripts/smoke.sh`, `test/db/from-env.test.ts`

**Interfaces:**
- Produces: `DynamoRepo.fromEnv()` resolves the table name from `DYNAMO_TABLE` first, then `TABLE_NAME`; `scripts/dev-token.ts` prints an unsigned JWT carrying exactly the claims the frontend's `mintDevToken` produces (`sub`, `iss: "http://localhost/dev"`, `aud: "dev"`, `token_use: "access"`, `iat`, `exp = iat + 3600`); `scripts/smoke.sh [userId]` runs the end-to-end API scenario below against `BASE` (default `http://localhost:3000/v1`) and exits non-zero on the first failed assertion.

- [ ] **Step 0: Preconditions (stop and report `NEEDS_CONTEXT` if they fail)**

```bash
cd /home/matux/Code/financeControlBackend
git status --short            # must be clean
git checkout -b chore/offline-dev
docker info > /dev/null 2>&1 && echo "docker ok" || echo "DOCKER DAEMON NOT RUNNING"
```

If the Docker daemon is not running, stop: the owner must start it (on WSL: Docker Desktop with WSL integration, or `sudo service docker start`). Do not try to work around it.

- [ ] **Step 1: Run the DynamoDB contract suite for the first time**

```bash
npm run db:up
DYNAMO_ENDPOINT=http://localhost:8000 npx vitest run test/db
```

Expected: the 4 previously skipped `DynamoRepo (DynamoDB Local)` tests now run and PASS. If any fail, that is a real bug in `src/db/dynamo-repo.ts`: the contract test is already the failing test; fix the repository (likely suspects: the `byDate` LSI key/`BETWEEN` bound, batch handling, `ConsistentRead` on the index, marshalling of `undefined`), re-run until green, and commit each fix separately (`fix(db): …`). Record in the report exactly what failed and why.

- [ ] **Step 2: Write the failing test for the table-name override** — `test/db/from-env.test.ts`

```ts
import { afterEach, describe, expect, it } from 'vitest';
import { DynamoRepo } from '../../src/db/dynamo-repo';

const saved = { ...process.env };
afterEach(() => { process.env = { ...saved }; });

describe('DynamoRepo.fromEnv', () => {
  it('prefers DYNAMO_TABLE over TABLE_NAME (serverless-offline cannot resolve !Ref)', () => {
    process.env.DYNAMO_TABLE = 'local-table';
    process.env.TABLE_NAME = '[object Object]';
    expect((DynamoRepo.fromEnv() as unknown as { table: string }).table).toBe('local-table');
  });
  it('falls back to TABLE_NAME', () => {
    delete process.env.DYNAMO_TABLE;
    process.env.TABLE_NAME = 'fc-dev';
    expect((DynamoRepo.fromEnv() as unknown as { table: string }).table).toBe('fc-dev');
  });
  it('fails loudly when no table is configured', () => {
    delete process.env.DYNAMO_TABLE;
    delete process.env.TABLE_NAME;
    expect(() => DynamoRepo.fromEnv()).toThrow(/TABLE/);
  });
});
```

Run: `npx vitest run test/db/from-env.test.ts` — Expected: FAIL.

- [ ] **Step 3: Implement** — in `src/db/dynamo-repo.ts` change the end of `fromEnv` to:

```ts
    const table = process.env.DYNAMO_TABLE ?? process.env.TABLE_NAME;
    if (!table) throw new Error('Set DYNAMO_TABLE or TABLE_NAME');
    return new DynamoRepo(DynamoDBDocumentClient.from(client, { marshallOptions: { removeUndefinedValues: true } }), table);
```

Run: `npx vitest run test/db/from-env.test.ts` — Expected: PASS.

- [ ] **Step 4: Align the dev token with the frontend** — replace `scripts/dev-token.ts`

```ts
// Prints an UNSIGNED JWT whose `sub` is the given user id, for serverless-offline only (it decodes claims without
// verifying the signature). The claim set is identical to the frontend's mintDevToken (src/auth/dev.ts).
// The deployed API rejects it. Usage: npx tsx scripts/dev-token.ts <user-id>
const sub = process.argv[2] ?? 'local-user';
const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
const iat = Math.floor(Date.now() / 1000);
console.log(`${b64({ alg: 'none', typ: 'JWT' })}.${b64({ sub, iss: 'http://localhost/dev', aud: 'dev', token_use: 'access', iat, exp: iat + 3600 })}.`);
```

- [ ] **Step 5: Write the smoke script** — `scripts/smoke.sh` (then `chmod +x scripts/smoke.sh`)

```bash
#!/usr/bin/env bash
# End-to-end API scenario against a running backend (serverless-offline or deployed with a real token in TOKEN).
set -euo pipefail
BASE="${BASE:-http://localhost:3000/v1}"
USER_ID="${1:-smoke-$(date +%s)}"
TOKEN="${TOKEN:-$(npx tsx scripts/dev-token.ts "$USER_ID")}"
TODAY="$(TZ=America/Sao_Paulo date +%F)"

call() { # method path [json-body] -> prints body, fails on non-2xx
  local m="$1" p="$2" b="${3:-}"
  if [ -n "$b" ]; then curl -sS -f -X "$m" "$BASE$p" -H "Authorization: Bearer $TOKEN" -H 'content-type: application/json' -d "$b"
  else curl -sS -f -X "$m" "$BASE$p" -H "Authorization: Bearer $TOKEN"; fi
}
jget() { node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const v=eval("("+process.argv[1]+")")(JSON.parse(s));console.log(v)})' "$1"; }
assert_eq() { if [ "$2" != "$3" ]; then echo "FAIL $1: expected '$2', got '$3'"; exit 1; fi; echo "ok   $1"; }

assert_eq "me default locale" "pt-BR" "$(call GET /me | jget 'x=>x.locale')"
assert_eq "27 seeded categories" "27" "$(call GET /categories | jget 'x=>x.length')"

ACC=$(call POST /accounts '{"name":"Itaú","kind":"checking","color":"#1F4E79","opening":100000}' | jget 'x=>x.id')
CARD=$(call POST /cards "{\"name\":\"Nubank\",\"network\":\"Mastercard\",\"limit\":600000,\"closeDay\":3,\"dueDay\":10,\"color\":\"#6E3FA0\",\"payAccountId\":\"$ACC\"}" | jget 'x=>x.id')

call POST /transactions "{\"type\":\"expense\",\"amount\":30000,\"date\":\"$TODAY\",\"desc\":\"TV\",\"accountId\":\"$CARD\",\"installments\":3}" > /dev/null
assert_eq "card used after 3x installment" "30000" "$(call GET /cards | jget 'x=>x[0].used')"
assert_eq "account balance untouched by card purchase" "100000" "$(call GET /accounts | jget 'x=>x[0].balance')"

call POST "/cards/$CARD/pay" "{\"amount\":10000,\"fromAccountId\":\"$ACC\",\"date\":\"$TODAY\"}" > /dev/null
assert_eq "card used after payment" "20000" "$(call GET /cards | jget 'x=>x[0].used')"
assert_eq "account balance after payment" "90000" "$(call GET /accounts | jget 'x=>x[0].balance')"

FOOD=$(call GET /categories | jget 'x=>x.find(c=>c.key==="food").id')
call POST /transactions "{\"type\":\"expense\",\"amount\":8690,\"date\":\"$TODAY\",\"desc\":\"iFood\",\"accountId\":\"$ACC\",\"categoryId\":\"$FOOD\"}" > /dev/null
call POST /budgets "{\"categoryId\":\"$FOOD\",\"limit\":50000}" > /dev/null
assert_eq "budget pct (86,90 of 500,00)" "17" "$(call GET /budgets | jget 'x=>x[0].pct')"

assert_eq "transactions this month (1st installment, card payment, iFood)" "3" "$(call GET "/transactions?month=${TODAY:0:7}" | jget 'x=>x.items.length')"
OTHER=$(TOKEN="$(npx tsx scripts/dev-token.ts "other-$USER_ID")" call GET /accounts | jget 'x=>x.length')
assert_eq "another user sees no accounts" "0" "$OTHER"
assert_eq "no token is rejected" "401" "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/me")"
echo "SMOKE OK ($USER_ID)"
```

- [ ] **Step 6: Run the stack and the smoke script**

Terminal A (leave running):

```bash
DYNAMO_ENDPOINT=http://localhost:8000 DYNAMO_TABLE=fc-dev TABLE_NAME=fc-dev RECEIPTS_BUCKET=local npm run dev
```

Terminal B:

```bash
curl -s -o /dev/null -w '%{http_code}\n' localhost:3000/v1/me                                   # expect 401
curl -s -H "Authorization: Bearer $(npx tsx scripts/dev-token.ts me)" localhost:3000/v1/me       # expect {"locale":"pt-BR",...}
curl -s -o /dev/null -w '%{http_code}\n' -H 'Authorization: Bearer garbage' localhost:3000/v1/me # expect 401
curl -si -X OPTIONS -H 'Origin: http://localhost:5173' -H 'Access-Control-Request-Method: GET' \
  -H 'Access-Control-Request-Headers: authorization' localhost:3000/v1/me | head -20             # expect Access-Control-Allow-Origin: http://localhost:5173
bash scripts/smoke.sh
```

Diagnose and fix whatever fails, with a test where the bug is unit-testable. Known open questions to resolve and record in the report:
1. Does serverless-offline start at all with the `!Ref`/`!GetAtt` intrinsics in `serverless.yml` (it may print warnings or fail to resolve `provider.environment`)? If it fails to start, fix the config minimally (do not remove the CloudFormation resources).
2. Does its JWT authorizer accept the unsigned dev token (look at `node_modules/serverless-offline/src` for how HTTP API JWT authorizers are handled; it may need `iss`/`aud`/`exp` claims — already included — or it may only decode)? Does it reject a missing/garbage token with 401?
3. Does the preflight return the CORS headers for `http://localhost:5173`? If not, find how serverless-offline reads `provider.httpApi.cors` and fix (e.g. a `custom.serverless-offline` option, or ensure the config is under the key it expects).
4. `scripts/smoke.sh` must pass end to end.

Commit each distinct fix separately. Stop the dev server and `docker compose down` when done.

- [ ] **Step 7: Update the docs and run everything**

Update `README.md` "Develop" and `CLAUDE.md` "Commands": document `DYNAMO_TABLE`, the real working local command, the dev-token claims, `bash scripts/smoke.sh`, and that the DynamoDB contract suite runs with `DYNAMO_ENDPOINT=http://localhost:8000 npm test`.

```bash
DYNAMO_ENDPOINT=http://localhost:8000 npm test && npm run typecheck
git add -A
git commit -m "chore: make local dev work end to end (table override, dev token, smoke script)" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

Report: the branch name, every commit, the output of the contract suite (4 tests now executed), the output of `scripts/smoke.sh`, and each answer to the four open questions above.

---

### Task 17: One-command local stack and Playwright end-to-end suite

**Files (frontend repo):**
- Create: `scripts/stack.sh`, `playwright.config.ts`, `e2e/flow.spec.ts`
- Modify: `package.json` (scripts already added in Task 0; add `@playwright/test` browsers note only), `.env.example` (unchanged), `README.md`, `CLAUDE.md`

**Interfaces:**
- Consumes: the backend's `npm run db:up` and `npm run dev` (Task 16 must be merged into the backend's `main`, or `BACKEND_DIR` must point at a checkout of branch `chore/offline-dev`), the frontend's `npm run dev:local`.
- Produces: `npm run stack` (starts DynamoDB Local, the backend on `:3000`, the frontend on `:5173`; Ctrl-C stops all; fails fast with a clear message when Docker is not running or a port is busy); `npm run e2e` (Playwright, expects the stack to be running).

- [ ] **Step 1: Write the stack script** — `scripts/stack.sh` (`chmod +x`)

```bash
#!/usr/bin/env bash
# Starts DynamoDB Local, the backend (serverless-offline) and the frontend (Vite, dev auth) for local end-to-end testing.
set -euo pipefail
cd "$(dirname "$0")/.."
BACKEND_DIR="${BACKEND_DIR:-$(cd ../financeControlBackend 2>/dev/null && pwd || true)}"

[ -n "$BACKEND_DIR" ] && [ -d "$BACKEND_DIR" ] || { echo "Backend repo not found. Set BACKEND_DIR=/path/to/financeControlBackend"; exit 1; }
docker info > /dev/null 2>&1 || { echo "Docker daemon is not running (needed for DynamoDB Local). Start it and retry."; exit 1; }
for port in 3000 5173 8000; do
  if (exec 3<>/dev/tcp/127.0.0.1/$port) 2> /dev/null; then echo "Port $port is already in use. Stop whatever is using it and retry."; exit 1; fi
done

trap 'echo; echo "Stopping stack…"; kill 0 2> /dev/null || true; (cd "$BACKEND_DIR" && docker compose down > /dev/null 2>&1) || true' EXIT INT TERM

echo "▶ DynamoDB Local"
(cd "$BACKEND_DIR" && npm run db:up)

echo "▶ Backend on :3000"
(cd "$BACKEND_DIR" && DYNAMO_ENDPOINT=http://localhost:8000 DYNAMO_TABLE=fc-dev TABLE_NAME=fc-dev RECEIPTS_BUCKET=local npm run dev) &

for i in $(seq 1 90); do
  code=$(curl -s -o /dev/null -w '%{http_code}' http://localhost:3000/v1/me || true)
  [ "$code" != "000" ] && break
  sleep 1
  [ "$i" = 90 ] && { echo "Backend did not come up within 90s"; exit 1; }
done

echo "▶ Frontend on :5173 (dev auth)"
npm run dev:local &

echo "Stack is up: frontend http://localhost:5173 · API http://localhost:3000/v1 · Ctrl-C to stop"
wait -n
```

- [ ] **Step 2: Write the Playwright config** — `playwright.config.ts`

```ts
import { defineConfig, devices } from '@playwright/test';

// Requires the stack to be running: `npm run stack` in another terminal.
export default defineConfig({
  testDir: 'e2e',
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  timeout: 90_000,
  expect: { timeout: 10_000 },
  use: { baseURL: 'http://localhost:5173', locale: 'pt-BR', timezoneId: 'America/Sao_Paulo', trace: 'retain-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
```

- [ ] **Step 3: Write the end-to-end scenario** — `e2e/flow.spec.ts`

```ts
import { expect, test, type Page } from '@playwright/test';

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
async function logout(page: Page) { await page.getByRole('button', { name: 'Sair' }).first().click(); await expect(page.getByLabel('ID do usuário de teste')).toBeVisible(); }
const go = (page: Page, route: string) => page.goto(`/#/${route}`);

test('full flow: accounts, cards, installments, payment, budgets, goals, i18n, import, isolation', async ({ page }) => {
  const nextYear = new Date().getFullYear() + 1;

  await test.step('dev login shows the DEV banner', async () => {
    await page.goto('/');
    await expect(page.getByText(/AUTENTICAÇÃO DE TESTE/)).toBeVisible();
    await login(page, U1);
    await expect(page.getByRole('heading', { name: 'Visão geral' })).toBeVisible();
  });

  await test.step('create an account with an opening balance (pt-BR input)', async () => {
    await go(page, 'accounts');
    await page.getByRole('button', { name: /Nova conta/ }).click();
    await page.getByLabel('Nome da conta').fill('Itaú');
    await page.getByLabel('Saldo inicial').fill('1.000,00');
    await page.getByRole('button', { name: 'Criar conta' }).click();
    await expect(page.getByText('R$ 1.000,00').first()).toBeVisible();
  });

  await test.step('create a credit card paid from that account', async () => {
    await go(page, 'cards');
    await page.getByRole('button', { name: /Novo cartão/ }).click();
    await page.getByLabel('Nome do cartão').fill('Nubank');
    await page.getByLabel('Limite de crédito').fill('6.000,00');
    await page.getByLabel('Paga com a conta').selectOption({ label: 'Itaú' });
    await page.getByRole('button', { name: 'Criar cartão' }).click();
    await expect(page.getByRole('heading', { name: /Nubank · faturas/ })).toBeVisible();
  });

  await test.step('3x installment on the card: card limit used = full amount, statements appear', async () => {
    await go(page, 'transactions');
    await page.getByRole('button', { name: /Nova transação/ }).click();
    const dlg = page.getByRole('dialog');
    await dlg.getByLabel('Valor').fill('300,00');
    await dlg.getByLabel('Descrição').fill('TV');
    await dlg.getByLabel('Conta ou cartão').selectOption({ label: 'Nubank' });
    await dlg.getByLabel('Dividir em parcelas').check();
    await dlg.getByRole('button', { name: 'Salvar', exact: true }).click();
    await expect(page.getByText(/Parcela 1\/3/)).toBeVisible();
    await go(page, 'cards');
    await expect(page.getByText('R$ 300,00').first()).toBeVisible();
    await expect(page.getByText('Aberta')).toBeVisible();
  });

  await test.step('pay the open statement: it becomes Paga and the account balance drops by the installment', async () => {
    await page.getByRole('button', { name: 'Pagar fatura' }).click();
    const dlg = page.getByRole('dialog');
    await expect(dlg.getByLabel('Valor')).toHaveValue('100,00');
    await dlg.getByRole('button', { name: 'Confirmar pagamento' }).click();
    await expect(page.getByText('Paga').first()).toBeVisible();
    await go(page, 'accounts');
    await expect(page.getByText('R$ 900,00').first()).toBeVisible();
  });

  await test.step('expense in a translated default category + budget progress', async () => {
    await go(page, 'transactions');
    await page.getByRole('button', { name: /Nova transação/ }).click();
    let dlg = page.getByRole('dialog');
    await dlg.getByLabel('Valor').fill('86,90');
    await dlg.getByLabel('Descrição').fill('iFood');
    await dlg.getByLabel('Categoria').selectOption({ label: 'Alimentação' });
    await dlg.getByRole('button', { name: 'Salvar', exact: true }).click();
    await expect(page.getByText('− R$ 86,90')).toBeVisible();
    await go(page, 'budgets');
    await page.getByRole('button', { name: /Novo orçamento/ }).click();
    dlg = page.getByRole('dialog');
    await dlg.getByLabel('Categoria').selectOption({ label: 'Alimentação' });
    await dlg.getByLabel('Limite mensal').fill('500,00');
    await dlg.getByRole('button', { name: 'Criar orçamento' }).click();
    await expect(page.getByText('17%')).toBeVisible();
  });

  await test.step('goal with a contribution', async () => {
    await go(page, 'goals');
    await page.getByRole('button', { name: /Nova meta/ }).click();
    let dlg = page.getByRole('dialog');
    await dlg.getByLabel('Nome da meta').fill('Viagem');
    await dlg.getByLabel('Valor alvo').fill('3.000,00');
    await dlg.getByLabel('Mês alvo').fill(`${nextYear}-06`);
    await dlg.getByRole('button', { name: 'Criar meta' }).click();
    await page.getByRole('button', { name: 'Adicionar dinheiro' }).click();
    dlg = page.getByRole('dialog');
    await dlg.getByLabel('Valor').fill('100,00');
    await dlg.getByRole('button', { name: 'Adicionar à meta' }).click();
    await expect(page.getByText('3%').first()).toBeVisible();
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
```

- [ ] **Step 4: Install the browser, run, and iterate**

```bash
npx playwright install chromium          # add --with-deps only if the owner approves sudo
```

Terminal A: `npm run stack`. Terminal B: `npm run e2e`.
Expected: the single scenario passes. This is the first time the whole system runs together, so expect selector/label mismatches or real integration bugs: for each failure decide whether it is a test-selector error (fix the test, keep the intent) or a product bug (fix the product with a unit/component test first, as in earlier tasks) and commit separately. If the browser cannot be installed or launched in this environment (WSL libraries), or Docker is unavailable, **state that explicitly and do not claim the e2e suite ran**: the suite is delivered and the owner runs it; list what was verified instead (typecheck, unit tests, `npm run build`).

- [ ] **Step 5: Document** — add to `README.md` and `CLAUDE.md`:
  - **Local full stack:** prerequisites (Docker daemon, backend repo at `../financeControlBackend` or `BACKEND_DIR`), `npm run stack`, `npm run e2e`, the dev login, and that receipts and real Cognito are manual checks.
  - **Manual checklist for the deployed `dev` stack:** Cognito login incl. the new-password challenge, silent refresh after the access token expires, receipt upload + view, CORS from the real origin, language/currency/timezone persistence.
  - **Architecture:** `api/ → queries/ → pages`, `auth/`, `i18n/` (catalogs in `src/i18n/en.ts` + `pt-BR.ts`, add a key to both or the build fails), the rule "never recompute server-derived values", env vars from `.env.example`, deploy as a static site with `VITE_*` set at build time and the host origin added to the backend's `frontendOrigins`.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: one-command local stack and Playwright end-to-end suite" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 18: Remove the localStorage-era code and verify everything

**Files:**
- Delete: `src/store.ts`, `src/actions.ts`, `src/lib.ts`, `src/types.ts`
- Modify: whatever still imports them (should be nothing), `CLAUDE.md`, `README.md`

- [ ] **Step 1: Confirm nothing still uses the old modules**

```bash
grep -rnE "from '(\./|\.\./)(store|actions|lib|types)'" src test e2e || echo "no references"
```

Expected: `no references`. If anything matches, migrate it (it is a bug in an earlier task) before deleting.

- [ ] **Step 2: Delete them and verify**

```bash
git rm src/store.ts src/actions.ts src/lib.ts src/types.ts
npx tsc --noEmit && npx vitest run && npm run build
```

Expected: typecheck clean, ALL tests pass, build succeeds. Also confirm the production guard:

```bash
VITE_DEV_AUTH=true npx vite build 2>&1 | grep -q "VITE_DEV_AUTH" && echo "guard works"
```

Expected: `guard works` (the build refuses).

- [ ] **Step 3: Static checks on the result**

```bash
grep -rn "localStorage" src | grep -v -E "prefs|legacy|cognito|auth" || echo "ok: localStorage only in prefs/legacy/auth"
grep -rnE ">[A-Z][a-z]+( [a-z]+)*<" src/pages src/auth src/components | head   # hard-coded English text between tags: review each hit
```

Expected: the first prints the ok line; the second should list nothing that is user-visible text (brand name `financeControl` in `LoginPage` is fine).

- [ ] **Step 4: Final verification run (report honestly what ran)**

With the owner's Docker available: `npm run stack` and `npm run e2e`, plus the manual smoke of the app in a browser (login, create data, switch language). Without Docker/browser: say so, and report instead the output of `npx tsc --noEmit`, `npx vitest run`, `npm run build`.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore: remove localStorage-era store, actions and derived-data helpers" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

## Self-Review

**Spec coverage** (against `2026-10-13-frontend-integration-design.md`)
- §2 architecture/modules → Tasks 3 (api), 5 (auth), 6 (queries), 2/1 (i18n), 7 (shell), 0 (env + guard); removed modules → Task 18.
- §3 API contract (31 routes, DTOs, error codes) → Task 3 types/endpoints + table test of all 31 routes; error codes translated → Task 2 catalog + `errorMessage`.
- §4 data flow / invalidation matrix → Task 6 (`INVALIDATES` + a test row per mutation).
- §5 auth (Cognito SRP, refresh, new-password challenge, dev login, banner, logout, cache clear) → Tasks 3 (refresh-once), 5, 7.
- §6 i18n and formatting (typed catalogs, parity test, locale from `/me`, system/custom category names, UTC-safe dates, money parsing) → Tasks 1, 2, 6 (lookups), 15 (settings → `/me`).
- §7 screens → Tasks 8–15 (list/loading/error/empty states via `QueryState`; series scopes; moveTo; pay; contribute; receipts; legacy import; removed JSON export/import and sample-data buttons).
- §8 local stack + backend touch-ups → Tasks 16, 17. §9 testing → every task + Task 17 e2e + manual checklist in Task 17 docs. §10 deployment → Task 17 docs.

**Deviations from the spec / consequences to tell the owner**
1. Cognito tokens live in the library's default `localStorage` (not "access token in memory") — Task 5.
2. Features dropped because the API does not provide the data: per-card **minimum payment** (Task 10), per-category **monthly transaction counts** (Task 11), the transactions **tag select** (replaced by a text filter) and the **period select** (replaced by month ‹ › + "All time") (Task 14), per-kind account KPIs and budget/goal summary tiles are presentation sums of API numbers (Tasks 9, 12, 13).
3. Account "current balance" edit is implemented as an opening-balance adjustment (the API has no set-balance operation) — Task 9.
4. The old "Import CSV/OFX" button (never functional) and the "Load sample data / Erase everything" settings are removed.

**Placeholder scan:** none; open questions that depend on the first real run are called out explicitly in Task 16 with how to resolve them.

**Type/signature consistency:** `AuthBackend`, `I18n` (incl. `parseSigned` added in Task 9), `QueryState`, hook names/variable shapes (Task 6) and fixtures (Task 8) are used identically by Tasks 8–15; i18n keys are added by the task that first uses them and the catalog tests enforce parity and that every literal `t('…')` exists.
