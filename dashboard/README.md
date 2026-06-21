# o88 dashboard

Public dashboard for [o88.gg](https://o88.gg) — DeepBook keeper & arbitrage operator.

## What this is

The public marketing + status surface for o88. Everything shown here is sanitized:
- Live counters: opportunities flagged, captures, aggregate PnL
- Bot stack overview
- Architecture diagram + composability narrative

It pulls from the operator's `/public/*` API namespace, which never exposes:
- Per-trade entry prices
- Strategy thresholds
- Account balances
- Internal signals

The full operator code lives in the parent repo's `operator/` workspace and stays private
until submission. Judges receive a repo invite at hackathon submission time.

## Stack

- Next.js 15 + React 19 + Tailwind CSS
- TypeScript, App Router, `src/` layout
- Deployed to Vercel → DNS to o88.gg

## Develop

```sh
pnpm install
pnpm dev
```

Default port 3000. The page is server-rendered with placeholder data; once the operator
ships its `/public/*` API, swap the placeholders for live fetches.

## Deploy

```sh
vercel  # first run links the project
vercel --prod
```

DNS for `o88.gg` should `CNAME` to `cname.vercel-dns.com`.
