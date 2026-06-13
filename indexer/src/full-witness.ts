// Assemble the FULL-integration witness: N real Agni swaps on the USDT/WMNT pool, each with a
// receipt-trie inclusion proof + the block header RLP. The guest proves each is genuine Mantle
// chain data and decodes the USD notional from the proven log.
//   npx tsx src/full-witness.ts [N]
import { writeFileSync } from "node:fs";
import { Trie } from "@ethereumjs/trie";
import { RLP } from "@ethereumjs/rlp";
import { hexToBytes, bytesToHex, keccak256 } from "viem";
import { headerRlp } from "./header-hash.js";

const RPC = process.env.INDEXER_RPC ?? "https://rpc.mantle.xyz";
const POOL = "0xd08c50f7e69e9aeb2867deff4a8053d9a855e26a"; // Agni USDT/WMNT (USDT=token0, 6dec=USD)
const SWAP_TOPIC0 = "0x19b47279256b2a23a1665c810c8d55a1758940ee09377d4f8d26497a3577dc83";

async function rpc(method: string, params: any[]): Promise<any> {
  const r = await fetch(RPC, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) });
  const j = await r.json();
  if (j.error) throw new Error(`${method}: ${JSON.stringify(j.error)}`);
  return j.result;
}
const b = (h: string) => hexToBytes(h as `0x${string}`);
const num = (h: string) => BigInt(h);

function encodeReceipt(r: any): Uint8Array {
  const body = [Number(r.status), num(r.cumulativeGasUsed), b(r.logsBloom), r.logs.map((l: any) => [b(l.address), l.topics.map((t: string) => b(t)), b(l.data)])];
  const enc = RLP.encode(body); // 4-field for ALL types incl. Mantle 0x7e deposit
  const t = r.type === "0x7e" ? 0x7e : Number(r.type);
  return t === 0 ? enc : new Uint8Array([t, ...enc]);
}

async function swapWitness(blockNumber: number, txHash: string) {
  const tag = "0x" + blockNumber.toString(16);
  const [header, receipts] = await Promise.all([rpc("eth_getBlockByNumber", [tag, false]), rpc("eth_getBlockReceipts", [tag])]);
  const trie = await Trie.create();
  for (let i = 0; i < receipts.length; i++) {
    const key = i === 0 ? RLP.encode(Uint8Array.from([])) : RLP.encode(i);
    await trie.put(key, encodeReceipt(receipts[i]));
  }
  if (bytesToHex(trie.root()).toLowerCase() !== header.receiptsRoot.toLowerCase()) throw new Error(`receiptsRoot mismatch @ ${blockNumber}`);
  const target = receipts.find((r: any) => r.transactionHash.toLowerCase() === txHash.toLowerCase());
  const txIndex = Number(target.transactionIndex);
  const key = txIndex === 0 ? RLP.encode(Uint8Array.from([])) : RLP.encode(txIndex);
  const proof = await trie.createProof(key);
  // sanity: proof root == header receiptsRoot
  if (keccak256(proof[0]).toLowerCase() !== header.receiptsRoot.toLowerCase()) throw new Error("proof root mismatch");
  return {
    blockHash: header.hash,
    headerRlp: bytesToHex(headerRlp(header)),
    proof: proof.map((n: Uint8Array) => bytesToHex(n)),
    key: bytesToHex(key),
    pool: POOL,
    topic0: SWAP_TOPIC0,
  };
}

async function main() {
  const N = Number(process.argv[2] ?? 3);
  const head = Number(await rpc("eth_blockNumber", []));
  let logs: any[] = [];
  for (let hi = head; hi > head - 180000 && logs.length < N; hi -= 9000) {
    const lo = hi - 8999;
    const chunk = await rpc("eth_getLogs", [{ address: POOL, topics: [SWAP_TOPIC0], fromBlock: "0x" + lo.toString(16), toBlock: "0x" + hi.toString(16) }]);
    logs = [...chunk, ...logs];
  }
  if (logs.length < N) throw new Error(`only ${logs.length} swaps in 180k blocks; lower N`);
  const picked = logs.slice(-N);
  const swaps = [];
  let vol = 0n;
  for (const l of picked) {
    const w = await swapWitness(Number(l.blockNumber), l.transactionHash);
    swaps.push(w);
    const a0 = BigInt("0x" + l.data.slice(2, 66));
    const amount0 = a0 >= 1n << 255n ? a0 - (1n << 256n) : a0;
    vol += amount0 < 0n ? -amount0 : amount0;
    console.log(`✓ swap ${l.transactionHash.slice(0, 12)} block ${Number(l.blockNumber)} · |amount0| $${(Number(amount0 < 0n ? -amount0 : amount0) / 1e6).toFixed(4)}`);
  }
  writeFileSync("../provenance/log-proof/testdata/full-input.json", JSON.stringify({ swaps }, null, 2));
  console.log(`\nwrote full-input.json — ${swaps.length} swaps, total volume $${(Number(vol) / 1e6).toFixed(4)}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
