// QA: prove the on-chain completeness commitment matches the public witness.
// For every wallet in the batch, read getCompleteness(wallet) from the deployed v3
// BuktiAttestation and assert its swapsRoot/numSwaps equal the root recomputed from
// batch.json by the independent TS mirror — i.e. the attestation provably covers the FULL,
// un-cherry-picked swap set.
//
//   npx tsx src/qa-completeness.ts <v3-attestation-address> [../batch.json]
import { readFileSync } from "node:fs";
import { createPublicClient, http, parseAbi, bytesToHex } from "viem";
import { swapsMerkleRoot } from "./swaps-root.js";

const ADDR = (process.argv[2] ?? "").trim();
const BATCH = process.argv[3] ?? "../batch.json";
if (!/^0x[0-9a-fA-F]{40}$/.test(ADDR)) {
  console.error("usage: tsx src/qa-completeness.ts <v3-attestation-address> [batch.json]");
  process.exit(1);
}

const client = createPublicClient({ transport: http("https://rpc.sepolia.mantle.xyz") });
const ABI = parseAbi([
  "function getCompleteness(address wallet) view returns (bytes32 swapsRoot, uint32 numSwaps, bool exists)",
]);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function withRetry<T>(fn: () => Promise<T>, n = 4): Promise<T> {
  let e: unknown;
  for (let i = 0; i < n; i++) {
    try {
      return await fn();
    } catch (err) {
      e = err;
      await sleep(500 * (i + 1));
    }
  }
  throw e;
}

async function main() {
  const batch = JSON.parse(readFileSync(BATCH, "utf8"));
  let pass = 0,
    fail = 0;
  for (const e of batch.entries) {
    const wallet = bytesToHex(Uint8Array.from(e.wallet)) as `0x${string}`;
    const expectRoot = swapsMerkleRoot(e.swaps).toLowerCase();
    const [root, numSwaps, exists] = await withRetry(() =>
      client.readContract({ address: ADDR as `0x${string}`, abi: ABI, functionName: "getCompleteness", args: [wallet] }),
    );
    const ok = exists && root.toLowerCase() === expectRoot && Number(numSwaps) === e.swaps.length;
    console.log(
      `${ok ? "✓" : "✗"} ${wallet.slice(0, 10)} root ${root.slice(0, 12)} legs ${Number(numSwaps)}/${e.swaps.length}`,
    );
    ok ? pass++ : fail++;
  }
  console.log(`\n${fail === 0 ? "COMPLETENESS_OK" : "COMPLETENESS_FAIL"}: ${pass}/${pass + fail} on-chain roots match the witness`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
