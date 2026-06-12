// Recompute the Bukti completeness commitment (swapsRoot) for every wallet in a batch
// witness, mirroring the in-circuit Rust `swaps_merkle_root` byte-for-byte. Lets ANYONE
// independently verify that an on-chain attestation's swapsRoot covers the full, ordered
// swap set in the public witness — i.e. that no losing leg was cherry-picked out.
//
//   npx tsx src/swaps-root.ts [../batch.json]
import { readFileSync } from "node:fs";
import { keccak256, toHex, bytesToHex } from "viem";

interface Swap {
  timestamp: number;
  sold_id: number;
  sold_amount_e6: number;
  sold_price_e6: number;
  sold_is_usd: boolean;
  bought_id: number;
  bought_amount_e6: number;
  bought_price_e6: number;
  bought_is_usd: boolean;
}

const beU64 = (n: number | bigint) => {
  const b = new Uint8Array(8);
  let v = BigInt(n);
  for (let i = 7; i >= 0; i--) {
    b[i] = Number(v & 0xffn);
    v >>= 8n;
  }
  return b;
};
const beU32 = (n: number) => {
  const b = new Uint8Array(4);
  let v = n >>> 0;
  for (let i = 3; i >= 0; i--) {
    b[i] = v & 0xff;
    v >>>= 8;
  }
  return b;
};

/** Canonical 50-byte big-endian leaf encoding — must match Rust `swap_leaf`. */
function swapLeaf(s: Swap): `0x${string}` {
  const buf = new Uint8Array(50);
  let o = 0;
  const put = (a: Uint8Array) => {
    buf.set(a, o);
    o += a.length;
  };
  put(beU64(s.timestamp));
  put(beU32(s.sold_id));
  put(beU64(s.sold_amount_e6));
  put(beU64(s.sold_price_e6));
  buf[o++] = s.sold_is_usd ? 1 : 0;
  put(beU32(s.bought_id));
  put(beU64(s.bought_amount_e6));
  put(beU64(s.bought_price_e6));
  buf[o++] = s.bought_is_usd ? 1 : 0;
  return keccak256(buf);
}

/** Binary keccak Merkle root, duplicating the last node on odd levels — matches Rust. */
export function swapsMerkleRoot(swaps: Swap[]): `0x${string}` {
  if (swaps.length === 0) return `0x${"00".repeat(32)}`;
  let level = swaps.map(swapLeaf);
  while (level.length > 1) {
    const next: `0x${string}`[] = [];
    for (let i = 0; i < level.length; i += 2) {
      const left = level[i];
      const right = i + 1 < level.length ? level[i + 1] : level[i];
      next.push(keccak256(`0x${left.slice(2)}${right.slice(2)}` as `0x${string}`));
    }
    level = next;
  }
  return level[0];
}

function walletHex(w: number[] | string): string {
  if (typeof w === "string") return w.toLowerCase();
  return bytesToHex(Uint8Array.from(w));
}

function main() {
  const path = process.argv[2] ?? "../batch.json";
  const batch = JSON.parse(readFileSync(path, "utf8"));
  const out: Record<string, { swapsRoot: string; numSwaps: number }> = {};
  for (const e of batch.entries) {
    out[walletHex(e.wallet)] = { swapsRoot: swapsMerkleRoot(e.swaps), numSwaps: e.swaps.length };
  }
  console.log(JSON.stringify(out, null, 2));
  console.log(`\n${Object.keys(out).length} wallets — recomputed swapsRoot from witness ${toHex(0).slice(0, 0)}${path}`);
}

if (process.argv[1]?.endsWith("swaps-root.ts")) main();
