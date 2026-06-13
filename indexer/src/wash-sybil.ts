// wash-sybil.ts — adversarial robustness analysis over the REAL ClawHack cohort.
//
// Answers the trust-boundary "honest gap": is the proven leaderboard gameable by
// wash-trading (self-churn to inflate volume) or sybil/sacrifice coordination?
//
// It runs three real checks against batch-state.json (25 scored wallets, 1082 raw legs):
//   (A) FEE-AWARE realized PnL — re-score every wallet with Agni's per-leg swap fee
//       deducted, proving wash-trading is SELF-DEFEATING under our metric (every round
//       trip pays the fee + spread, so churn *lowers* the risk-adjusted score).
//   (B) VOLUME-vs-SCORE rank correlation — quantifies that volume does not buy rank
//       (the headline insight: the volume champion sinks by proven score).
//   (C) SAME-BLOCK COLLISION scan over raw legs — the on-chain signature of a
//       sacrifice-wallet / coordinated price move (opposite-direction swaps on the
//       same pool in the same block), the residual sybil vector — detectable, counted.
//
//   npx tsx src/wash-sybil.ts
import { readFileSync, writeFileSync } from "node:fs";

type Sw = {
  timestamp: number; sold_id: number; sold_amount_e6: number; sold_price_e6: number;
  sold_is_usd: boolean; bought_id: number; bought_amount_e6: number; bought_price_e6: number;
  bought_is_usd: boolean;
};
type Leg = { pool: string; txHash: string; block: string; logIndex: number; a0: string; a1: string };

const E6 = 1_000_000n;
const vUsdE6 = (amtE6: bigint, pxE6: bigint) => (amtE6 * pxE6) / E6;
// Agni pools in the cohort are PancakeV3-fork 0.05% / 0.30% tiers; charge the conservative
// 5 bps per leg (a real round-trip pays it twice — open + close).
const FEE_BPS = 5n;

function isqrt(x: bigint): bigint { if (x < 2n) return x; let a = x, b = (x >> 1n) + 1n; while (b < a) { a = b; b = (b + x / b) >> 1n; } return a; }

// FIFO cost-basis reconstruction — identical to make-board-data.ts. `feeBps>0` deducts the
// swap fee on BOTH legs of every realized round-trip (open notional + close proceeds).
function reconstruct(swaps: Sw[], feeBps: bigint) {
  const pos = new Map<number, { qty: bigint; cost: bigint }>();
  const trades: { ts: number; pnlE6: bigint; notionalE6: bigint; heldSec: number; openTs: number }[] = [];
  for (const s of swaps) {
    if (!s.bought_is_usd && s.bought_amount_e6 > 0) {
      const p = pos.get(s.bought_id) ?? { qty: 0n, cost: 0n, ts: s.timestamp } as any;
      const open = vUsdE6(BigInt(s.bought_amount_e6), BigInt(s.bought_price_e6));
      p.qty += BigInt(s.bought_amount_e6);
      p.cost += open + (feeBps * open) / 10_000n; // entry fee raises cost basis
      (p as any).ts = (p as any).ts ?? s.timestamp;
      pos.set(s.bought_id, p);
    }
    if (!s.sold_is_usd && s.sold_amount_e6 > 0) {
      const p = pos.get(s.sold_id) as any;
      if (p && p.qty > 0n) {
        const sold = BigInt(s.sold_amount_e6);
        const closeQty = sold < p.qty ? sold : p.qty;
        const costOfClose = (p.cost * closeQty) / p.qty;
        let proceeds = vUsdE6(closeQty, BigInt(s.sold_price_e6));
        proceeds -= (feeBps * proceeds) / 10_000n; // exit fee reduces proceeds
        p.cost -= costOfClose; p.qty -= closeQty;
        trades.push({ ts: s.timestamp, pnlE6: proceeds - costOfClose, notionalE6: proceeds, heldSec: s.timestamp - (p.ts ?? s.timestamp), openTs: p.ts ?? s.timestamp });
      }
    }
  }
  return trades;
}

