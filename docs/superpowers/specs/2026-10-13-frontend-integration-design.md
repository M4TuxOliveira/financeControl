# financeControl Frontend ↔ Backend Integration — Design

Date: 2026-10-13 · Status: draft for review
Backend spec: `../financeControlBackend/docs/superpowers/specs/2026-10-13-backend-design.md` (implemented and merged on `main` of `../financeControlBackend`).

## 1. Purpose and scope

Today the frontend (`src/`, React 18 + Vite + TS, hash routing) is a localStorage-only app that computes balances, statements, budgets and goals itself. The backend now owns all data and business logic behind a JWT-protected REST API. This sub-project turns the frontend into a thin client of that API, adds internationalization (pt-BR default, en), real login, and makes the **whole flow testable on one machine**.

**Decisions made with the owner**
- Do API integration **and** i18n together (pages are rewritten anyway; translate once).
- Auth: Cognito email/password login for deployed use + a **dev login** for local testing.
- Stack: TanStack Query (server state), a small custom i18n layer on `Intl`, `amazon-cognito-identity-js` for Cognito. No Amplify, no react-i18next.
- Frontend stays a static site; env vars are baked in at build time.

**Out of scope:** CSV/OFX import; PWA/offline mode; multi-user sharing UI; a Cognito sign-up / password-reset UI (users are created by an admin; see backend README); changing the visual design; real-S3 receipt testing locally.

## 2. Architecture (`../financeControl/src`)

Removed: `store.ts`, `actions.ts`, derived logic in `lib.ts` (balances, statements, budgets, goals, filtering, series expansion). Kept from `lib.ts`: pure presentation helpers only (color tokens, icon lookup) — moved or trimmed as needed. `styles.css` and the design stay.

New modules:

| Module | Responsibility |
|---|---|
| `api/client.ts` | `fetch` wrapper: base URL from `VITE_API_URL`, `Authorization: Bearer <access token>`, JSON in/out, throws `ApiError {status, code, message, fields?, requestId}`; on 401 asks `auth` to refresh once and retries, else signs out. |
| `api/types.ts` | DTO types mirroring backend responses (see §3). |
| `api/endpoints.ts` | One typed function per route (31). No React. |
| `auth/` | `AuthProvider` + `useAuth()` (`status`, `signIn`, `signOut`, `getAccessToken`), `cognito.ts` (SRP login, refresh, session in memory + refresh token in `localStorage`), `devAuth.ts`, `LoginPage`. |
| `queries/` | TanStack Query hooks per resource (`useAccounts`, `useCards`, `useTransactions(filters)`, `useOverview(month)`, …) and mutation hooks with the invalidation matrix in §4. |
| `i18n/` | `pt-BR.ts`, `en.ts` catalogs (typed; `en` is the key source), `I18nProvider`, `useT()`, `format.ts` (`money`, `date`, `month`, parsing). |
| `pages/` | Existing pages, rewritten to use hooks. Shared `QueryState` component for loading / error+retry / empty. |

Env (all `VITE_*`, documented in `.env.example`): `VITE_API_URL`, `VITE_COGNITO_USER_POOL_ID`, `VITE_COGNITO_CLIENT_ID`, `VITE_COGNITO_REGION` (default `sa-east-1`), `VITE_DEV_AUTH` (`true` only for local; must be absent/false in production builds — the build fails if `VITE_DEV_AUTH=true` and `MODE === 'production'`).

## 3. API contract used by the frontend

Base: `${VITE_API_URL}/v1`. All values are data: money in **integer cents**, dates **ISO `yyyy-mm-dd`**, months `yyyy-mm`.

Routes → hooks: `GET|POST /accounts`, `PUT|DELETE /accounts/{id}` (`?moveTo=`); `GET|POST /cards`, `PUT|DELETE /cards/{id}`, `POST /cards/{id}/pay`; `GET|POST /categories`, `PUT|DELETE /categories/{id}` (`?moveTo=`); `GET|POST /transactions` (`?month&account&category&type&tag&q`), `PUT|DELETE /transactions/{id}` (`?scope=one|future|all`), `POST /transactions/{id}/receipt`; `GET|POST /budgets` (`?month`), `PUT|DELETE /budgets/{id}`; `GET|POST /goals`, `PUT|DELETE /goals/{id}`, `POST /goals/{id}/contribute`; `GET /overview` (`?month`); `GET|PUT /me`; `POST /import`.

