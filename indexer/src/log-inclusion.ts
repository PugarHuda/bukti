// End-to-end Mantle swap-log provenance (off-circuit): prove that a REAL Agni swap log is
// included in a real Mantle block, anchored to the block's receiptsRoot.
//
//   1. find a recent Agni Swap log (the pool + the non-standard PancakeV3 topic0),
//   2. rebuild that block's receipts trie (Mantle 4-field deposit-receipt encoding),
//   3. create an MPT inclusion proof for the swap's receipt (key = RLP(txIndex)),
//   4. verify the proof against header.receiptsRoot and confirm the Swap log is in the leaf.
//
// The proof nodes + header are exactly what a zkVM guest verifies in-circuit (keccak the
// header -> receiptsRoot -> walk path -> leaf contains the log). No trie rebuild needed
// in-circuit; sibling deposit receipts appear only as 32-byte hashes inside branch nodes.
//
//   npx tsx src/log-inclusion.ts
import { Trie } from "@ethereumjs/trie";
import { RLP } from "@ethereumjs/rlp";
import { hexToBytes, bytesToHex, keccak256 } from "viem";
import { headerRlp } from "./header-hash.js";

const RPC = process.env.INDEXER_RPC ?? "https://rpc.mantle.xyz";
const AGNI_POOL = "0x54169896d28dec0ffabe3b16f90f71323774949f"; // Agni WETH/WMNT 0.05%
const SWAP_TOPIC0 = "0x19b47279256b2a23a1665c810c8d55a1758940ee09377d4f8d26497a3577dc83"; // PancakeV3 fork

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

function receiptBody(r: any): any[] {
  return [
    Number(r.status),
    num(r.cumulativeGasUsed),
    b(r.logsBloom),
    r.logs.map((l: any) => [b(l.address), l.topics.map((t: string) => b(t)), b(l.data)]),
  ];
}
function encodeReceipt(r: any): Uint8Array {
  const enc = RLP.encode(receiptBody(r)); // 4-field for ALL types incl. Mantle 0x7e deposit
  const t = r.type === "0x7e" ? 0x7e : Number(r.type);
  return t === 0 ? enc : new Uint8Array([t, ...enc]);
}

async function main() {
  // 1. find a recent Agni Swap log
  const head = Number(await rpc("eth_blockNumber", []));
  const from = "0x" + (head - 9000).toString(16);
  const logs = await rpc("eth_getLogs", [
    { address: AGNI_POOL, topics: [SWAP_TOPIC0], fromBlock: from, toBlock: "latest" },
  ]);
  if (!logs.length) throw new Error("no recent Agni swap in window; widen range");
  const log = logs[logs.length - 1];
  const blockNumber = Number(log.blockNumber);
  const txHash = log.transactionHash;
  console.log(`Agni Swap log: tx ${txHash.slice(0, 14)}… in block ${blockNumber}`);

  // 2. rebuild the block's receipts trie with the Mantle deposit-receipt fix
  const tag = "0x" + blockNumber.toString(16);
  const [header, receipts] = await Promise.all([
    rpc("eth_getBlockByNumber", [tag, false]),
    rpc("eth_getBlockReceipts", [tag]),
  ]);
  const receiptsRoot = header.receiptsRoot.toLowerCase();
  const trie = await Trie.create();
  for (let i = 0; i < receipts.length; i++) {
    const key = i === 0 ? RLP.encode(Uint8Array.from([])) : RLP.encode(i);
    await trie.put(key, encodeReceipt(receipts[i]));
  }
  const rebuilt = bytesToHex(trie.root()).toLowerCase();
  console.log(`receiptsRoot — header ${receiptsRoot.slice(0, 14)} vs rebuilt ${rebuilt.slice(0, 14)} ${rebuilt === receiptsRoot ? "✓" : "✗"}`);
  if (rebuilt !== receiptsRoot) throw new Error("receiptsRoot mismatch — encoding wrong");

  // 3. the target receipt index (where our swap tx lives) + its MPT proof
  const target = receipts.find((r: any) => r.transactionHash.toLowerCase() === txHash.toLowerCase());
  const txIndex = Number(target.transactionIndex);
  const key = txIndex === 0 ? RLP.encode(Uint8Array.from([])) : RLP.encode(txIndex);
  const proof = await trie.createProof(key); // the path nodes root -> leaf
  console.log(`inclusion proof: receipt #${txIndex}, ${proof.length} MPT nodes, anchored to receiptsRoot`);

  // 4a. the proof's root node must hash to the header's receiptsRoot (the binding a circuit checks)
  const proofRoot = keccak256(proof[0]).toLowerCase();
  const rootBound = proofRoot === receiptsRoot;
  // 4b. cryptographically verify the path resolves the key to the target receipt value
  const value = await Trie.verifyProof(key, proof, { useKeyHashing: false } as any);
  const expectedLeaf = bytesToHex(encodeReceipt(target));
  const leafOk = !!value && bytesToHex(value).toLowerCase() === expectedLeaf.toLowerCase();
  console.log(`proof root == header.receiptsRoot: ${rootBound ? "✓" : "✗"} · MPT path resolves: ${value ? "✓" : "✗"} · leaf == target receipt: ${leafOk ? "✓" : "✗"}`);

  // 4b. confirm the Agni Swap log is actually inside the proven leaf
  const hasSwap = target.logs.some(
    (l: any) => l.address.toLowerCase() === AGNI_POOL && l.topics[0]?.toLowerCase() === SWAP_TOPIC0,
  );
  console.log(`proven leaf contains the Agni Swap log (topic0 0x19b47279…): ${hasSwap ? "✓" : "✗"}`);

  // 4c. the in-circuit anchor: keccak(header_rlp) == blockHash (EIP-2935 serves this hash on Mantle)
  console.log(`anchor: block ${blockNumber} hash ${header.hash.slice(0, 14)}… (readable on-chain via EIP-2935, live on Mantle/Arsia)`);

  const ok = rebuilt === receiptsRoot && rootBound && !!value && leafOk && hasSwap;

  // Dump a fixture for the in-circuit (Rust/zkVM) verifier: receiptsRoot + path nodes + key +
  // leaf — exactly the inputs a guest checks (no trie rebuild in-circuit).
  if (process.argv.includes("--dump")) {
    const fs = await import("node:fs");
    const swapLog = target.logs.find(
      (l: any) => l.address.toLowerCase() === AGNI_POOL && l.topics[0]?.toLowerCase() === SWAP_TOPIC0,
    );
    const fixture = {
      block: blockNumber,
      blockHash: header.hash,
      headerRlp: bytesToHex(headerRlp(header)), // keccak(headerRlp) == blockHash; field 5 = receiptsRoot
      receiptsRoot,
      txIndex,
      key: bytesToHex(key),
      proof: proof.map((n: Uint8Array) => bytesToHex(n)),
      leaf: expectedLeaf,
      swapLog: { address: swapLog.address, topic0: swapLog.topics[0], logIndex: Number(swapLog.logIndex) },
    };
    fs.mkdirSync("../provenance/log-proof/testdata", { recursive: true });
    fs.writeFileSync("../provenance/log-proof/testdata/inclusion.json", JSON.stringify(fixture, null, 2));
    console.log("wrote provenance/log-proof/testdata/inclusion.json");
  }

  console.log(`\n${ok ? "LOG_INCLUSION_OK" : "LOG_INCLUSION_FAIL"}: a real Agni swap log is provably included in Mantle block ${blockNumber}`);
  process.exit(ok ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
