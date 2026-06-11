// Resumable BATCH witness builder for the ClawHack cohort.
// Reads clawhack-cohort.json, indexes each top wallet's swaps in the ClawHack window
// (historical Pyth pricing per trade minute), and assembles ../batch.json
// ({ entries: [{wallet, anchor_block_hash, swaps}] }) for the zkVM.
// State in batch-state.json; each invocation does ≤ ~8 min then exits. Re-run until
// BATCH_COMPLETE.
//   npx tsx src/batch-index.ts
import { createPublicClient, http, parseAbiItem, type Address } from "viem";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { MANTLE_MAINNET, POOLS, TOKENS } from "./config.js";

const START = 94040444n; // Apr 15 2026
const END = 94731644n; // Apr 30 2026
const CHUNK = 9000n;
const SLICE_MS = 8 * 60 * 1000;
const MIN_SWAPS = 4; // cohort cutoff
const MAX_WALLETS = 25;
const STATE = "batch-state.json";
const OUT = "../batch.json";

const SWAP_EVENT = parseAbiItem(
  "event Swap(address indexed sender, address indexed recipient, int256 amount0, int256 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick, uint128 protocolFeesToken0, uint128 protocolFeesToken1)",
);
const POOL_ABI = [
  parseAbiItem("function token0() view returns (address)"),
  parseAbiItem("function token1() view returns (address)"),
];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface WitnessSwap {
  timestamp: number;
  sold_id: number;
  sold_amount_e6: number;
  sold_price_e6: number;
  sold_is_usd: boolean;
  bought_id: number;
  bought_amount_e6: number;
  bought_price_e6: number;
  bought_is_usd: boolean;
}
interface RawLeg {
  pool: string;
  txHash: string;
  block: string;
  logIndex: number;
  a0: string;
  a1: string;
}
interface State {
  wallets: string[]; // selected cohort
  anchorHash: string;
  // phase L: collect ALL window logs once (pool -> legs with tx)
  legsDone: boolean;
  nextBlock: string;
  legs: RawLeg[];
  txFrom: Record<string, string>;
  txCursor: number;
  attribDone: boolean;
  // phase P: price + assemble per wallet
  blockTs: Record<string, number>;
  priceCache: Record<string, number>;
  entries: Record<string, WitnessSwap[]>; // wallet -> swaps
  assembled: boolean;
  poolTokens: Record<string, { t0: string; t1: string }>;
}

function load(): State | null {
  return existsSync(STATE) ? JSON.parse(readFileSync(STATE, "utf8")) : null;
}
function save(s: State) {
  writeFileSync(STATE, JSON.stringify(s));
}

const PYTH = "https://hermes.pyth.network";
async function priceAt(s: State, token: string, tsSec: number): Promise<number> {
  const info = TOKENS[token];
  if (!info) throw new Error(`unknown token ${token}`);
  if (info.isUsd) return 1;
  if (!info.pythFeedId) throw new Error(`no feed for ${info.symbol}`);
  const minute = Math.floor(tsSec / 60) * 60;
  const key = `${info.pythFeedId}:${minute}`;
  if (s.priceCache[key]) return s.priceCache[key];
  const url = `${PYTH}/v2/updates/price/${minute}?ids[]=${info.pythFeedId}`;
  for (let a = 0; a < 8; a++) {
    const res = await fetch(url);
    if (res.status === 429 || res.status >= 500) {
      await sleep(3000 * (a + 1));
      continue;
    }
    if (!res.ok) throw new Error(`pyth ${res.status} ${info.symbol}@${minute}`);
    const j: any = await res.json();
    const p = j?.parsed?.[0]?.price;
    if (!p) throw new Error(`no pyth price ${info.symbol}@${minute}`);
    const px = Number(p.price) * 10 ** Number(p.expo);
    s.priceCache[key] = px;
    await sleep(2300);
    return px;
  }
  throw new Error(`pyth rate-limited ${info.symbol}@${minute}`);
}

