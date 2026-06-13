import { defineCloudflareConfig } from "@opennextjs/cloudflare";

// Default Cloudflare config — runs the full Next.js app (SSR, API routes, edge routes) on
// Cloudflare Workers with nodejs_compat. No incremental cache configured (the app reads live
// from chain + a static board-data.json, so nothing needs server-side caching).
export default defineCloudflareConfig();