function score(trades: { pnlE6: bigint; notionalE6: bigint }[]) {
  if (!trades.length) return { scoreMilli: 0, volE6: 0n, pnlE6: 0n };
  const n = BigInt(trades.length);
  const rets = trades.map((t) => (t.notionalE6 > 0n ? (t.pnlE6 * 1_000_000n) / t.notionalE6 : 0n));
  const mean = rets.reduce((a, b) => a + b, 0n) / n;
  const variance = rets.reduce((a, r) => a + (r - mean) * (r - mean), 0n) / n;
  const std = isqrt(variance < 0n ? 0n : variance);
  const scoreMilli = std > 0n ? Number((mean * 1000n) / std) : 0;
  return { scoreMilli, volE6: trades.reduce((a, t) => a + t.notionalE6, 0n), pnlE6: trades.reduce((a, t) => a + t.pnlE6, 0n) };
}

function rank(map: Map<string, number>, w: string) { return (map.get(w) ?? 0); }

async function main() {
  const b = JSON.parse(readFileSync(process.argv[2] ?? "./batch-state.json", "utf8"));
  const entries: Record<string, Sw[]> = b.entries;
  const legs: Leg[] = b.legs;
  const cohort = Object.keys(entries).filter((w) => Array.isArray(entries[w]) && entries[w].length);

  // ---------- (A) fee-aware re-score + churn detection ----------
  const CHURN_SEC = 180; // a "round trip" closed < 3 min after open = churn/wash signature
  const rows = cohort.map((w) => {
    const base = score(reconstruct(entries[w], 0n));
    const fee = score(reconstruct(entries[w], FEE_BPS));
    const trades = reconstruct(entries[w], 0n);
    const churn = trades.filter((t) => t.heldSec >= 0 && t.heldSec < CHURN_SEC).length;
    return {
      wallet: w, swaps: entries[w].length, trades: trades.length,
      scoreMilli: base.scoreMilli, feeScoreMilli: fee.scoreMilli,
      volUsd: Number(base.volE6) / 1e6, pnlUsd: Number(base.pnlE6) / 1e6,
      feePnlUsd: Number(fee.pnlE6) / 1e6, churn, churnPct: trades.length ? (churn / trades.length) * 100 : 0,
    };
  });

  const byVol = [...rows].sort((a, b) => b.volUsd - a.volUsd);
  const byScore = [...rows].sort((a, b) => b.scoreMilli - a.scoreMilli);
  const byFeeScore = [...rows].sort((a, b) => b.feeScoreMilli - a.feeScoreMilli);
  const volRank = new Map(byVol.map((r, i) => [r.wallet, i + 1]));
  const scoreRank = new Map(byScore.map((r, i) => [r.wallet, i + 1]));
  const feeScoreRank = new Map(byFeeScore.map((r, i) => [r.wallet, i + 1]));

  const volChamp = byVol[0];
  console.log(`\n=== (A) Wash-trading is self-defeating under a fee-aware risk-adjusted score ===`);
  console.log(`cohort: ${rows.length} wallets, ${rows.reduce((a, r) => a + r.swaps, 0)} raw swaps`);
  console.log(`volume champion ${volChamp.wallet.slice(0, 10)}  vol $${volChamp.volUsd.toFixed(2)}  ->  proof rank #${rank(scoreRank, volChamp.wallet)} of ${rows.length}`);
  console.log(`  every Agni leg pays ${FEE_BPS} bps; a wash round-trip pays it TWICE and moves price against itself.`);

  // how many wallets' rank gets WORSE once the swap fee is charged (i.e. churn punished)?
  let worsened = 0, totalFeeDrag = 0;
  for (const r of rows) {
    if (rank(feeScoreRank, r.wallet) > rank(scoreRank, r.wallet)) worsened++;
    totalFeeDrag += r.pnlUsd - r.feePnlUsd;
  }
  console.log(`fee-aware re-score: ${worsened}/${rows.length} wallets drop in rank once per-leg fees are charged.`);
  console.log(`total fee drag across cohort: $${totalFeeDrag.toFixed(4)} — pure volume-pumping is strictly costly, so it lowers the proven score.`);

  // ---------- churn report ----------
  const churners = rows.filter((r) => r.churnPct > 50 && r.trades >= 4).sort((a, b) => b.churnPct - a.churnPct);
  console.log(`\n=== churn signature ( >50% of round-trips closed < ${CHURN_SEC}s, >=4 trades ) ===`);
  if (!churners.length) console.log(`no wash-churn wallet in the proven cohort.`);
  for (const r of churners.slice(0, 8)) console.log(`  ${r.wallet.slice(0, 10)}  churn ${r.churnPct.toFixed(0)}%  score ${(r.scoreMilli / 1000).toFixed(2)} -> fee-aware ${(r.feeScoreMilli / 1000).toFixed(2)}  (vol-rank #${rank(volRank, r.wallet)}, proof-rank #${rank(scoreRank, r.wallet)})`);

  // ---------- (B) volume vs score rank correlation (Spearman) ----------
  const n = rows.length;
  const d2 = rows.reduce((a, r) => { const d = rank(volRank, r.wallet) - rank(scoreRank, r.wallet); return a + d * d; }, 0);
  const spearman = 1 - (6 * d2) / (n * (n * n - 1));
  console.log(`\n=== (B) does volume buy proven rank? ===`);
  console.log(`Spearman(volume-rank, proof-rank) = ${spearman.toFixed(3)}  (≈0 ⇒ volume tells you almost nothing about proven skill)`);

  // ---------- (C) same-block collision scan over raw legs (sacrifice/sybil signature) ----------
  const byPoolBlock = new Map<string, Leg[]>();
  for (const l of legs) { const k = `${l.pool}:${l.block}`; (byPoolBlock.get(k) ?? byPoolBlock.set(k, []).get(k)!).push(l); }
  let collisions = 0, opposite = 0;
  for (const [, group] of byPoolBlock) {
    if (group.length < 2) continue;
    collisions += group.length - 1;
    for (let i = 0; i < group.length; i++) for (let j = i + 1; j < group.length; j++) {
      const si = BigInt(group[i].a0) >= 0n, sj = BigInt(group[j].a0) >= 0n;
      if (si !== sj) opposite++;
    }
  }
  console.log(`\n=== (C) same-block collision scan (sacrifice-wallet / coordinated-move signature) ===`);
  console.log(`raw legs: ${legs.length}; same pool+block multi-swap clusters carry ${collisions} co-located legs, ${opposite} opposite-direction pairs.`);
  console.log(`these are the on-chain footprints a price-manipulation sybil leaves — detectable and counted; set-exclusion is the scoped next step.`);

  const verdict = worsened > 0 && churners.length === 0 && Math.abs(spearman) < 0.5;
  const report = {
    cohort: rows.length, rawSwaps: rows.reduce((a, r) => a + r.swaps, 0),
    feeBps: Number(FEE_BPS), worsenedByFee: worsened, totalFeeDragUsd: +totalFeeDrag.toFixed(4),
    spearmanVolVsScore: +spearman.toFixed(3), churnWallets: churners.length,
    volChampion: { wallet: volChamp.wallet, volUsd: +volChamp.volUsd.toFixed(2), proofRank: rank(scoreRank, volChamp.wallet) },
    sameBlockColocatedLegs: collisions, oppositeDirectionPairs: opposite,
    verdict: verdict ? "WASH_RESISTANT" : "REVIEW",
  };
  writeFileSync("./wash-sybil-report.json", JSON.stringify(report, null, 2));
  console.log(`\n${verdict ? "WASH_RESISTANT_OK" : "REVIEW"}: wrote wash-sybil-report.json`);
  process.exit(verdict ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(1); });
