import { createPublicClient, http, parseAbiItem, type Address } from "viem";
import { MANTLE_MAINNET, POOLS, TOKENS } from "./config.js";

const POOL_ABI = [
  parseAbiItem("function token0() view returns (address)"),
  parseAbiItem("function token1() view returns (address)"),
  parseAbiItem("function fee() view returns (uint24)"),
];

async function main() {
  const client = createPublicClient({ transport: http(MANTLE_MAINNET.rpc) });
  const latest = await client.getBlockNumber();
  console.log(`latest block ${latest}`);

  for (const pool of POOLS) {
    console.log(`\n== ${pool.label} (${pool.address}) ==`);
    try {
      const t0 = (await client.readContract({ address: pool.address as Address, abi: POOL_ABI, functionName: "token0" })) as string;
      const t1 = (await client.readContract({ address: pool.address as Address, abi: POOL_ABI, functionName: "token1" })) as string;
      console.log(`token0 ${t0} (${TOKENS[t0.toLowerCase()]?.symbol ?? "?"})`);
      console.log(`token1 ${t1} (${TOKENS[t1.toLowerCase()]?.symbol ?? "?"})`);
    } catch (e) {
      console.log(`token0/1 read FAILED: ${(e as Error).message}`);
    }
    // Any logs at all in the last 9000 blocks?
    try {
      const logs = await client.getLogs({
        address: pool.address as Address,
        fromBlock: latest - 9000n,
        toBlock: latest,
      });
      console.log(`raw logs (any event), last 9000 blocks: ${logs.length}`);
      const topics = new Map<string, number>();
      for (const l of logs) {
        const t = l.topics[0] ?? "none";
        topics.set(t, (topics.get(t) ?? 0) + 1);
      }
      for (const [t, n] of topics) console.log(`  topic0 ${t}: ${n}`);
      if (logs.length > 0) {
        const s = logs[0];
        console.log(`  sample log: ${s.topics.length} topics, data ${(s.data.length - 2) / 2} bytes, tx ${s.transactionHash}`);
      }
    } catch (e) {
      console.log(`raw getLogs FAILED: ${(e as Error).message}`);
    }
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
