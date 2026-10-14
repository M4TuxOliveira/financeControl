# financeControl PRO

Personal finance tracker: accounts, credit cards with statements, transactions (installments, repeats, receipts),
categories, budgets and goals. A static React SPA that talks to the financeControl backend
(`financeControlBackend`: AWS Lambda + DynamoDB + Cognito, run locally with serverless-offline).
UI in Portuguese (Brazil) and English; money, dates and time zone follow the user's settings.

## Requirements
Node 22. For the local full stack: the backend repo checked out next to this one (`../financeControlBackend`,
or set `BACKEND_DIR`) with `npm install` done there. No Docker and no AWS account are needed locally.

## Develop
```
npm install
npm test            # unit + component tests (Vitest, jsdom)
npm run build       # tsc --noEmit + vite build → dist/
npm run dev         # Vite against the API in .env.local (copy .env.example)
npm run dev:local   # Vite with dev auth against http://localhost:3000 (needs the backend running)
```

## Local full stack (one command)
```
npm run stack       # terminal A: DynamoDB emulator :8000 + backend :3000 + frontend :5173; Ctrl-C stops everything
npm run e2e         # terminal B: Playwright end-to-end scenario against the running stack
```
- `npm run stack` (`scripts/stack.sh`) starts the backend's `npm run db:lite` (dynalite, a pure-JS DynamoDB
  emulator; Docker-free, table `fc-dev`), then the backend's `npm run dev` (serverless-offline) with
  `DYNAMO_ENDPOINT=http://localhost:8000 DYNAMO_TABLE=fc-dev`, then `npm run dev:local`. It waits for each one
  (dynalite ready → `/v1/me` answering 401 → Vite answering 200) and fails fast with a clear message when the
  backend repo is missing, a port (3000/5173/8000) is busy, or the backend revision has no `db:lite`
  (merge/checkout the backend branch `chore/offline-dev`). Logs of each process go to a temp dir it prints
  (`STACK_LOG_DIR` to choose one). If any process dies, the rest are stopped too.
- Optional Docker: `DB=docker npm run stack` uses the backend's `npm run db:up` (DynamoDB Local) instead.
- Open http://localhost:5173 and sign in on the developer login (**ID do usuário de teste** / test user id): any
  id of 1–40 letters, digits, `-` or `_`. Each id is a separate user. The page shows the
  **AUTENTICAÇÃO DE TESTE — apenas uso local** banner. Dev tokens are unsigned; serverless-offline only decodes them.
- One-time browser install for the e2e suite: `npx playwright install chromium`. (On Ubuntu 20.04, which Playwright
  1.64 no longer lists, `PLAYWRIGHT_HOST_PLATFORM_OVERRIDE=ubuntu22.04-x64 npx playwright install chromium` downloads
  a build that runs there.) Each e2e run uses fresh user ids, so it can be rerun against the same stack.
- The e2e scenario (`e2e/flow.spec.ts`) covers: dev login + banner, account with an opening balance, a card paid from
  it, a 3x installment purchase (card used, open statement), paying the statement (status Paga, balance drops),
  an expense in a translated default category, a budget's progress, a goal with a contribution, switching to English
  and back (persisted server-side), importing legacy localStorage data for a fresh user, and per-user isolation.

### Not verified locally (manual checks on the deployed `dev` stack)
Receipts need S3 and real login needs Cognito, neither of which exists locally (the receipt picker is disabled in
dev auth mode). After `npm run deploy:dev` in the backend and a frontend build pointed at it:
- [ ] Cognito login, including the forced new-password challenge for an admin-created user
- [ ] Silent refresh: stay signed in past the access-token lifetime (1 h) and keep working
- [ ] Receipt upload on a transaction, then "Ver comprovante" opens it
- [ ] CORS from the real frontend origin (the origin must be in the backend's `frontendOrigins`)
- [ ] Language, currency and time zone persist across sign-out/sign-in and devices
- [ ] Sign-out clears the session; an expired session returns to the login with a message

## Configuration
Copy `.env.example` to `.env.local`. All values are baked in at build time.

| Variable | Meaning |
|---|---|
| `VITE_API_URL` | API base URL without `/v1` (the backend's `HttpApiUrl` output; `http://localhost:3000` locally) |
| `VITE_COGNITO_USER_POOL_ID`, `VITE_COGNITO_CLIENT_ID`, `VITE_COGNITO_REGION` | Backend stack outputs (`UserPoolId`, `UserPoolClientId`) and region |
| `VITE_DEV_AUTH` | `true` = developer login with unsigned tokens. **Local only**: a production build refuses to run with it |

## Deploy (static site)
`npm run build` produces plain static files in `dist/` (hash routing, relative asset paths), so any static host works
(Cloudflare Pages, Netlify, Vercel, GitHub Pages). Set the `VITE_*` variables in the host's build environment
(never `VITE_DEV_AUTH`), and add the site's origin to the backend's `frontendOrigins` in `serverless.yml`, then redeploy
the backend.

The GitHub Pages workflow (`.github/workflows/deploy.yml`) builds on push to `main` and reads the configuration from
**repository variables** (not secrets: these are public client ids baked into the bundle). Add them under
Settings → Secrets and variables → Actions → Variables: `VITE_API_URL`, `VITE_COGNITO_USER_POOL_ID`,
`VITE_COGNITO_CLIENT_ID` (required: the workflow fails with a message naming any that is empty) and `VITE_COGNITO_REGION`.
Never add `VITE_DEV_AUTH`; the workflow never sets it.

Legacy data: the pre-API version kept everything in the browser's localStorage. On first sign-in to an empty account,
**Configurações → Importar deste navegador** uploads it once.