async function main() {
  const t0 = Date.now();
  const client = createPublicClient({ transport: http(MANTLE_MAINNET.rpc) });

  let s = load();
  if (!s) {
    const cohort = JSON.parse(readFileSync("clawhack-cohort.json", "utf8"));
    const wallets = (cohort.wallets as { wallet: string; swaps: number }[])
      .filter((w) => w.swaps >= MIN_SWAPS)
      .slice(0, MAX_WALLETS)
      .map((w) => w.wallet.toLowerCase());
    const anchor = await client.getBlock({ blockNumber: END });
    const poolTokens: State["poolTokens"] = {};
    for (const p of POOLS) {
      const [t0a, t1a] = await Promise.all([
        client.readContract({ address: p.address as Address, abi: POOL_ABI, functionName: "token0" }),
        client.readContract({ address: p.address as Address, abi: POOL_ABI, functionName: "token1" }),
      ]);
      poolTokens[p.address.toLowerCase()] = {
        t0: (t0a as string).toLowerCase(),
        t1: (t1a as string).toLowerCase(),
      };
    }
    s = {
      wallets,
      anchorHash: anchor.hash!,
      legsDone: false,
      nextBlock: START.toString(),
      legs: [],
      txFrom: {},
      txCursor: 0,
      attribDone: false,
      blockTs: {},
      priceCache: {},
      entries: Object.fromEntries(wallets.map((w) => [w, []])),
      assembled: false,
      poolTokens,
    };
    save(s);
    console.log(`init: ${wallets.length} wallets, anchor ${s.anchorHash.slice(0, 12)}…`);
  }

  // Phase L: window logs
  if (!s.legsDone) {
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
              s.legs.push({
                pool: pool.address.toLowerCase(),
                txHash: (l.transactionHash as string).toLowerCase(),
                block: l.blockNumber!.toString(),
                logIndex: Number(l.logIndex),
                a0: (l.args.amount0 as bigint).toString(),
                a1: (l.args.amount1 as bigint).toString(),
              });
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
    }
    if (from > END) {
      s.legsDone = true;
      console.log(`phaseL DONE: ${s.legs.length} legs`);
    } else {
      console.log(`phaseL: block ${from}, legs ${s.legs.length}`);
    }
    save(s);
    if (!s.legsDone) return console.log("SLICE_END");
  }

  // Phase A: tx.from for legs' txs
  if (!s.attribDone) {
    const hashes = [...new Set(s.legs.map((l) => l.txHash))].sort();
    while (s.txCursor < hashes.length && Date.now() - t0 < SLICE_MS) {
      const batch = hashes.slice(s.txCursor, s.txCursor + 8);
      await Promise.all(
        batch.map(async (h) => {
          if (s!.txFrom[h]) return;
          for (let a = 0; a < 5; a++) {
            try {
              const tx = await client.getTransaction({ hash: h as `0x${string}` });
              s!.txFrom[h] = tx.from.toLowerCase();
              return;
            } catch {
              await sleep(700 * (a + 1));
            }
          }
          s!.txFrom[h] = "0xfailed";
        }),
      );
      s.txCursor += batch.length;
      await sleep(120);
    }
    save(s);
    if (s.txCursor < hashes.length) return console.log(`phaseA ${s.txCursor}/${hashes.length}\nSLICE_END`);
    s.attribDone = true;
    save(s);
    console.log("phaseA DONE");
  }

  // Phase P: price + assemble (chronological per wallet)
  if (!s.assembled) {
    const mine = s.legs
      .filter((l) => s!.wallets.includes(s!.txFrom[l.txHash] ?? ""))
      .sort((a, b) =>
        a.block === b.block ? a.logIndex - b.logIndex : Number(BigInt(a.block) - BigInt(b.block)),
      );
    // skip already-assembled count
    const doneCount = Object.values(s.entries).reduce((n, v) => n + v.length, 0);
    let idx = 0;
    let processed = 0;
    for (const leg of mine) {
      idx++;
      if (idx <= doneCount) continue;
      if (Date.now() - t0 >= SLICE_MS) {
        save(s);
        return console.log(`phaseP ${idx - 1}/${mine.length}\nSLICE_END`);
      }
      const wallet = s.txFrom[leg.txHash];
      const pt = s.poolTokens[leg.pool];
      const a0 = BigInt(leg.a0);
      const a1 = BigInt(leg.a1);
      let soldTok: string, soldRaw: bigint, boughtTok: string, boughtRaw: bigint;
      if (a0 > 0n) {
        soldTok = pt.t0; soldRaw = a0; boughtTok = pt.t1; boughtRaw = -a1;
      } else {
        soldTok = pt.t1; soldRaw = a1; boughtTok = pt.t0; boughtRaw = -a0;
      }
      const sold = TOKENS[soldTok];
      const bought = TOKENS[boughtTok];
      if (!s.blockTs[leg.block]) {
        const blk = await client.getBlock({ blockNumber: BigInt(leg.block) });
        s.blockTs[leg.block] = Number(blk.timestamp);
        await sleep(60);
      }
      const ts = s.blockTs[leg.block];
      const soldPx = await priceAt(s, soldTok, ts);
      const boughtPx = await priceAt(s, boughtTok, ts);
      const e6 = (x: number) => Math.round(x * 1_000_000);
      s.entries[wallet].push({
        timestamp: ts,
        sold_id: sold.id,
        sold_amount_e6: e6(Number(soldRaw) / 10 ** sold.decimals),
        sold_price_e6: e6(soldPx),
        sold_is_usd: !!sold.isUsd,
        bought_id: bought.id,
        bought_amount_e6: e6(Number(boughtRaw) / 10 ** bought.decimals),
        bought_price_e6: e6(boughtPx),
        bought_is_usd: !!bought.isUsd,
      });
      processed++;
      if (processed % 25 === 0) save(s);
    }
    s.assembled = true;
    save(s);
    console.log("phaseP DONE");
  }

  // Finalize batch.json
  const anchorBytes = hexToBytes32(s.anchorHash);
  const entries = s.wallets
    .filter((w) => s!.entries[w].length > 0)
    .map((w) => ({
      wallet: hexToBytes20(w),
      anchor_block_hash: anchorBytes,
      swaps: s!.entries[w],
    }));
  writeFileSync(OUT, JSON.stringify({ entries }, null, 1));
  console.log(`batch.json: ${entries.length} wallets, total legs ${entries.reduce((n, e) => n + e.swaps.length, 0)}`);
  console.log("BATCH_COMPLETE");
}

function hexToBytes20(addr: string): number[] {
  const h = addr.replace(/^0x/, "").padStart(40, "0");
  return Array.from({ length: 20 }, (_, i) => parseInt(h.slice(i * 2, i * 2 + 2), 16));
}
function hexToBytes32(hash: string): number[] {
  const h = hash.replace(/^0x/, "").padStart(64, "0");
  return Array.from({ length: 32 }, (_, i) => parseInt(h.slice(i * 2, i * 2 + 2), 16));
}

main().catch((e) => { console.error(e); process.exit(1); });
