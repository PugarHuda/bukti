// Reconstruct a Mantle block header's RLP and verify keccak(header_rlp) == blockHash —
// the in-circuit anchor link (trusted blockHash from EIP-2935 -> header -> receiptsRoot).
// Mantle is post-Prague OP-stack (Arsia): 21 header fields incl. withdrawalsRoot, blob fields,
// parentBeaconBlockRoot, requestsHash. Validates we can bind a block hash to its receiptsRoot.
//
//   npx tsx src/header-hash.ts [blockDec ...]
import { RLP } from "@ethereumjs/rlp";
import { hexToBytes, keccak256, bytesToHex } from "viem";

const RPC = process.env.INDEXER_RPC ?? "https://rpc.mantle.xyz";
async function rpc(method: string, params: any[]) {
  const r = await fetch(RPC, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  return (await r.json()).result;
}

const bytes = (h: string) => hexToBytes(h as `0x${string}`);
// RLP-encode a quantity as a minimal big-endian integer (0 -> empty string).
const qty = (h: string) => {
  let v = BigInt(h);
  if (v === 0n) return new Uint8Array([]);
  const out: number[] = [];
  while (v > 0n) {
    out.unshift(Number(v & 0xffn));
    v >>= 8n;
  }
  return Uint8Array.from(out);
};

function headerRlp(h: any): Uint8Array {
  const fields = [
    bytes(h.parentHash),
    bytes(h.sha3Uncles),
    bytes(h.miner),
    bytes(h.stateRoot),
    bytes(h.transactionsRoot),
    bytes(h.receiptsRoot),
    bytes(h.logsBloom),
    qty(h.difficulty),
    qty(h.number),
    qty(h.gasLimit),
    qty(h.gasUsed),
    qty(h.timestamp),
    bytes(h.extraData),
    bytes(h.mixHash),
    bytes(h.nonce), // 8-byte string
    qty(h.baseFeePerGas),
    bytes(h.withdrawalsRoot),
    qty(h.blobGasUsed),
    qty(h.excessBlobGas),
    bytes(h.parentBeaconBlockRoot),
    bytes(h.requestsHash),
  ];
  return RLP.encode(fields);
}

async function check(blk: number): Promise<boolean> {
  const h = await rpc("eth_getBlockByNumber", ["0x" + blk.toString(16), false]);
  const got = keccak256(headerRlp(h)).toLowerCase();
  const ok = got === h.hash.toLowerCase();
  console.log(`${ok ? "✓" : "✗"} block ${blk} — keccak(header) ${got.slice(0, 14)} ${ok ? "==" : "!="} hash ${h.hash.slice(0, 14)} · receiptsRoot ${h.receiptsRoot.slice(0, 12)}`);
  return ok;
}

async function main() {
  const blocks = process.argv.slice(2).map(Number);
  if (!blocks.length) blocks.push(96585742, 94731644, 94040444, 96000000, 95500000);
  let pass = 0;
  for (const b of blocks) {
    try {
      if (await check(b)) pass++;
    } catch (e: any) {
      console.log(`✗ block ${b} — ${e.message}`);
    }
  }
  console.log(`\n${pass === blocks.length ? "HEADER_HASH_OK" : "HEADER_HASH_FAIL"}: ${pass}/${blocks.length} Mantle block hashes reproduced from header RLP`);
  process.exit(pass === blocks.length ? 0 : 1);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
