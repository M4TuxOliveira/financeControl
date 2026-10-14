# financeControl PRO

Personal finance tracker. Static React SPA, no backend; all data lives in the browser's localStorage. Deployed free as static files (`dist/`).

## Commands
- `npm run dev` — Vite dev server
- `npm run build` — `tsc --noEmit && vite build` (the type check is the only automated check; there are no tests)
- `npm run preview` — serve the built `dist/`

## Stack and constraints
- Vite + React 18 + TypeScript (strict). No router, state or UI libraries — keep dependencies minimal.
- Hash routing (`#/transactions`) and `base: './'` in `vite.config.ts` so the build works on any static host without server config. Don't switch to history routing or absolute asset paths.
- Styling is one hand-written `src/styles.css` using CSS variables for light/dark (`data-theme` on `<html>`). No CSS framework.
- The UI originates from the "financeControl PRO" design artifact (Space Grotesk + IBM Plex Sans, dark hero cards, green `--btn`, lime `--accent`). Match existing tokens and classes (`.card`, `.btn-1/2/3`, `.fld`, `.trow`, `.modal`) rather than adding inline one-offs.
- Desktop (sidebar) and mobile (bottom tab bar, modals become bottom sheets) are the same components, switched at `max-width: 900px`.

## Architecture (`src/`)
- `types.ts` — all data types (`State` is the whole persisted document, `v: 1`).
- `store.ts` — module-level state + `useStore()` via `useSyncExternalStore`; `update(fn)` persists to localStorage key `financeControl:v1`. Also `freshState()` (default categories).
- `actions.ts` — every mutation (save/delete per entity, `createTransactions`, `deleteTx` scopes, `payStatement`, `contribute`). Pages call these; don't mutate state inside components.
- `lib.ts` — pure helpers: money, dates, balances, card statement math, budget math. Put new derived-data logic here.
- `pages/*.tsx` — one file per route; forms and delete-confirm modals live in the same file as their page. `ui.tsx` has shared primitives (`Modal`, `Field`, `Bar`, `Swatches`, `ConfirmDelete`).

## Domain rules (easy to get wrong)
- **Money is integer cents** everywhere. Convert only at the edges with `parseMoney` / `moneyInput` / `money`. Display locale is pt-BR / BRL; UI copy is English.
- **Dates are ISO `yyyy-mm-dd` strings** in local time; use the helpers in `lib.ts` (`addMonths` clamps the day). Never `new Date(iso)` without `T00:00:00`.
- A transaction's `accountId` may be an account **or a credit card id**. Card purchases don't change any account balance. A `transfer` whose `toId` is a card is a statement payment.
- Account balances count only transactions dated on or before today; future-dated (scheduled/recurring/installment) entries are excluded.
- Statement key = closing month; a purchase after `closeDay` lands in the next month's statement. Payments settle the oldest statements first (`cardStatements`). Card "used" includes future installments.
- Installments and repeats are **materialized** as separate transactions sharing a `groupId` (repeat: 26 weekly / 12 monthly / 3 yearly). Editing changes one entry; deleting offers one / future / all.
- Budgets count a category together with its subcategories. Deleting a category reassigns its transactions and removes its budgets.
- Changing the persisted shape requires bumping `State.v` and migrating in `store.ts` `load()`; today an unknown version silently resets to empty state.

## Conventions
- Never put real or personal financial data in the repo; `Settings → Load sample data` is the demo seed.
- Keep forms accessible: real `<label>` + input (use `Field`), `<button type="button">`, `aria-label` on icon-only buttons, touch targets ≥ 44px.
- Verify UI changes in a real browser (`npm run dev`); the type check does not cover rendering.
