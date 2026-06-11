// QA: replicate the live leaderboard scan against BuktiAttestation v2.
//   npx tsx src/qa-board.ts
import { createPublicClient, http, parseAbiItem } from "viem";

const client = createPublicClient({ transport: http("https://rpc.sepolia.mantle.xyz") });
const ATTEST = "0x2EB832F24136c24A3B38D4b06D3318C48B618163" as const;
const EV = parseAbiItem(
  "event AttestationSubmitted(address indexed wallet, address indexed attester, int64 sharpeMilli, uint32 maxDrawdownBps, int64 roiBps, uint64 volumeUsdE6, bytes32 anchorBlockHash)",
);

async function main() {
  const latest = await client.getBlockNumber();
  const rows: { w: string; s: bigint; v: bigint }[] = [];
  for (let from = 39795000n; from <= latest; from += 9000n) {
    const to = from + 8999n > latest ? latest : from + 8999n;
    const logs = await client.getLogs({ address: ATTEST, event: EV, fromBlock: from, toBlock: to });
    for (const l of logs) rows.push({ w: l.args.wallet as string, s: l.args.sharpeMilli as bigint, v: l.args.volumeUsdE6 as bigint });
  }
  rows.sort((a, b) => (b.s > a.s ? 1 : -1));
  console.log(`leaderboard rows: ${rows.length}`);
  for (const r of rows.slice(0, 8))
    console.log(`  ${r.w}  score ${(Number(r.s) / 1000).toFixed(3)}  vol $${(Number(r.v) / 1e6).toFixed(0)}`);
  console.log(rows.length >= 25 ? "BOARD_OK" : "BOARD_INCOMPLETE");
}
main().catch((e) => { console.error(e); process.exit(1); });
