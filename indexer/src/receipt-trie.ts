// Empirically rebuild a Mantle block's receipts trie and check it against the header's
// receiptsRoot — validating the fix for the type-0x7e deposit-receipt encoding blocker.
//
// EMPIRICAL FINDING (validated against live mainnet): Mantle encodes the type-0x7e deposit
// receipt with only the FOUR base consensus fields — `0x7e || RLP([status, cumulativeGasUsed,
// bloom, logs])` — with NO depositNonce and NO depositReceiptVersion. Standard op-alloy appends
// depositNonce (+ a version field), which is exactly why a stock op-alloy rebuild diverges from
// Mantle's real receiptsRoot. With the 4-field rule the rebuilt root matches across blocks.
// This is the off-circuit step that produces the MPT path a zkVM log-inclusion proof verifies.
//
//   npx tsx src/receipt-trie.ts [blockNumberDec [blockNumberDec ...]]
import { Trie } from "@ethereumjs/trie";
import { RLP } from "@ethereumjs/rlp";
import { hexToBytes } from "viem";

const RPC = process.env.INDEXER_RPC ?? "https://rpc.mantle.xyz";

async function rpc(method: string, params: any[]): Promise<any> {
  const r = await fetch(RPC, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const j = await r.json();
  if (j.error) throw new Error(`${method}: ${JSON.stringify(j.error)}`);
  return j.result;
}

const b = (h: string) => hexToBytes(h as `0x${string}`);
const num = (h: string) => BigInt(h);

/** Consensus RLP body shared by all receipt types: [status, cumGas, bloom, logs]. */
function receiptBody(r: any): any[] {
  const status = Number(r.status); // 0 or 1
  const cumGas = num(r.cumulativeGasUsed);
  const bloom = b(r.logsBloom);
  const logs = r.logs.map((l: any) => [b(l.address), l.topics.map((t: string) => b(t)), b(l.data)]);
  return [status, cumGas, bloom, logs];
}

/** Mantle-correct type-tagged consensus encoding of one receipt. */
function encodeReceipt(r: any): Uint8Array {
  const type = r.type; // "0x00" | "0x02" | "0x7e" ...
  const enc = RLP.encode(receiptBody(r)); // 4-field body for ALL types (Mantle deposit included)
  const t = type === "0x7e" ? 0x7e : Number(type);
  if (t === 0) return enc; // legacy: no type prefix
  return new Uint8Array([t, ...enc]); // typed (0x02 / 0x7e): prefix the type byte
}

async function rebuild(receipts: any[]): Promise<string> {
  const trie = await Trie.create();
  for (let i = 0; i < receipts.length; i++) {
    const key = i === 0 ? RLP.encode(Uint8Array.from([])) : RLP.encode(i); // RLP(index); RLP(0)=0x80
    await trie.put(key, encodeReceipt(receipts[i]));
  }
  return "0x" + Buffer.from(trie.root()).toString("hex");
}

async function checkBlock(blk: number): Promise<boolean> {
  const tag = "0x" + blk.toString(16);
  const [header, receipts] = await Promise.all([
    rpc("eth_getBlockByNumber", [tag, false]),
    rpc("eth_getBlockReceipts", [tag]),
  ]);
  const expected = header.receiptsRoot.toLowerCase();
  const got = (await rebuild(receipts)).toLowerCase();
  const ok = got === expected;
  const hasDeposit = receipts.some((r: any) => r.type === "0x7e");
  console.log(
    `${ok ? "✓" : "✗"} block ${blk} — ${receipts.length} receipts${hasDeposit ? " (incl 0x7e deposit)" : ""} — root ${got.slice(0, 14)} ${ok ? "MATCH" : "!= " + expected.slice(0, 14)}`,
  );
  return ok;
}

async function main() {
  const blocks = process.argv.slice(2).map(Number);
  if (blocks.length === 0) blocks.push(94731644, 94800892, 94461564, 94040444, 94731643);
  let pass = 0;
  for (const blk of blocks) {
    try {
      if (await checkBlock(blk)) pass++;
    } catch (e: any) {
      console.log(`✗ block ${blk} — ${e.message}`);
    }
  }
  console.log(`\n${pass === blocks.length ? "RECEIPT_TRIE_OK" : "RECEIPT_TRIE_FAIL"}: ${pass}/${blocks.length} Mantle receiptsRoots reproduced`);
  process.exit(pass === blocks.length ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
