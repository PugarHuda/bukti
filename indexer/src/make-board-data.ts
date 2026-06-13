// Build web/public/board-data.json from the PUBLIC proof witness (batch.json) +
// cohort swap counts. Per wallet: metrics (recomputed with the same cost-basis math as
// the circuit), cumulative-PnL equity curve, realized trade list, and the volume-rank
// (ClawHack-style, by swap count) vs proof-rank comparison.
//   npx tsx src/make-board-data.ts
import { readFileSync, writeFileSync } from "node:fs";

interface WSwap {
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
interface Entry { wallet: number[]; swaps: WSwap[] }

const toAddr = (b: number[]) =>
  "0x" + b.map((x) => x.toString(16).padStart(2, "0")).join("");

// BigInt port of lib.rs value_usd_e6 — EXACT integer math so displayed headline metrics
// match the on-chain attested values bit-for-bit (the circuit uses u128 integers).
const E6 = 1_000_000n;
const vUsdE6 = (amtE6: bigint, pxE6: bigint) => (amtE6 * pxE6) / E6;

// Exact integer reconstruct_trades. Returns pnl/notional in USD*1e6 (e6) BigInt.
function reconstruct(swaps: WSwap[]) {
  const pos = new Map<number, { qty: bigint; cost: bigint }>();
  const trades: { ts: number; pnlE6: bigint; notionalE6: bigint }[] = [];
  for (const s of swaps) {
    if (!s.bought_is_usd && s.bought_amount_e6 > 0) {
      const p = pos.get(s.bought_id) ?? { qty: 0n, cost: 0n };
      p.qty += BigInt(s.bought_amount_e6);
      p.cost += vUsdE6(BigInt(s.bought_amount_e6), BigInt(s.bought_price_e6));
      pos.set(s.bought_id, p);
    }
    if (!s.sold_is_usd && s.sold_amount_e6 > 0) {
      const p = pos.get(s.sold_id);
      if (p && p.qty > 0n) {
        const sold = BigInt(s.sold_amount_e6);
        const closeQty = sold < p.qty ? sold : p.qty;
        const costOfClose = (p.cost * closeQty) / p.qty;
        const proceeds = vUsdE6(closeQty, BigInt(s.sold_price_e6));
        p.cost -= costOfClose;
        p.qty -= closeQty;
        trades.push({ ts: s.timestamp, pnlE6: proceeds - costOfClose, notionalE6: proceeds });
      }
    }
  }
  return trades;
}

function isqrtBig(x: bigint): bigint {
  if (x < 2n) return x;
  let a = x, b = (x >> 1n) + 1n;
  while (b < a) { a = b; b = (b + x / b) >> 1n; }
  return a;
}

function metrics(trades: { ts: number; pnlE6: bigint; notionalE6: bigint }[]) {
  if (trades.length === 0)
    return {
      scoreMilli: 0, ddBps: 0, roiBps: 0, volE6: 0n, pnlE6: 0n, curve: [] as number[],
      winRate: 0, profitFactor: 0, sortino: 0, calmar: 0,
      avgWin: 0, avgLoss: 0, bestStreak: 0, worstStreak: 0,
    };
  const n = BigInt(trades.length);

  // ----- HEADLINE metrics: EXACT integer math mirroring lib.rs (matches chain) -----
  const retsPpm = trades.map((t) =>
    t.notionalE6 > 0n ? (t.pnlE6 * 1_000_000n) / t.notionalE6 : 0n,
  );
  const mean = retsPpm.reduce((a, b) => a + b, 0n) / n;
  const variance = retsPpm.reduce((a, r) => a + (r - mean) * (r - mean), 0n) / n;
  const std = isqrtBig(variance < 0n ? 0n : variance);
  const scoreMilli = std > 0n ? Number((mean * 1000n) / std) : 0;

  let eq = 0n, peak = 0n, maxDdBps = 0n;
  const volE6 = trades.reduce((a, t) => a + t.notionalE6, 0n);
  const volBase = volE6 > 1n ? volE6 : 1n;
  const curve: number[] = [0];
  for (const t of trades) {
    eq += t.pnlE6;
    curve.push(Number(eq) / 1e6);
    if (eq > peak) peak = eq;
    const base = peak > 0n ? (peak > volBase ? peak : volBase) : volBase;
    const dd = ((peak - eq) * 10_000n) / base;
    if (dd > maxDdBps) maxDdBps = dd;
  }
  const pnlE6 = eq;
  const totalPnl = trades.reduce((a, t) => a + t.pnlE6, 0n);
  const roiBps = volE6 > 0n ? Number((totalPnl * 10_000n) / volE6) : 0;
  const ddBps = Number(maxDdBps);

  // ----- supplementary stat block (display only; float fine) -----
  const pnl = (t: { pnlE6: bigint }) => Number(t.pnlE6) / 1e6;
  const wins = trades.filter((t) => t.pnlE6 > 0n);
  const losses = trades.filter((t) => t.pnlE6 < 0n);
  const grossWin = wins.reduce((a, t) => a + pnl(t), 0);
  const grossLoss = Math.abs(losses.reduce((a, t) => a + pnl(t), 0));
  const winRate = (wins.length / trades.length) * 100;
  const profitFactor = grossLoss > 0 ? grossWin / grossLoss : grossWin > 0 ? Infinity : 0;
  const avgWin = wins.length ? grossWin / wins.length : 0;
  const avgLoss = losses.length ? grossLoss / losses.length : 0;
  const downs = retsPpm.filter((r) => r < 0n).map((r) => Number(r) / 1e6);
  const meanF = Number(mean) / 1e6;
  const ddev = downs.length ? Math.sqrt(downs.reduce((a, r) => a + r * r, 0) / trades.length) : 0;
  const sortino = ddev > 0 ? meanF / ddev : 0;
  let cur = 0, bestStreak = 0, worstStreak = 0;
  for (const t of trades) {
    if (t.pnlE6 > 0n) { cur = cur > 0 ? cur + 1 : 1; bestStreak = Math.max(bestStreak, cur); }
    else if (t.pnlE6 < 0n) { cur = cur < 0 ? cur - 1 : -1; worstStreak = Math.min(worstStreak, cur); }
  }
  const calmar = ddBps > 0 ? (roiBps / 100) / (ddBps / 100) : 0;

  return {
    scoreMilli, ddBps, roiBps, volE6, pnlE6, curve,
    winRate, profitFactor: profitFactor === Infinity ? 999 : profitFactor,
    sortino, calmar, avgWin, avgLoss, bestStreak, worstStreak: Math.abs(worstStreak),
  };
}

/** Quadrant naming: activity (volume rank) vs proven skill (proof rank). */
function quadrant(volRank: number, proofRank: number, n: number): string {
  const hiVol = volRank <= n / 2;
  const hiSkill = proofRank <= n / 2;
  if (hiVol && hiSkill) return "Proven Heavyweight";
  if (!hiVol && hiSkill) return "Quiet Killer";
  if (hiVol && !hiSkill) return "Volume Tourist";
  return "Spectator";
}

/** Ethos-style legibility tier from the proven score. */
function tier(score: number): string {
  if (score >= 2) return "S";
  if (score >= 0.75) return "A";
  if (score >= 0.25) return "B";
  if (score >= 0) return "C";
  return "D";
}

function main() {
  // optional argv: [batchFile] [cohortFile] [outFile] — default to the original 25-cohort.
  const batchFile = process.argv[2] ?? "../batch.json";
  const cohortFile = process.argv[3] ?? "clawhack-cohort.json";
  const outFile = process.argv[4] ?? "../web/public/board-data.json";
  const batch = JSON.parse(readFileSync(batchFile, "utf8")) as { entries: Entry[] };
  const cohort = JSON.parse(readFileSync(cohortFile, "utf8")) as {
    wallets: { wallet: string; swaps: number }[];
  };
  const swapCount = new Map(cohort.wallets.map((w) => [w.wallet.toLowerCase(), w.swaps]));

  const rows = batch.entries.map((e) => {
    const wallet = toAddr(e.wallet);
    const trades = reconstruct(e.swaps);
    const m = metrics(trades);
    return {
      wallet,
      clawhackSwaps: swapCount.get(wallet.toLowerCase()) ?? e.swaps.length,
      legs: e.swaps.length,
      trades: trades.map((t) => ({
        ts: t.ts,
        pnl: +(Number(t.pnlE6) / 1e6).toFixed(4),
        notional: +(Number(t.notionalE6) / 1e6).toFixed(4),
      })),
      // headline metrics in the SAME units the chain stores (exact), plus display copies
      score: +(m.scoreMilli / 1000).toFixed(3),
      scoreMilli: m.scoreMilli,
      dd: +(m.ddBps / 100).toFixed(2),
      roi: +(m.roiBps / 100).toFixed(2),
      vol: +(Number(m.volE6) / 1e6).toFixed(2),
      pnl: +(Number(m.pnlE6) / 1e6).toFixed(4),
      curve: m.curve.map((x) => +x.toFixed(4)),
      winRate: +m.winRate.toFixed(1),
      profitFactor: +m.profitFactor.toFixed(2),
      sortino: +m.sortino.toFixed(3),
      calmar: +m.calmar.toFixed(2),
      avgWin: +m.avgWin.toFixed(4),
      avgLoss: +m.avgLoss.toFixed(4),
      bestStreak: m.bestStreak,
      worstStreak: m.worstStreak,
    };
  });

  // Volume rank (ClawHack-style: by swap count desc) vs proof rank (by score desc).
  const byVolume = [...rows].sort((a, b) => b.clawhackSwaps - a.clawhackSwaps);
  const byScore = [...rows].sort((a, b) => b.score - a.score);
  const volRank = new Map(byVolume.map((r, i) => [r.wallet, i + 1]));
  const scoreRank = new Map(byScore.map((r, i) => [r.wallet, i + 1]));
  const out = byScore.map((r) => {
    const vr = volRank.get(r.wallet)!;
    const pr = scoreRank.get(r.wallet)!;
    return {
      ...r,
      volRank: vr,
      proofRank: pr,
      tier: tier(r.score),
      quadrant: quadrant(vr, pr, rows.length),
    };
  });

  // ----- Cohort X-ray: aggregate insights a VC actually wants (all proven) -----
  const totalVol = out.reduce((a, r) => a + r.vol, 0);
  const totalPnl = out.reduce((a, r) => a + r.pnl, 0);
  const losers = out.filter((r) => r.pnl < 0);
  const winners = out.filter((r) => r.pnl > 0);
  const volFromLosers = losers.reduce((a, r) => a + r.vol, 0);
  const avgRankGap =
    out.reduce((a, r) => a + Math.abs(r.volRank - r.proofRank), 0) / out.length;
  // How often does the higher-volume wallet of a pair also have the higher score?
  let agree = 0, pairs = 0;
  for (let i = 0; i < out.length; i++)
    for (let j = i + 1; j < out.length; j++) {
      pairs++;
      const a = out[i], b = out[j];
      const volHi = a.clawhackSwaps > b.clawhackSwaps ? a : b;
      const scoreHi = a.score > b.score ? a : b;
      if (volHi.wallet === scoreHi.wallet) agree++;
    }
  const cohortStats = {
    profitable: winners.length,
    unprofitable: losers.length,
    totalVolumeUsd: +totalVol.toFixed(2),
    totalRealizedPnlUsd: +totalPnl.toFixed(2),
    pctVolumeFromLosers: +((volFromLosers / Math.max(totalVol, 1e-9)) * 100).toFixed(1),
    avgRankGap: +avgRankGap.toFixed(1),
    volumeScoreAgreementPct: +((agree / Math.max(pairs, 1)) * 100).toFixed(0),
    medianScore: +[...out].sort((a, b) => a.score - b.score)[Math.floor(out.length / 2)].score.toFixed(3),
  };

  const meta = {
    window: "Apr 15–30, 2026 (ClawHack Phase 1)",
    walletsScanned: 382,
    walletsProven: out.length,
    totalLegs: out.reduce((a, r) => a + r.legs, 0),
    proofBytes: 714,
    batchTx: "0x148087d3c2c0dfcd57b073610f3934003cab7e818f3258e0de4c1c434de1de04",
    attestationContract: "0xDFb9C6fA99D8Fa2c8eeA2AE7C055C8cbA53971E9",
    verifier: "0xb5c7a7761221931ee15c8C70DdF4192a94C49a5A",
    chain: "Mantle Sepolia (5003)",
    cohort: cohortStats,
  };
  writeFileSync(outFile, JSON.stringify({ meta, rows: out }));
  console.log("cohort X-ray:", JSON.stringify(cohortStats));
  console.log(`board-data.json: ${out.length} rows`);
  console.log("Top by PROOF:", out.slice(0, 3).map((r) => `${r.wallet.slice(0, 8)} s=${r.score} (vol-rank #${r.volRank})`).join(" | "));
  console.log("Top by VOLUME:", byVolume.slice(0, 3).map((r) => `${r.wallet.slice(0, 8)} swaps=${r.clawhackSwaps} (proof-rank #${scoreRank.get(r.wallet)})`).join(" | "));
}
main();
