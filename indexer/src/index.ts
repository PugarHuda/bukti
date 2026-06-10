// Bukti indexer v2: extract a wallet/agent's RAW swap legs from Mantle DeFi logs,
// price each leg at its trade-time (historical Bybit 1-min klines), and write a witness
// (swaps.json) for the zkVM — which performs the cost-basis PnL reconstruction itself.
//
// Usage:
//   npm run index -- --wallet 0xAGENT [--pool 0xPOOL] [--from 0] [--to latest] [--out ../swaps.json]
//
// v2 changes (post-QA):
// - Emits RAW swap legs (token ids, amounts e6, historical prices e6) — PnL is computed
//   inside the zkVM, not here.
// - Historical pricing via Bybit spot klines at each swap's block timestamp (no API key)
//   — pricing at "latest" collapses price-movement PnL to ~0 and is wrong.
// - Attribution via tx.from (the actual trader), so router-mediated EOA swaps are
//   captured — not just pool-direct counterparties.
//
// Scope notes (documented honestly): Agni (PancakeV3-fork) pools only; Merchant Moe LB
// bin accounting deferred; in-window round-trips only (the zkVM skips disposals beyond
// tracked inventory).

import { createPublicClient, http, parseAbiItem, type Address, type Log } from "viem";
import { writeFileSync } from "node:fs";
import { BYBIT_API, MANTLE_MAINNET, POOLS, TOKENS, type PoolInfo } from "./config.js";

// Agni is a PancakeSwap-V3 fork: its Swap event carries two extra params
// (protocolFeesToken0/1), so topic0 = 0x19b47279… (not the vanilla UniV3 0xc42079…).
const SWAP_EVENT = parseAbiItem(
  "event Swap(address indexed sender, address indexed recipient, int256 amount0, int256 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick, uint128 protocolFeesToken0, uint128 protocolFeesToken1)",
);

const POOL_ABI = [
  parseAbiItem("function token0() view returns (address)"),
  parseAbiItem("function token1() view returns (address)"),
];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** getLogs chunked to the RPC's 10k-block limit, with backoff on rate limits. */
async function getLogsChunked(
  client: ReturnType<typeof createPublicClient>,
  base: { address: Address; event: typeof SWAP_EVENT },
  fromBlock: bigint,
  toBlock: bigint,
): Promise<any[]> {
  const CHUNK = 9000n;
  const out: any[] = [];
  for (let start = fromBlock; start <= toBlock; start += CHUNK) {
    const end = start + CHUNK - 1n > toBlock ? toBlock : start + CHUNK - 1n;
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        const logs = await client.getLogs({ ...base, fromBlock: start, toBlock: end });
        out.push(...logs);
        break;
      } catch (e) {
        if (attempt === 4 || !/rate limit/i.test((e as Error).message)) throw e;
        await sleep(1000 * (attempt + 1));
      }
    }
    await sleep(250);
  }
  return out;
}

interface Args {
  wallet: Address;
  pools: PoolInfo[];
  fromBlock: bigint;
  toBlock: bigint | "latest";
  out: string;
}

function parseArgs(): Args {
  const a = process.argv.slice(2);
  const get = (k: string) => {
    const i = a.indexOf(k);
    return i >= 0 ? a[i + 1] : undefined;
  };
  const wallet = get("--wallet");
  if (!wallet) throw new Error("--wallet 0x... is required");

  const poolArg = get("--pool");
  const pools = poolArg
    ? POOLS.filter((p) => p.address.toLowerCase() === poolArg.toLowerCase())
    : POOLS;

  return {
    wallet: wallet.toLowerCase() as Address,
    pools,
    fromBlock: BigInt(get("--from") ?? "0"),
    toBlock: (get("--to") as "latest") ?? "latest",
    out: get("--out") ?? "../swaps.json",
  };
}

