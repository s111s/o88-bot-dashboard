# Deploying the o88 dashboard

The dashboard ships to **Vercel** and is reachable at **o88.gg** via DNS.
First-time setup is interactive (Vercel login + project creation); after that,
deploys are one-line.

## One-time setup

```sh
# In your shell (interactive — opens a browser tab to authenticate):
npx vercel login

# Walks you through Vercel project creation, then deploys to a preview URL:
npx vercel --cwd dashboard
```

Answer the prompts:
- **Set up and deploy?** → `Y`
- **Which scope?** → your account (or team)
- **Link to existing project?** → `N` (first time)
- **What's your project's name?** → `o88` (anything; this becomes the subdomain)
- **In which directory is your code located?** → `./` (we're already in `dashboard/`)
- **Want to override the settings?** → `N` (auto-detected from `vercel.json`)

After it deploys, you'll see something like `https://o88-<hash>.vercel.app` —
that's the preview URL.

## Production deploys (after setup)

```sh
npx vercel --cwd dashboard --prod
```

That pushes to the production URL (`https://o88.vercel.app` or whatever Vercel
assigns) and to any custom domains attached to the project.

## Pointing o88.gg at the deployment

In your DNS provider (Namecheap / Cloudflare / Porkbun / whoever holds `o88.gg`):

| Type   | Name | Value                     | TTL |
|--------|------|---------------------------|-----|
| A      | @    | `76.76.21.21`             | 300 |
| CNAME  | www  | `cname.vercel-dns.com`    | 300 |

Then in the Vercel dashboard for the `o88` project:
- **Settings → Domains → Add** → `o88.gg`
- Vercel will verify DNS within a few minutes and provision an SSL cert
  automatically.

If you'd rather use Cloudflare with full proxying, set the DNS to "DNS only"
(grey cloud) during initial Vercel verification, then flip to "Proxied"
(orange cloud) after the cert is issued.

## Subsequent deploys

Each push to the linked branch (or each `npx vercel --cwd dashboard --prod`
run) re-deploys. Vercel keeps the previous deploy around as instant rollback.

## Local preview before deploy

```sh
cd dashboard
pnpm dev          # localhost:3000 with hot reload
pnpm build && pnpm start   # exact prod build, no HMR
```
