// funder-graph.ts — closes the last trust gap: SYBIL / sacrifice-wallet coordination.
//
// A sybil splits one record across many wallets and surfaces the best. The tell is funding:
// sibling wallets are almost always seeded from ONE funder (a CEX withdrawal, a deployer, a
// disperse contract). This builds the funding graph for the cohort — each wallet's FIRST
// inbound tx sender — clusters wallets by shared funder, and applies SET-EXCLUSION: within a
// sybil cluster only the single best-scoring wallet may count, so spinning up 50 wallets buys
// nothing. Output: funder-graph-report.json + per-cluster verdict.
//
//   npx tsx src/funder-graph.ts
import { readFileSync, writeFileSync, existsSync } from "node:fs";

function envKey(name: string): string {
  if (process.env[name]) return process.env[name]!;
  for (const p of ["../.env", ".env"]) {
    if (existsSync(p)) {
      const line = readFileSync(p, "utf8").split(/\r?\n/).find((l) => l.startsWith(name + "="));
      if (line) return line.slice(name.length + 1).trim();
    }
  }
  return "";
}
const KEY = envKey("MANTLESCAN_API_KEY");
const API = "https://api.etherscan.io/v2/api"; // etherscan v2 multichain
const CHAIN = 5000; // Mantle mainnet (where the swaps + funding live)
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// first inbound funder = the `from` of the wallet's earliest tx (normal or internal).
async function firstFunder(wallet: string): Promise<string | null> {
  for (const action of ["txlist", "txlistinternal"]) {
    const url = `${API}?chainid=${CHAIN}&module=account&action=${action}&address=${wallet}&startblock=0&endblock=99999999&page=1&offset=10&sort=asc&apikey=${KEY}`;
    try {
      const r = await fetch(url);
      const j: any = await r.json();
      if (j.status === "1" && Array.isArray(j.result)) {
        const inbound = j.result.find((t: any) => t.to?.toLowerCase() === wallet.toLowerCase() && t.from && Number(t.value) > 0);
        if (inbound) return inbound.from.toLowerCase();
      }
    } catch { /* try next */ }
    await sleep(230); // ~5 req/s free tier
  }
  return null;
}

async function main() {
  // score the wide cohort so we can show set-exclusion impact
  const board = JSON.parse(readFileSync("../web/public/board-wide.json", "utf8")) as { rows: any[] };
  const wallets = board.rows.map((r) => r.wallet.toLowerCase());
  const scoreOf = new Map(board.rows.map((r) => [r.wallet.toLowerCase(), r.score as number]));
  console.log(`funding-graph over ${wallets.length} cohort wallets (first inbound funder)…`);

  const funder = new Map<string, string>();
  let resolved = 0;
  for (const w of wallets) {
    const f = await firstFunder(w);
    if (f) { funder.set(w, f); resolved++; }
    if (resolved % 20 === 0 && resolved) console.log(`  resolved ${resolved}/${wallets.length}`);
  }

  // cluster by shared funder
  const byFunder = new Map<string, string[]>();
  for (const [w, f] of funder) { (byFunder.get(f) ?? byFunder.set(f, []).get(f)!).push(w); }
  const clusters = [...byFunder.entries()].filter(([, ws]) => ws.length > 1).sort((a, b) => b[1].length - a[1].length);

  console.log(`\nfunders resolved: ${resolved}/${wallets.length}`);
  console.log(`sybil clusters (>=2 wallets share a funder): ${clusters.length}`);
  let excluded = 0;
  for (const [f, ws] of clusters.slice(0, 12)) {
    const ranked = ws.slice().sort((a, b) => (scoreOf.get(b) ?? 0) - (scoreOf.get(a) ?? 0));
    excluded += ws.length - 1; // set-exclusion keeps only the best
    console.log(`  funder ${f.slice(0, 10)} → ${ws.length} wallets [keep ${ranked[0].slice(0, 8)} s=${scoreOf.get(ranked[0])}, exclude ${ws.length - 1}]`);
  }
  for (const [, ws] of clusters.slice(12)) excluded += ws.length - 1;

  const distinctIdentities = resolved - excluded + (wallets.length - resolved);
  console.log(`\nset-exclusion: ${excluded} duplicate-funder wallets collapse → ${distinctIdentities} distinct funding identities from ${wallets.length} wallets.`);
  console.log(`=> a sybil farm gains nothing: only its single best wallet survives the cluster.`);

  const report = {
    cohort: wallets.length, fundersResolved: resolved,
    sybilClusters: clusters.length, excludedDuplicates: excluded, distinctIdentities,
    clusters: clusters.map(([f, ws]) => ({ funder: f, wallets: ws, keep: ws.slice().sort((a, b) => (scoreOf.get(b) ?? 0) - (scoreOf.get(a) ?? 0))[0] })),
  };
  writeFileSync("funder-graph-report.json", JSON.stringify(report, null, 2));
  console.log(`\nFUNDER_GRAPH_OK: wrote funder-graph-report.json (${clusters.length} clusters, ${excluded} excluded)`);
}
main().catch((e) => { console.error(e); process.exit(1); });
