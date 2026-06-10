// Find active wallets on the configured Agni pools by scanning recent real Swap events.
// Used to pick a demo address for the indexer.
//   npm run discover -- [--blocks 200000]
import { createPublicClient, http, parseAbiItem, type Address } from "viem";
import { MANTLE_MAINNET, POOLS } from "./config.js";

// Agni = PancakeSwap-V3 fork (Swap event has protocolFeesToken0/1; topic0 0x19b47279…).
const SWAP_EVENT = parseAbiItem(
  "event Swap(address indexed sender, address indexed recipient, int256 amount0, int256 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick, uint128 protocolFeesToken0, uint128 protocolFeesToken1)",
);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function getLogsRetry(client: any, params: any, tries = 5): Promise<any[]> {
  for (let i = 0; i < tries; i++) {
    try {
      return await client.getLogs(params);
    } catch (e) {
      const msg = (e as Error).message;
      if (i === tries - 1 || !/rate limit/i.test(msg)) throw e;
      await sleep(1000 * (i + 1)); // backoff on rate limit
    }
  }
  return [];
}

async function main() {
  const a = process.argv.slice(2);
  const blocksArg = a.indexOf("--blocks");
  const span = BigInt(blocksArg >= 0 ? a[blocksArg + 1] : "60000");
  const CHUNK = 9000n;

  const client = createPublicClient({ transport: http(MANTLE_MAINNET.rpc) });
  const latest = await client.getBlockNumber();
  const from = latest > span ? latest - span : 0n;
  console.log(`Scanning blocks ${from}..${latest} on ${POOLS.length} pool(s)`);

  const counts = new Map<string, number>();
  const txFrom = new Map<string, string>();
  let total = 0;
  for (const pool of POOLS) {
    for (let start = from; start <= latest; start += CHUNK) {
      const end = start + CHUNK - 1n > latest ? latest : start + CHUNK - 1n;
      try {
        const logs = await getLogsRetry(client, {
          address: pool.address as Address,
          event: SWAP_EVENT,
          fromBlock: start,
          toBlock: end,
        });
        for (const l of logs) {
          total++;
          // Attribute by tx.from (the actual trader), not recipient (often a router).
          const h = l.transactionHash as string;
          if (!txFrom.has(h)) {
            const tx = await client.getTransaction({ hash: h as `0x${string}` });
            txFrom.set(h, tx.from.toLowerCase());
            await sleep(60);
          }
          const r = txFrom.get(h)!;
          counts.set(r, (counts.get(r) ?? 0) + 1);
        }
      } catch (e) {
        console.log(`  chunk ${start}..${end} error: ${(e as Error).message}`);
      }
      await sleep(400); // throttle to respect public RPC limits
    }
  }

  const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12);
  console.log(`\nTotal swaps: ${total}. Top recipients:`);
  for (const [addr, n] of top) console.log(`  ${addr}  ${n} swap(s)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