// ---- Historical pricing: Pyth Benchmarks (signed price at the trade's timestamp) ----
// Timestamps are rounded to the minute so repeated swaps share cache entries, and calls
// are paced/backed-off hard because Hermes rate-limits the benchmarks endpoint.
// (Exchange kline APIs — Bybit/Binance/OKX — are ISP-blocked in some regions, so Pyth,
// which also matches the "verifiable signed price" thesis, is the primary source.)
const PYTH_HERMES = "https://hermes.pyth.network";
const priceCache = new Map<string, number>();
async function priceUsdAt(token: string, tsSec: number): Promise<number> {
  const info = TOKENS[token.toLowerCase()];
  if (!info) throw new Error(`unknown token ${token} (add to config TOKENS)`);
  if (info.isUsd) return 1;
  if (!info.pythFeedId) throw new Error(`no Pyth feed for ${info.symbol}`);

  const minute = Math.floor(tsSec / 60) * 60;
  const key = `${info.pythFeedId}:${minute}`;
  if (priceCache.has(key)) return priceCache.get(key)!;

  const url = `${PYTH_HERMES}/v2/updates/price/${minute}?ids[]=${info.pythFeedId}`;
  for (let attempt = 0; attempt < 8; attempt++) {
    const res = await fetch(url);
    if (res.status === 429 || res.status >= 500) {
      await sleep(3000 * (attempt + 1)); // Hermes benchmarks rate limit — back off hard
      continue;
    }
    if (!res.ok) throw new Error(`Pyth Benchmarks ${res.status} for ${info.symbol}@${minute}`);
    const json: any = await res.json();
    const p = json?.parsed?.[0]?.price;
    if (!p) throw new Error(`no Pyth price for ${info.symbol}@${minute}`);
    const px = Number(p.price) * 10 ** Number(p.expo);
    if (!(px > 0)) throw new Error(`bad Pyth price for ${info.symbol}@${minute}`);
    priceCache.set(key, px);
    await sleep(2500); // steady pacing between unique benchmark calls
    return px;
  }
  throw new Error(`Pyth Benchmarks rate-limited for ${info.symbol}@${minute}`);
}

// ---- witness types (must match Rust BuktiInput / Swap) ----
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

const e6 = (x: number) => Math.round(x * 1_000_000);