Notable response shapes (derived fields come from the server; the client never recomputes them):
- Account: `+ balance`. Card: `+ used, statements[{key,total,paid,status:'paid'|'open'|'upcoming'|'due',due,range:{start,end},items[]}]`. Budget: `+ spent, pct`. Goal: `+ pct, left, monthsLeft, monthlyNeeded|null`.
- `GET /transactions` → `{items: Tx[] (+receiptUrl?), totals:{income,expense,net}}`. `POST /transactions` → `Tx[]` (series expansion done server-side; the form sends `installments` or `repeat`).
- Entities carry `createdAt/updatedAt`; **updates are partial** (omitted fields are unchanged) except transactions (full replacement).
- System-created transfers have `source: 'card_payment' | 'goal'` and `desc` = card/goal name.
- Default categories have `system: true` and a stable `key` (e.g. `groceries.bakery`).
- Errors: `{error:{code,message,fields?,requestId}}`; codes the UI must translate: `VALIDATION_FAILED`, `INVALID_JSON`, `UNAUTHENTICATED`, `NOT_FOUND`, `PAYLOAD_TOO_LARGE`, `INTERNAL`, `INVALID_REFERENCE`, `TRANSFER_SAME_ACCOUNT`, `TRANSFER_FROM_CARD`, `INCOME_ON_CARD`, `INSTALLMENTS_ONLY_EXPENSE`, `MOVE_TARGET_INVALID`, `INVALID_PARENT`, `HAS_SUBCATEGORIES`, `BUDGET_EXISTS`, `ALREADY_HAS_DATA`. Unknown codes fall back to a generic translated message that includes `requestId`.

## 4. Data flow and cache invalidation

Query keys: `['accounts']`, `['cards']`, `['categories']`, `['transactions', filters]`, `['budgets', month]`, `['goals']`, `['overview', month]`, `['me']`. Every mutation invalidates by key prefix on success:

| Mutation | Invalidates |
|---|---|
| create/update/delete transaction | transactions, accounts, cards, budgets, goals, overview |
| pay card | transactions, accounts, cards, overview |
| contribute to goal | goals, transactions, accounts, overview |
| account create/update/delete | accounts, cards, goals, transactions, overview |
| card create/update/delete | cards, transactions, overview |
| category create/update/delete | categories, budgets, transactions, overview |
| budget create/update/delete | budgets, overview |
| goal create/update/delete | goals, overview |
| `PUT /me` | me (+ re-render of formatters) |
| import | everything |

No optimistic updates in v1 (correctness over perceived speed). Defaults: `staleTime` 30 s, refetch on window focus, retry 1 for network errors, none for 4xx.

## 5. Auth

- **Cognito mode:** `LoginPage` (email + password) → SRP sign-in via `amazon-cognito-identity-js`. Access token held in memory; refresh token in `localStorage` (documented trade-off: static SPA, no BFF). Silent refresh before expiry and on 401. Failed refresh → signed-out state with a translated "session expired" message. `NEW_PASSWORD_REQUIRED` challenge is handled with a one-field "set a new password" form (admin-created users start in that state unless the admin sets a permanent password as in the backend README).
- **Dev mode (`VITE_DEV_AUTH=true`):** LoginPage shows a user-id field (default `dev`) and an "Enter as dev user" button. It mints an unsigned JWT (`alg: none`, `sub = <user id>`) exactly like the backend's `scripts/dev-token.ts`. A visible "DEV AUTH" banner is always shown. Only works against `serverless-offline`; the deployed API rejects these tokens.
- Sidebar and Settings expose **Log out**; logging out clears the Query cache.

## 6. i18n and formatting

- Catalogs are typed objects keyed by dotted ids (`nav.transactions`, `errors.TRANSFER_SAME_ACCOUNT`, `categories.groceries.bakery`, `status.statement.open`, `source.card_payment`). `en.ts` defines the key type; `pt-BR.ts` must satisfy it (compile-time) and a unit test asserts both have identical key sets and no empty values.
- Locale comes from `GET /me` (default `pt-BR`); the login screen uses the browser language (pt* → `pt-BR`, else `en`) until a profile exists. Changing language/currency/timezone in Settings does `PUT /me` and re-renders.
- Category display name: `system && key` → catalog `categories.<key>` (falls back to `name`); custom categories show `name`. System transfers display `t('source.<source>') + ' · ' + desc`.
- `format.ts`: `money(cents, locale, currency)` via `Intl.NumberFormat`; `date(iso, locale)` → `DD/MM/YYYY` for pt-BR, locale-appropriate for en; `month(key)`; `parseMoney(input, locale)` (pt-BR accepts `1.234,56` / `1234,56`; en accepts `1,234.56`), `parseDate(input, locale)` for typed dates (the date inputs use `<input type="date">`, which already yields ISO). **No `new Date(iso)` without a `T00:00:00` local or UTC-safe construction**, to avoid off-by-one days.
- All user-visible strings move to the catalogs, including `aria-label`s, empty states, confirmation dialogs and the document `<title>`; `<html lang>` follows the locale.

## 7. Screens: behavior changes

