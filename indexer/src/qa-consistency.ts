// QA: every score shown in the static board-data.json (derived from the public witness)
// must EQUAL the score attested on-chain (from the proof). If these ever diverge, the
// site is showing numbers the proof didn't certify.
//   npx tsx src/qa-consistency.ts
import { readFileSync } from "node:fs";
import { createPublicClient, http, parseAbi } from "viem";

const client = createPublicClient({ transport: http("https://rpc.sepolia.mantle.xyz") });
const ATTEST = "0x2EB832F24136c24A3B38D4b06D3318C48B618163" as const;
const ABI = parseAbi(["function getSharpeMilli(address) view returns (int64, bool)"]);

async function main() {
  const board = JSON.parse(readFileSync("../web/public/board-data.json", "utf8"));
  let pass = 0, fail = 0;
  for (const r of board.rows) {
    let onchain: readonly [bigint, boolean] | null = null;
    for (let a = 0; a < 4; a++) {
      try {
        onchain = (await client.readContract({
          address: ATTEST, abi: ABI, functionName: "getSharpeMilli", args: [r.wallet],
        })) as any;
        break;
      } catch { await new Promise((res) => setTimeout(res, 800 * (a + 1))); }
    }
    if (!onchain) { console.log(`  RPC-FAIL ${r.wallet}`); fail++; continue; }
    const chainMilli = Number(onchain[0]);
    const boardMilli = Math.round(r.score * 1000);
    const ok = onchain[1] && chainMilli === boardMilli;
    if (ok) pass++;
    else { fail++; console.log(`  MISMATCH ${r.wallet.slice(0, 10)} board=${boardMilli} chain=${chainMilli} exists=${onchain[1]}`); }
    await new Promise((res) => setTimeout(res, 120));
  }
  console.log(`\nconsistency: ${pass}/${board.rows.length} match on-chain, ${fail} fail`);
  console.log(fail === 0 ? "CONSISTENT_OK" : "INCONSISTENT");
  process.exit(fail === 0 ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(1); });
