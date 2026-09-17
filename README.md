# FinAhead

**See your balance before payday.**

FinAhead forecasts upcoming cash obligations and shows how a purchase could
affect a user's balance before their next income deposit.

It answers one question: *"Before my next paycheck, what will happen to my cash
balance if I make this purchase?"*

## Quick start

```bash
npm install
npm run dev
```

Open the URL Vite prints (http://localhost:5173 by default) and choose **Use
demo account**. No setup, no API key, no account.

## Routes

| Route | What it is |
| --- | --- |
| `/` | Public landing page — the problem, a product preview, privacy, and the way in |
| `/app` | The application itself (three steps held in app state) |
| `/app?start=demo` | Opens the app with the sample account already loaded |
| `/app?start=import` | Opens the app focused on CSV import |

Routing uses the History API directly — no router dependency. See
**Deployment** below for the one static-hosting requirement this implies.

## What it does

1. **Add information** — use the built-in sample account, or import a CSV
   export and enter your current checking balance.
2. **Cash forecast** — a chronological timeline of every expected payment
   between today and your next income deposit, with the running balance after
   each one and the projected low before payday.
3. **What-if** — enter a hypothetical purchase and see how the projected low
   point changes.

Every prediction shows the historical transactions behind it and can be edited
or marked "not recurring", which recalculates the forecast.

## What it does not do

FinAhead does not tell you whether you can afford something. It shows what it
predicted, why, and what a purchase would do to the projection. The decision is
the user's.

There is no LLM, chatbot or AI service anywhere in the app. All financial logic
is deterministic, pure and unit-tested.

## Privacy

There is no backend, no database, no authentication and no analytics. A CSV you
select is read in the browser with the File API, held in memory for the session,
and never transmitted or persisted. Reloading the page clears it. This is
verified in QA by asserting that the app issues zero non-local network requests
and writes nothing to `localStorage`, `sessionStorage` or cookies.

## Installable web app

FinAhead ships a web app manifest, local icons generated from the brand mark,
and a service worker that caches the application shell in production builds
only. Where the browser supports installation, an **Install** action appears in
the app header once the browser offers it.

The service worker caches the HTML shell, the hashed JS/CSS bundles, the
manifest and the icons — nothing else. An imported CSV is read through the File
API and never becomes an HTTP request, so it cannot reach the service worker at
all.

## Deployment

The build is static (`npm run build` → `dist/`), with one requirement: because
`/app` is a client-side route, the host must serve `index.html` for unknown
paths. Vite's dev and preview servers already do this. On a static host, add the
usual SPA rewrite — a `_redirects` line of `/* /index.html 200` on Netlify, a
rewrite to `/index.html` on Vercel or CloudFront, or `try_files $uri
/index.html` on nginx. Without it, a direct visit to `/app` 404s.

## Commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the dev server |
| `npm test` | Run the unit tests once |
| `npm run test:watch` | Run the tests in watch mode |
| `npm run typecheck` | Type-check without emitting |
| `npm run build` | Type-check and produce a production build in `dist/` |
| `npm run preview` | Serve the production build locally |

## Documentation

- [`docs/PRODUCT_DECISIONS.md`](docs/PRODUCT_DECISIONS.md) — the product
  reasoning: concepts considered, what was chosen, what was cut, and how this
  will be tested with users.
- [`docs/MVP_HANDOFF.md`](docs/MVP_HANDOFF.md) — how to run it, the financial
  rules, known limitations and the QA checklist.

---

FinAhead provides estimates based on the information available. Forecasts may be
incomplete or inaccurate and are not financial advice.