- Same layout/design; every page has loading, error+retry and empty states.
- **Transactions:** filters map to query params; month switcher uses `?month=`; the form sends `installments` or `repeat` (server expands, up to 26 rows); editing a series member edits that one entry; delete asks one / this-and-future / all (`scope`). System-created transfers are shown read-only-labelled (edit allowed by the API but discouraged: the UI hides Edit for `source` rows).
- **Accounts / Categories delete:** modal offers "move transactions to…" (`moveTo`) or delete-with-contents, as the API supports. Category delete also warns that its budgets are removed.
- **Cards:** statements, `used` and status come from the API; "Pay statement" calls `/cards/{id}/pay`; payments appear as transfers.
- **Goals:** "Add money" calls `/goals/{id}/contribute` (optional source account).
- **Budgets/Overview:** month param; progress colors use server `pct` and `alertPct`.
- **Settings:** language, currency, timezone (→ `/me`); theme and display name stay in `localStorage`; Log out. The old JSON export/import and "load sample data / erase everything" are removed (the server is the store); "Import from this browser" appears once when legacy localStorage data (`financeControl:v1`) exists: posts it to `POST /import`, shows the returned counts including `skippedTransactions`, `skippedBudgets`, `receiptsSkipped`, then offers to clear the local copy. `409 ALREADY_HAS_DATA` is explained in the UI.
- **Receipts:** "attach receipt" → `POST /transactions/{id}/receipt` (`contentType` jpeg/png/webp, ≤ 5 MB checked client-side) → upload to the returned presigned POST (multipart with the returned `fields`, file last) → refetch to show `receiptUrl`. In dev mode the button is disabled with a translated note (no S3 locally).

## 8. Local full-stack run (`npm run stack`)

A script in the frontend repo (`scripts/stack.sh`) starts, in order and with health waits: (1) DynamoDB Local via the backend's `docker compose` + table creation (`npm run db:up` in `../financeControlBackend`); (2) the backend: `DYNAMO_ENDPOINT=http://localhost:8000 TABLE_NAME=fc-dev RECEIPTS_BUCKET=local npm run dev` on `:3000`; (3) the frontend `vite` with `VITE_DEV_AUTH=true VITE_API_URL=http://localhost:3000` on `:5173`. Ctrl-C stops all. It fails fast with a clear message if the Docker daemon is not running.

**Backend touch-ups required (in `../financeControlBackend`, small commits):** `npm run dev` has never been executed, so this sub-project includes making it work end to end — confirm/force `TABLE_NAME` and `DYNAMO_ENDPOINT` env under serverless-offline (the YAML sets `TABLE_NAME: !Ref Table`, which may not resolve offline), ensure CORS allows `http://localhost:5173`, verify `Authorization` unsigned dev tokens are accepted by the offline JWT authorizer, and fix whatever else the first real run reveals. The DynamoDB contract suite is run for the first time as part of this (`DYNAMO_ENDPOINT=http://localhost:8000 npm test`).

## 9. Testing

- **Vitest + React Testing Library (frontend):** `format.ts` (pt-BR/en money & dates, parsing, round trips, no day-shift), API client (token header, JSON, `ApiError` mapping, one refresh-and-retry on 401, sign-out on refresh failure), i18n catalog parity and non-empty values, invalidation matrix per mutation (spy on `queryClient.invalidateQueries`), `QueryState` states, error-code → message mapping incl. unknown code fallback, legacy-import component.
- **Playwright e2e (`npm run e2e`, needs the stack up):** scenario — dev login → create account, card → add 3-installment card expense → statements/`used` visible with correct pt-BR formatting → pay statement → account balance and statement status updated → budget progress → goal contribute → switch language to en, persists after reload → legacy-import path (seed `localStorage` before load) shows counts → log out → login as a second dev user sees empty data (isolation). Receipts and real Cognito are not covered locally; they are a **manual checklist against a deployed `dev` stack** (documented in README): Cognito login incl. NEW_PASSWORD_REQUIRED, refresh, receipt upload/replace/delete, CORS from the real origin.
- Both suites must pass before the sub-project is considered done; the backend suites (incl. the DynamoDB contract suite) must pass too.

## 10. Deployment of the frontend

Static build (`npm run build`) to any free static host (Cloudflare Pages / Netlify / GitHub Pages), with `VITE_*` vars set in the host's build settings. The host origin must be added to the backend's `frontendOrigins` parameter (currently the prod placeholder `https://CHANGE-ME.example.com`). `base: './'` + hash routing are kept so no host config is needed.

## 11. Risks and open items

- The offline backend flow and DynamoDB Local contract suite are unverified until the first run; expect backend fixes (§8).
- Refresh token in `localStorage` is an accepted trade-off for a personal static SPA.
- Playwright needs browser binaries and system libraries in WSL; `npx playwright install --with-deps chromium` may require sudo. If unavailable, the e2e suite is written but its first run is the owner's.
- `GET /transactions` returns the whole month/all history unpaginated (backend decision); fine at personal scale, revisit if lists get large.
- The frontend repo is not a git repository; the plan will include `git init` + a first commit of the current state before changes so the refactor is reviewable.
