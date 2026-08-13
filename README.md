# HyperPulse

A live monitor for whale trades and liquidations on Hyperliquid HyperCore, built entirely on Quicknode's Hyperliquid stack:

- **SQL Explorer** — 4 pre-built queries (whale trades, liquidations, market context, platform overview) run against the `hyperliquid-core-mainnet` cluster.
- **A small serverless proxy** (`/api/sql.js`) so your Quicknode API key never touches the browser and nobody can run arbitrary SQL against your key.
- **A seismograph-style trace** across the top that spikes on real whale buys, whale sells, and liquidations — reads like a shock monitor for the market, not just another table.
- **A demo mode** that kicks in automatically if no API key is configured yet, so the page never looks broken while you're setting it up, or if you want to share the link before wiring up billing.

## How to deploy this (GitHub web UI + Vercel, no terminal needed)

1. Go to GitHub, create a new repository (e.g. `hyperpulse`).
2. Use "Add file → Upload files" in the GitHub web UI and upload these three files/folders exactly as they are:
   - `index.html`
   - `package.json`
   - `api/sql.js` (make sure it lands in a folder called `api`, not the root)
3. Commit straight to `main`.
4. Go to Vercel → New Project → Import the `hyperpulse` repo. Leave the framework preset as "Other" — no build step needed, Vercel will serve `index.html` as a static file and `api/sql.js` as a serverless function automatically.
5. Before or after the first deploy, go to the Vercel project → Settings → Environment Variables and add:
   - **Key:** `QUICKNODE_API_KEY`
   - **Value:** your QuickNode API key (the Build-plan one from the `FERZ49` coupon)
   - Apply to Production (and Preview if you want).
6. Redeploy (Vercel → Deployments → ⋯ → Redeploy) so the new environment variable is picked up.
7. Open the live URL. The status dot in the top right should switch from amber "DEMO DATA" to green "LIVE" within a couple of seconds.

If you ever want to pause spending SQL Explorer credits, just remove the environment variable and redeploy — the page falls back to demo mode automatically, it won't error out.

## Cost awareness

The dashboard polls SQL Explorer at deliberately modest intervals to avoid burning credits:

| Query | Interval |
|---|---|
| Whale trades | every 20s |
| Liquidations | every 22s |
| Market context | every 30s |
| Platform overview | every 60s |

If you want it slower/cheaper, change the numbers in the `setInterval(...)` calls near the bottom of `index.html` (they're in milliseconds).

## Why the proxy instead of calling SQL Explorer straight from the browser

Calling `api.quicknode.com` directly from client-side JS would mean shipping your API key inside the page source — anyone could view-source it and start running their own queries on your credits. The `/api/sql.js` function keeps the key server-side in Vercel's environment and only lets the browser ask for one of four fixed, pre-approved queries. It's a small detail, but it's the difference between a demo and something you could actually run in front of users.
