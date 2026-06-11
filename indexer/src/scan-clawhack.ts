// Resumable ClawHack-window cohort scanner.
// Phase 1: collect all Agni Swap logs in blocks 94,040,444..94,731,644 (Apr 15–30 2026).
// Phase 2: attribute each unique tx to tx.from (the real trader), count per wallet.
// State persists in clawhack-state.json; each invocation does ≤ ~8 min of work then exits.
// Re-run until it prints SCAN_COMPLETE. Final output: clawhack-cohort.json.
//   npx tsx src/scan-clawhack.ts
import { createPublicClient, http, parseAbiItem, type Address } from "viem";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { MANTLE_MAINNET, POOLS } from "./config.js";

const START = 94040444n;
const END = 94731644n;
const CHUNK = 9000n;
const SLICE_MS = 8 * 60 * 1000;
const STATE = "clawhack-state.json";
const OUT = "clawhack-cohort.json";

const SWAP_EVENT = parseAbiItem(
  "event Swap(address indexed sender, address indexed recipient, int256 amount0, int256 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick, uint128 protocolFeesToken0, uint128 protocolFeesToken1)",
);

interface State {
  nextBlock: string; // phase 1 cursor
  logsDone: boolean;
  txs: Record<string, number>; // txHash -> swap count in tx
  fromCache: Record<string, string>; // txHash -> from
  txCursor: number; // phase 2 cursor into Object.keys(txs)
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function load(): State {
  if (existsSync(STATE)) return JSON.parse(readFileSync(STATE, "utf8"));
  return { nextBlock: START.toString(), logsDone: false, txs: {}, fromCache: {}, txCursor: 0 };
}
function save(s: State) {
  writeFileSync(STATE, JSON.stringify(s));
}

async function main() {
  const t0 = Date.now();
  const client = createPublicClient({ transport: http(MANTLE_MAINNET.rpc) });
  const s = load();

  // ---- Phase 1: logs ----
  if (!s.logsDone) {
    let from = BigInt(s.nextBlock);
    while (from <= END && Date.now() - t0 < SLICE_MS) {
      const to = from + CHUNK - 1n > END ? END : from + CHUNK - 1n;
      for (const pool of POOLS) {
        for (let a = 0; a < 5; a++) {
          try {
            const logs = await client.getLogs({
              address: pool.address as Address,
              event: SWAP_EVENT,
              fromBlock: from,
              toBlock: to,
            });
            for (const l of logs) {
              const h = (l.transactionHash as string).toLowerCase();
              s.txs[h] = (s.txs[h] ?? 0) + 1;
            }
            break;
          } catch (e) {
            if (a === 4) throw e;
            await sleep(900 * (a + 1));
          }
        }
        await sleep(200);
      }
      from = to + 1n;
      s.nextBlock = from.toString();
      if ((Number(from - START) / 9000) % 10 < 1) save(s);
    }
    if (from > END) {
      s.logsDone = true;
      console.log(`phase1 DONE: ${Object.keys(s.txs).length} unique txs`);
    } else {
      console.log(`phase1 progress: block ${from}/${END} (${(Number(from - START) * 100 / Number(END - START)).toFixed(1)}%), txs so far ${Object.keys(s.txs).length}`);
    }
    save(s);
    if (!s.logsDone) return console.log("SLICE_END");
  }

  // ---- Phase 2: tx.from attribution ----
  const hashes = Object.keys(s.txs).sort();
  while (s.txCursor < hashes.length && Date.now() - t0 < SLICE_MS) {
    const batch = hashes.slice(s.txCursor, s.txCursor + 8);
    await Promise.all(
      batch.map(async (h) => {
        if (s.fromCache[h]) return;
        for (let a = 0; a < 5; a++) {
          try {
            const tx = await client.getTransaction({ hash: h as `0x${string}` });
            s.fromCache[h] = tx.from.toLowerCase();
            return;
          } catch {
            await sleep(700 * (a + 1));
          }
        }
        s.fromCache[h] = "0xfailed";
      }),
    );
    s.txCursor += batch.length;
    if (s.txCursor % 400 < 8) {
      save(s);
      console.log(`phase2 progress: ${s.txCursor}/${hashes.length}`);
    }
    await sleep(120);
  }
  save(s);
  if (s.txCursor < hashes.length) return console.log(`phase2 at ${s.txCursor}/${hashes.length}\nSLICE_END`);

  // ---- Finalize ----
  const counts = new Map<string, number>();
  for (const [h, n] of Object.entries(s.txs)) {
    const f = s.fromCache[h];
    if (!f || f === "0xfailed") continue;
    counts.set(f, (counts.get(f) ?? 0) + n);
  }
  const ranked = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([wallet, swaps]) => ({ wallet, swaps }));
  writeFileSync(OUT, JSON.stringify({ window: { start: Number(START), end: Number(END) }, totalTxs: hashes.length, wallets: ranked }, null, 2));
  console.log(`cohort: ${ranked.length} wallets, top10:`);
  for (const r of ranked.slice(0, 10)) console.log(`  ${r.wallet}  ${r.swaps}`);
  console.log("SCAN_COMPLETE");
}

main().catch((e) => { console.error(e); process.exit(1); });