async function main() {
  const args = parseArgs();
  if (args.pools.length === 0) {
    console.error("No pools configured/selected (see src/config.ts POOLS).");
    process.exit(2);
  }

  const client = createPublicClient({ transport: http(MANTLE_MAINNET.rpc) });
  const latest = await client.getBlockNumber();
  const toBlock = args.toBlock === "latest" ? latest : args.toBlock;
  console.log(`Wallet ${args.wallet}`);
  console.log(`Scanning ${args.pools.length} pool(s), blocks ${args.fromBlock}..${toBlock}`);

  const blockTs = new Map<string, number>();
  const txFromCache = new Map<string, string>();
  const collected: { log: any; pool: PoolInfo }[] = [];

  for (const pool of args.pools) {
    if (pool.kind !== "univ3") {
      console.log(`  skip ${pool.label} (kind ${pool.kind} not supported in MVP)`);
      continue;
    }
    // Read token order on-chain so amount0/amount1 map to the right tokens.
    const [tok0, tok1] = await Promise.all([
      client.readContract({ address: pool.address as Address, abi: POOL_ABI, functionName: "token0" }),
      client.readContract({ address: pool.address as Address, abi: POOL_ABI, functionName: "token1" }),
    ]);
    pool.token0 = (tok0 as string).toLowerCase();
    pool.token1 = (tok1 as string).toLowerCase();
    if (!TOKENS[pool.token0] || !TOKENS[pool.token1]) {
      console.log(`  skip ${pool.label}: unconfigured token(s)`);
      continue;
    }

    // Fetch ALL swaps in the window, then attribute by tx.from (the real trader) —
    // recipient/sender filters miss router-mediated EOA swaps.
    const logs = await getLogsChunked(
      client,
      { address: pool.address as Address, event: SWAP_EVENT },
      args.fromBlock,
      toBlock,
    );
    let kept = 0;
    for (const log of logs) {
      const h = log.transactionHash as string;
      if (!txFromCache.has(h)) {
        const tx = await client.getTransaction({ hash: h as `0x${string}` });
        txFromCache.set(h, tx.from.toLowerCase());
        await sleep(60);
      }
      const from = txFromCache.get(h)!;
      const recipient = (log.args.recipient as string).toLowerCase();
      if (from === args.wallet || recipient === args.wallet) {
        collected.push({ log, pool });
        kept++;
      }
    }
    console.log(`  ${pool.label}: ${logs.length} swaps in window, ${kept} attributed to wallet`);
  }

  collected.sort((a, b) =>
    a.log.blockNumber === b.log.blockNumber
      ? Number(a.log.logIndex - b.log.logIndex)
      : Number(a.log.blockNumber - b.log.blockNumber),
  );

  const swaps: WitnessSwap[] = [];
  for (const { log, pool } of collected) {
    const a0 = log.args.amount0 as bigint;
    const a1 = log.args.amount1 as bigint;
    // PancakeV3/UniV3 sign convention (pool perspective): positive = pool received
    // (wallet sold/paid in), negative = pool sent out (wallet bought/received).
    let soldTok: string, soldRaw: bigint, boughtTok: string, boughtRaw: bigint;
    if (a0 > 0n) {
      soldTok = pool.token0!; soldRaw = a0; boughtTok = pool.token1!; boughtRaw = -a1;
    } else {
      soldTok = pool.token1!; soldRaw = a1; boughtTok = pool.token0!; boughtRaw = -a0;
    }
    const sold = TOKENS[soldTok];
    const bought = TOKENS[boughtTok];

    const bkey = log.blockNumber.toString();
    if (!blockTs.has(bkey)) {
      const blk = await client.getBlock({ blockNumber: log.blockNumber });
      blockTs.set(bkey, Number(blk.timestamp));
    }
    const ts = blockTs.get(bkey)!;

    const soldQty = Number(soldRaw) / 10 ** sold.decimals;
    const boughtQty = Number(boughtRaw) / 10 ** bought.decimals;
    const soldPx = await priceUsdAt(soldTok, ts);
    const boughtPx = await priceUsdAt(boughtTok, ts);

    swaps.push({
      timestamp: ts,
      sold_id: sold.id,
      sold_amount_e6: e6(soldQty),
      sold_price_e6: e6(soldPx),
      sold_is_usd: !!sold.isUsd,
      bought_id: bought.id,
      bought_amount_e6: e6(boughtQty),
      bought_price_e6: e6(boughtPx),
      bought_is_usd: !!bought.isUsd,
    });
  }

  const anchorBlock = await client.getBlock({ blockNumber: toBlock });
  const witness = {
    wallet: hexToBytes20(args.wallet),
    anchor_block_hash: hexToBytes32(anchorBlock.hash!),
    swaps,
  };
  writeFileSync(args.out, JSON.stringify(witness, null, 2));
  console.log(`\nWrote ${swaps.length} raw swap leg(s) -> ${args.out}`);
  console.log(`Anchor block ${toBlock} (${anchorBlock.hash})`);
  console.log("PnL/Sharpe are reconstructed inside the zkVM, not here.");
}

function hexToBytes20(addr: string): number[] {
  const h = addr.replace(/^0x/, "").padStart(40, "0");
  return Array.from({ length: 20 }, (_, i) => parseInt(h.slice(i * 2, i * 2 + 2), 16));
}
function hexToBytes32(hash: string): number[] {
  const h = hash.replace(/^0x/, "").padStart(64, "0");
  return Array.from({ length: 32 }, (_, i) => parseInt(h.slice(i * 2, i * 2 + 2), 16));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
