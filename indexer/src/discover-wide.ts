// discover-wide.ts — find genuinely ACTIVE Mantle traders across ALL UniV3-fork pools
// (Agni + FusionX both emit the same PancakeV3 Swap event), not just the 2 seed pools.
//
// Scans SWAP_TOPIC0 with NO address filter over a widened window, groups by pool + recipient,
// reads each pool's token0/token1, keeps only pools whose BOTH tokens are priceable (in the
// TOKENS registry), and ranks recipients by swap count on those pools. Output: the active
// cohort (>=MIN swaps) + the pool set to index — written to clawhack-cohort-wide.json.
//
//   npx tsx src/discover-wide.ts [startBlock] [endBlock] [minSwaps]
import { writeFileSync } from "node:fs";
import { TOKENS } from "./config.js";

const RPC = process.env.INDEXER_RPC ?? "https://rpc.mantle.xyz";
const SWAP_TOPIC0 = "0x19b47279256b2a23a1665c810c8d55a1758940ee09377d4f8d26497a3577dc83";
const CHUNK = 9000;

async function rpc(method: string, params: any[]): Promise<any> {
  for (let a = 0; a < 6; a++) {
    const r = await fetch(RPC, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) });
    const j = await r.json();
    if (j.error) { if (a < 5) { await new Promise((s) => setTimeout(s, 1500 * (a + 1))); continue; } throw new Error(`${method}: ${JSON.stringify(j.error)}`); }
    return j.result;
  }
}
const topicAddr = (t: string) => ("0x" + t.slice(26)).toLowerCase();

async function poolTokens(pool: string): Promise<{ t0: string; t1: string } | null> {
  try {
    const [t0, t1] = await Promise.all([
      rpc("eth_call", [{ to: pool, data: "0x0dfe1681" }, "latest"]), // token0()
      rpc("eth_call", [{ to: pool, data: "0xd21220a7" }, "latest"]), // token1()
    ]);
    if (!t0 || !t1 || t0.length < 66) return null;
    return { t0: topicAddr(t0), t1: topicAddr(t1) };
  } catch { return null; }
}

async function main() {
  const head = Number(await rpc("eth_blockNumber", []));
  const END = Number(process.argv[3] ?? 94731644);            // Apr 30 2026 (cohort end)
  const START = Number(process.argv[2] ?? END - 1_400_000);   // ~widen to ~2 months back
  const MIN = Number(process.argv[4] ?? 4);
  console.log(`scan blocks ${START}..${END} (${END - START} blocks, head=${head}) for ALL V3-fork swaps`);

  const poolCount = new Map<string, number>();
  const recCountByPool = new Map<string, Map<string, number>>(); // pool -> recipient -> n
  let scanned = 0, logs = 0;
  for (let lo = START; lo <= END; lo += CHUNK) {
    const hi = Math.min(lo + CHUNK - 1, END);
    let chunk: any[];
    try { chunk = await rpc("eth_getLogs", [{ topics: [SWAP_TOPIC0], fromBlock: "0x" + lo.toString(16), toBlock: "0x" + hi.toString(16) }]); }
    catch (e: any) { console.error(`  chunk ${lo} failed: ${e.message}`); continue; }
    for (const l of chunk) {
      const pool = l.address.toLowerCase();
      const rec = l.topics?.[2] ? topicAddr(l.topics[2]) : null;
      if (!rec) continue;
      poolCount.set(pool, (poolCount.get(pool) ?? 0) + 1);
      let m = recCountByPool.get(pool); if (!m) { m = new Map(); recCountByPool.set(pool, m); }
      m.set(rec, (m.get(rec) ?? 0) + 1);
    }
    logs += chunk.length; scanned += hi - lo + 1;
    if ((lo - START) % (CHUNK * 20) === 0) console.log(`  …${(((hi - START) / (END - START)) * 100).toFixed(0)}%  pools=${poolCount.size} logs=${logs}`);
  }
  console.log(`scanned ${scanned} blocks, ${logs} swaps across ${poolCount.size} pools. Resolving priceable pools…`);

  // keep pools whose both tokens are priceable
  const priceable: { pool: string; label: string; swaps: number }[] = [];
  const top = [...poolCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 60); // resolve only the busiest 60 pools
  for (const [pool, n] of top) {
    const t = await poolTokens(pool);
    if (!t) continue;
    const i0 = TOKENS[t.t0], i1 = TOKENS[t.t1];
    if (i0 && i1) priceable.push({ pool, label: `${i0.symbol}/${i1.symbol}`, swaps: n });
  }
  const priceablePools = new Set(priceable.map((p) => p.pool));
  console.log(`priceable pools (${priceable.length}):`);
  for (const p of priceable.slice(0, 20)) console.log(`  ${p.pool} ${p.label.padEnd(12)} ${p.swaps} swaps`);

  // rank recipients by total swaps on priceable pools
  const walletTotal = new Map<string, number>();
  for (const [pool, m] of recCountByPool) {
    if (!priceablePools.has(pool)) continue;
    for (const [rec, n] of m) walletTotal.set(rec, (walletTotal.get(rec) ?? 0) + n);
  }
  const ranked = [...walletTotal.entries()].map(([wallet, swaps]) => ({ wallet, swaps })).sort((a, b) => b.swaps - a.swaps);
  const active = ranked.filter((w) => w.swaps >= MIN);
  console.log(`\nwallets total=${ranked.length}; ACTIVE (>=${MIN} swaps)=${active.length}`);
  console.log(`swaps at active rank 25/50/100/${active.length}: ${active[24]?.swaps} / ${active[49]?.swaps} / ${active[99]?.swaps} / ${active.at(-1)?.swaps}`);
  console.log(`sum swaps top120 active: ${active.slice(0, 120).reduce((a, w) => a + w.swaps, 0)}`);

  writeFileSync("clawhack-cohort-wide.json", JSON.stringify({
    window: { start: START, end: END }, scannedBlocks: scanned, totalSwaps: logs,
    pools: priceable, activeCount: active.length,
    wallets: ranked.slice(0, 200),
  }, null, 2));
  console.log(`\nwrote clawhack-cohort-wide.json (${priceable.length} pools, ${active.length} active wallets)`);
}
main().catch((e) => { console.error(e); process.exit(1); });
