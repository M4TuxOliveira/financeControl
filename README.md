# financeControl PRO

Personal finance tracker: accounts, credit cards with statements, transactions (installments, repeats, receipts),
categories, budgets and goals. Static site — no backend. Data lives in your browser (localStorage);
use **Settings → Export backup** to save or move it.

## Run locally
```
npm install
npm run dev
```

## Deploy for free (pick one)
The build is plain static files in `dist/` and uses hash routing, so no server config is needed.

- **Cloudflare Pages / Netlify / Vercel**: import the Git repo, build command `npm run build`, output directory `dist`.
- **Netlify drop**: run `npm run build`, drag the `dist` folder onto app.netlify.com/drop.
- **GitHub Pages**: push to `main` on GitHub, then Settings → Pages → Source: *GitHub Actions*.
  `.github/workflows/deploy.yml` builds and publishes on every push.

Since the data is per-browser, each device/browser has its own copy; move it with export/import.
