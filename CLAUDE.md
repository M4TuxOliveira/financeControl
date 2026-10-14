# financeControl PRO (frontend)

Personal finance tracker. Static React SPA backed by the financeControl API (`../financeControlBackend`: Lambda +
DynamoDB + Cognito; serverless-offline locally). The server owns the data and every derived number; the client renders.

## Commands
- `npm test` — Vitest (jsdom) unit/component tests in `test/`
- `npm run build` — `tsc --noEmit && vite build` (`tsc` also covers `test/`, `e2e/`, `playwright.config.ts`)
- `npm run dev:local` — Vite with dev auth against `http://localhost:3000`
- `npm run stack` — dynalite :8000 + backend :3000 + Vite :5173 (`scripts/stack.sh`; Docker-free; `DB=docker` for
  DynamoDB Local; `BACKEND_DIR` if the backend is not at `../financeControlBackend`; Ctrl-C stops all)
- `npm run e2e` — Playwright scenario `e2e/flow.spec.ts`; needs `npm run stack` running. Use fresh dev user ids.

## Architecture (`src/`)
- `api/` — `client.ts` (fetch, bearer token, error envelope → `ApiError`), `endpoints.ts` (one function per route),
  `types.ts` (wire types: cents, `yyyy-mm-dd`, `yyyy-mm`), `receipt.ts` (S3 presigned upload).
- `queries/` — TanStack Query hooks per resource + mutations with invalidation (`keys.ts`), `lookups.ts` (id → name/color).
  Data flows `api/ → queries/ → pages/`; pages never call `api/` directly.
- `auth/` — `AuthProvider` (Cognito via `amazon-cognito-identity-js`, or dev auth when `VITE_DEV_AUTH=true`:
  unsigned token from `dev.ts`, DEV banner), `LoginPage` (incl. new-password challenge).
- `i18n/` — `en.ts` + `pt-BR.ts` catalogs (`pt-BR` is typed `Record<Key, string>`, so a key missing in either fails
  the build/tests). Add new keys **immediately before the `// @@keys-end` line** in both. `format.ts`: locale-aware
  money/date/parse helpers exposed by `useI18n()`; `errors.ts` maps API error codes to messages.
- `pages/*.tsx` — one per hash route (`#/accounts`), forms and confirm dialogs in the same file; `components/QueryState`
  renders loading/error(+retry)/empty/data. `ui.tsx` has shared primitives (`Modal`, `Field`, `Bar`, `PageHead`…).
- `prefs.ts` — local-only prefs (theme, display name). `legacy.ts` — reads the old localStorage document for import.

## Rules
- **Never recompute server-derived values** (balances, card used/statements, budget pct, goal progress, totals). Render
  what the API returns; invalidate queries after mutations.
- **Money is integer cents** on the wire. Parse input with `parseMoney`/`parseSigned` from `useI18n()`: a `null` result
  is an error shown on the field — never a silent `?? 0`. Edit forms initialize a zero amount as `'0'` (not `''`), so
  saving without touching it keeps 0 instead of failing or nulling.
- Selects only ever hold a **listed** option: derive the effective value from the current list (fallback to the first
  valid one or `''`), never keep a stale id.
- Forms that depend on lists (accounts, cards, categories) handle loading, error (+ retry) and empty explicitly; never
  block silently.
- Dates are `yyyy-mm-dd` strings; "today" comes from `useI18n().today` (user's time zone). UI copy only via `t()`.
- Hash routing and `base: './'` keep the build host-agnostic; don't switch to history routing.
- `VITE_DEV_AUTH` must never reach a production build (`vite.env-guard.ts` throws).
- Styling: one `src/styles.css` with CSS variables; reuse existing classes (`.card`, `.btn-1/2`, `.fld`, `.trow`, `.modal`).
  Accessible forms: real labels via `Field`, `type="button"`, `aria-label` on icon buttons.

## Local stack facts
- serverless-offline does not verify JWTs (only decodes); there is no S3 locally, so receipts are disabled in dev auth.
- `optimizeDeps.esbuildOptions.define.global` in `vite.config.ts` is required: the Cognito lib's `buffer` polyfill reads
  `global`, which crashed the dev server's pre-bundle (blank page). `test/vite-deps.test.ts` guards it.
- Not verifiable locally (manual on the deployed `dev` stack, see README): Cognito login/new password, token refresh,
  receipts, CORS from the real origin.
