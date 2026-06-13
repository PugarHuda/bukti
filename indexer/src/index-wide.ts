// index-wide.ts — build the WIDE 100-wallet witness: ~105 active directional traders
// (4..80 swaps; MM-bot monsters >80 excluded) discovered across ALL priceable Mantle
// V3-fork pools in the ClawHack window. Attribution by swap recipient (topics[2]).
//
// Phases (resumable via batch-wide-state.json):
//   L  one scan over the window, store every cohort leg on a priceable pool
//   P  per leg: block timestamp + historical Pyth prices (cached) -> witness swap
// Output: ../batch-wide.json (zkVM witness) — same shape as batch.json.
//
//   npx tsx src/index-wide.ts
import { createPublicClient, http, type Address } from "viem";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { TOKENS, MANTLE_MAINNET } from "./config.js";

const RPC = process.env.INDEXER_RPC ?? MANTLE_MAINNET.rpc;
const SWAP_TOPIC0 = "0x19b47279256b2a23a1665c810c8d55a1758940ee09377d4f8d26497a3577dc83";
const PYTH = "https://hermes.pyth.network";
const CHUNK = 9000n;
const SLICE_MS = 7 * 60 * 1000;
const STATE = "batch-wide-state.json";
const OUT = "../batch-wide.json";
const MIN_SWAPS = 4, MAX_SWAPS = 80;

const client = createPublicClient({ transport: http(RPC) });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const topicAddr = (t: string) => ("0x" + t.slice(26)).toLowerCase();

async function rpc(method: string, params: any[]): Promise<any> {
  for (let a = 0; a < 6; a++) {
    const r = await fetch(RPC, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) });
    const j = await r.json();
    if (j.error) { if (a < 5) { await sleep(1500 * (a + 1)); continue; } throw new Error(`${method}: ${JSON.stringify(j.error)}`); }
    return j.result;
  }
}

interface Leg { pool: string; wallet: string; block: string; logIndex: number; a0: string; a1: string }
interface WSwap { timestamp: number; sold_id: number; sold_amount_e6: number; sold_price_e6: number; sold_is_usd: boolean; bought_id: number; bought_amount_e6: number; bought_price_e6: number; bought_is_usd: boolean }
interface State {
  window: { start: number; end: number };
  anchorHash: string;
  cohort: string[];
  pools: string[];
  poolTokens: Record<string, { t0: string; t1: string }>;
  legsDone: boolean; nextBlock: number; legs: Leg[];
  blockTs: Record<string, number>; priceCache: Record<string, number>;
  entries: Record<string, WSwap[]>; pCursor: number; assembled: boolean;
}

function load(): State | null { return existsSync(STATE) ? JSON.parse(readFileSync(STATE, "utf8")) : null; }
function save(s: State) { writeFileSync(STATE, JSON.stringify(s)); }

async function poolTokens(pool: string): Promise<{ t0: string; t1: string } | null> {
  try {
    const [t0, t1] = await Promise.all([
      rpc("eth_call", [{ to: pool, data: "0x0dfe1681" }, "latest"]),
      rpc("eth_call", [{ to: pool, data: "0xd21220a7" }, "latest"]),
    ]);
    if (!t0 || t0.length < 66) return null;
    return { t0: topicAddr(t0), t1: topicAddr(t1) };
  } catch { return null; }
}

async function priceAt(s: State, token: string, tsSec: number): Promise<number> {
  const info = TOKENS[token];
  if (!info) throw new Error(`unknown token ${token}`);
  if (info.isUsd) return 1;
  if (!info.pythFeedId) throw new Error(`no feed ${info.symbol}`);
  const minute = Math.floor(tsSec / 60) * 60;
  const key = `${info.pythFeedId}:${minute}`;
  if (s.priceCache[key]) return s.priceCache[key];
  for (let a = 0; a < 8; a++) {
    const res = await fetch(`${PYTH}/v2/updates/price/${minute}?ids[]=${info.pythFeedId}`);
    if (res.status === 429 || res.status >= 500) { await sleep(3000 * (a + 1)); continue; }
    if (!res.ok) throw new Error(`pyth ${res.status} ${info.symbol}@${minute}`);
    const j: any = await res.json();
    const p = j?.parsed?.[0]?.price;
    if (!p) throw new Error(`no pyth ${info.symbol}@${minute}`);
    const px = Number(p.price) * 10 ** Number(p.expo);
    s.priceCache[key] = px; await sleep(1600); return px;
  }
  throw new Error(`pyth rate-limited ${info.symbol}@${minute}`);
}

function bytes(hex: string, n: number): number[] {
  const h = hex.replace(/^0x/, "").padStart(n * 2, "0");
  return Array.from({ length: n }, (_, i) => parseInt(h.slice(i * 2, i * 2 + 2), 16));
}

