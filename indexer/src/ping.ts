// Connectivity smoke test: confirms the indexer can reach Mantle and read chain state.
//   npm run ping
import { createPublicClient, http } from "viem";
import { MANTLE_MAINNET, PYTH } from "./config.js";

async function main() {
  const client = createPublicClient({ transport: http(MANTLE_MAINNET.rpc) });

  const chainId = await client.getChainId();
  const block = await client.getBlockNumber();
  console.log(`Mantle RPC      : ${MANTLE_MAINNET.rpc}`);
  console.log(`chainId         : ${chainId} (expected ${MANTLE_MAINNET.chainId})`);
  console.log(`latest block    : ${block}`);

  // Hermes price sanity check (ETH/USD is a well-known feed).
  const ethUsd = "0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace";
  try {
    const res = await fetch(
      `${PYTH.hermes}/v2/updates/price/latest?ids[]=${ethUsd}`,
    );
    const json: any = await res.json();
    const p = json?.parsed?.[0]?.price;
    if (p) {
      const px = Number(p.price) * 10 ** Number(p.expo);
      console.log(`Pyth ETH/USD    : $${px.toFixed(2)} (Hermes ok)`);
    } else {
      console.log("Pyth ETH/USD    : (no parsed price returned)");
    }
  } catch (e) {
    console.log("Pyth Hermes     : fetch failed:", (e as Error).message);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
