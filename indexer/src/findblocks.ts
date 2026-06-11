// Binary-search Mantle mainnet block numbers for the ClawHack window (Apr 15–30, 2026).
//   npx tsx src/findblocks.ts
import { createPublicClient, http } from "viem";
import { MANTLE_MAINNET } from "./config.js";

const client = createPublicClient({ transport: http(MANTLE_MAINNET.rpc) });

async function blockAt(ts: number): Promise<bigint> {
  let lo = 1n;
  let hi = await client.getBlockNumber();
  while (lo < hi) {
    const mid = (lo + hi) / 2n;
    const b = await client.getBlock({ blockNumber: mid });
    if (Number(b.timestamp) < ts) lo = mid + 1n;
    else hi = mid;
  }
  return lo;
}

async function main() {
  const start = Date.UTC(2026, 3, 15, 0, 0, 0) / 1000; // Apr 15 00:00 UTC
  const end = Date.UTC(2026, 3, 30, 23, 59, 59) / 1000; // Apr 30 23:59 UTC
  const b1 = await blockAt(start);
  const b2 = await blockAt(end);
  console.log(JSON.stringify({ startTs: start, endTs: end, startBlock: Number(b1), endBlock: Number(b2), span: Number(b2 - b1) }));
}
main().catch((e) => { console.error(e); process.exit(1); });