async function main() {
  const t0 = Date.now();
  let s = load();
  if (!s) {
    const d = JSON.parse(readFileSync("clawhack-cohort-wide.json", "utf8"));
    const cohort = d.wallets.filter((w: any) => w.swaps >= MIN_SWAPS && w.swaps <= MAX_SWAPS).map((w: any) => w.wallet.toLowerCase());
    const pools: string[] = d.pools.map((p: any) => p.pool.toLowerCase());
    const pt: State["poolTokens"] = {};
    for (const p of pools) { const t = await poolTokens(p); if (t) pt[p] = t; }
    const anchor = await client.getBlock({ blockNumber: BigInt(d.window.end) });
    s = {
      window: d.window, anchorHash: anchor.hash!, cohort, pools: pools.filter((p) => pt[p]), poolTokens: pt,
      legsDone: false, nextBlock: d.window.start, legs: [],
      blockTs: {}, priceCache: {}, entries: Object.fromEntries(cohort.map((w: string) => [w, []])), pCursor: 0, assembled: false,
    };
    save(s);
    console.log(`init: cohort ${cohort.length} wallets, ${s.pools.length} priceable pools, window ${d.window.start}..${d.window.end}`);
  }
  const cohortSet = new Set(s.cohort);
  const poolSet = new Set(s.pools);

  // Phase L: one scan, store cohort legs on priceable pools
  if (!s.legsDone) {
    let lo = s.nextBlock;
    while (lo <= s.window.end && Date.now() - t0 < SLICE_MS) {
      const hi = Math.min(lo + Number(CHUNK) - 1, s.window.end);
      let chunk: any[];
      try { chunk = await rpc("eth_getLogs", [{ topics: [SWAP_TOPIC0], fromBlock: "0x" + lo.toString(16), toBlock: "0x" + hi.toString(16) }]); }
      catch (e: any) { console.error(`chunk ${lo}: ${e.message}`); lo = hi + 1; s.nextBlock = lo; continue; }
      for (const l of chunk) {
        const pool = l.address.toLowerCase();
        const wallet = l.topics?.[2] ? topicAddr(l.topics[2]) : null;
        if (!wallet || !cohortSet.has(wallet) || !poolSet.has(pool)) continue;
        const data = l.data.slice(2);
        const a0 = BigInt("0x" + data.slice(0, 64)), a1 = BigInt("0x" + data.slice(64, 128));
        const toS = (x: bigint) => (x >= 1n << 255n ? x - (1n << 256n) : x).toString();
        s.legs.push({ pool, wallet, block: BigInt(l.blockNumber).toString(), logIndex: Number(l.logIndex), a0: toS(a0), a1: toS(a1) });
      }
      lo = hi + 1; s.nextBlock = lo;
    }
    if (lo > s.window.end) { s.legsDone = true; console.log(`phaseL DONE: ${s.legs.length} cohort legs`); }
    else { console.log(`phaseL: block ${lo}, legs ${s.legs.length}`); }
    save(s);
    if (!s.legsDone) return console.log("SLICE_END");
  }

  // Phase P: price + assemble chronologically
  if (!s.assembled) {
    const mine = s.legs.slice().sort((a, b) => a.block === b.block ? a.logIndex - b.logIndex : Number(BigInt(a.block) - BigInt(b.block)));
    for (; s.pCursor < mine.length; s.pCursor++) {
      if (Date.now() - t0 >= SLICE_MS) { save(s); return console.log(`phaseP ${s.pCursor}/${mine.length}\nSLICE_END`); }
      const leg = mine[s.pCursor];
      const pt = s.poolTokens[leg.pool];
      const a0 = BigInt(leg.a0), a1 = BigInt(leg.a1);
      let soldTok: string, soldRaw: bigint, boughtTok: string, boughtRaw: bigint;
      if (a0 > 0n) { soldTok = pt.t0; soldRaw = a0; boughtTok = pt.t1; boughtRaw = -a1; }
      else { soldTok = pt.t1; soldRaw = a1; boughtTok = pt.t0; boughtRaw = -a0; }
      const sold = TOKENS[soldTok], bought = TOKENS[boughtTok];
      if (!sold || !bought || soldRaw <= 0n || boughtRaw <= 0n) continue;
      if (!s.blockTs[leg.block]) { const blk = await client.getBlock({ blockNumber: BigInt(leg.block) }); s.blockTs[leg.block] = Number(blk.timestamp); await sleep(50); }
      const ts = s.blockTs[leg.block];
      const soldPx = await priceAt(s, soldTok, ts), boughtPx = await priceAt(s, boughtTok, ts);
      const e6 = (x: number) => Math.round(x * 1_000_000);
      s.entries[leg.wallet].push({
        timestamp: ts,
        sold_id: sold.id, sold_amount_e6: e6(Number(soldRaw) / 10 ** sold.decimals), sold_price_e6: e6(soldPx), sold_is_usd: !!sold.isUsd,
        bought_id: bought.id, bought_amount_e6: e6(Number(boughtRaw) / 10 ** bought.decimals), bought_price_e6: e6(boughtPx), bought_is_usd: !!bought.isUsd,
      });
      if (s.pCursor % 25 === 0) { save(s); console.log(`  priced ${s.pCursor}/${mine.length}`); }
    }
    s.assembled = true; save(s); console.log("phaseP DONE");
  }

  // Finalize witness
  const anchorBytes = bytes(s.anchorHash, 32);
  const entries = s.cohort.filter((w) => s!.entries[w].length > 0).map((w) => ({ wallet: bytes(w, 20), anchor_block_hash: anchorBytes, swaps: s!.entries[w] }));
  writeFileSync(OUT, JSON.stringify({ entries }, null, 1));
  console.log(`batch-wide.json: ${entries.length} wallets, ${entries.reduce((n, e) => n + e.swaps.length, 0)} legs`);
  console.log("WIDE_BATCH_COMPLETE");
}
main().catch((e) => { console.error(e); process.exit(1); });
