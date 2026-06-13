// split-batch.ts — split a large witness (batch-wide.json) into memory-safe sub-batches,
// each <= MAX swaps (the 8GB prover maxed at ~626 swaps for 25 wallets), keeping every
// wallet's swaps whole and in one batch. Each sub-batch is proven independently and its
// attestation accumulates on-chain (per-wallet storage).
//
//   npx tsx src/split-batch.ts [maxSwapsPerBatch=560]
import { readFileSync, writeFileSync } from "node:fs";

const MAX = Number(process.argv[2] ?? 560);
const IN = "../batch-wide.json";

function main() {
  const batch = JSON.parse(readFileSync(IN, "utf8")) as { entries: any[] };
  // largest wallets first so bin-packing is tight
  const entries = [...batch.entries].sort((a, b) => b.swaps.length - a.swaps.length);
  const bins: any[][] = [];
  const binSwaps: number[] = [];
  for (const e of entries) {
    const n = e.swaps.length;
    let placed = false;
    for (let i = 0; i < bins.length; i++) {
      if (binSwaps[i] + n <= MAX) { bins[i].push(e); binSwaps[i] += n; placed = true; break; }
    }
    if (!placed) { bins.push([e]); binSwaps.push(n); }
  }
  console.log(`${batch.entries.length} wallets / ${batch.entries.reduce((a, e) => a + e.swaps.length, 0)} swaps -> ${bins.length} batches (<= ${MAX} swaps each)`);
  bins.forEach((b, i) => {
    const file = `../batch-wide-${i + 1}.json`;
    writeFileSync(file, JSON.stringify({ entries: b }, null, 1));
    console.log(`  batch ${i + 1}: ${b.length} wallets, ${binSwaps[i]} swaps -> ${file}`);
  });
  console.log(`SPLIT_DONE: ${bins.length}`);
}
main();
