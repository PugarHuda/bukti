# Backup deploy — Cloudflare (full app, no daily deploy limit)

Bukti's primary host is Vercel (`bukti-smoky.vercel.app`). This is a **backup** that runs the
**entire** Next.js app — SSR pages, the x402 gate API, the live badge SVG, share cards, OG image
— on **Cloudflare Workers** via [`@opennextjs/cloudflare`](https://opennext.js.org/cloudflare).
Unlike GitHub Pages (static only), nothing is degraded. Cloudflare's free tier has **no
per-day deploy limit**.

Everything is already wired in `web/`:
- `open-next.config.ts` + `wrangler.jsonc` (worker `bukti`, `nodejs_compat`)
- scripts: `cf:build`, `cf:preview`, `cf:deploy`
- all routes run on the Node runtime (verified: `npm run cf:build` → `.open-next/worker.js` ✓)

## Option A — CLI (fastest, ~2 min)

From `web/`:

```bash
npx wrangler login          # opens a browser — log into your Cloudflare account
npm run cf:deploy           # builds + deploys; prints the live URL
```

You'll get a URL like `https://bukti.<your-subdomain>.workers.dev`. Re-run `npm run cf:deploy`
any time to push an update. (`npm run cf:preview` runs it locally first if you want to check.)

## Option B — Git-connect (auto-deploy on every push)

In the **Cloudflare dashboard** → **Workers & Pages** → **Create** → **Import a repository** →
pick `PugarHuda/bukti`, then set:

| Setting | Value |
|---|---|
| Root directory | `web` |
| Build command | `npx opennextjs-cloudflare build` |
| Deploy command | `npx wrangler deploy` |

Cloudflare runs the build (its CI runs the postinstall scripts a local sandbox may block) and
deploys on every push to `main`. `nodejs_compat` is already set in `wrangler.jsonc`.

## Notes

- **No env vars required** — the attestation address (`0xDFb9C6fA…71E9`) and RPC are baked in.
  To override, set `NEXT_PUBLIC_ATTESTATION_ADDRESS` in the Worker's variables.
- **Custom domain** (optional): add one in the Worker's *Settings → Domains & Routes*.
- This config is also Vercel-safe — the same `web/` still deploys to Vercel unchanged
  (`vercel deploy --prod`). The two hosts can run side-by-side as primary + backup.
- Build output (`.open-next/`, `.wrangler/`) is git-ignored.
