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

const vUsd = (amtE6: number, pxE6: number) => (amtE6 * pxE6) / 1e12; // USD (float ok for display)

// Mirror of lib's reconstruct_trades (weighted-average cost basis, in-window only).
function reconstruct(swaps: WSwap[]) {
  const pos = new Map<number, { qty: number; cost: number }>();
  const trades: { ts: number; pnl: number; notional: number }[] = [];
  for (const s of swaps) {
    if (!s.bought_is_usd && s.bought_amount_e6 > 0) {
      const p = pos.get(s.bought_id) ?? { qty: 0, cost: 0 };
      p.qty += s.bought_amount_e6;
      p.cost += vUsd(s.bought_amount_e6, s.bought_price_e6);
      pos.set(s.bought_id, p);
    }
    if (!s.sold_is_usd && s.sold_amount_e6 > 0) {
      const p = pos.get(s.sold_id);
      if (p && p.qty > 0) {
        const closeQty = Math.min(s.sold_amount_e6, p.qty);
        const costOfClose = (p.cost * closeQty) / p.qty;
        const proceeds = vUsd(closeQty, s.sold_price_e6);
        p.cost -= costOfClose;
        p.qty -= closeQty;
        trades.push({ ts: s.timestamp, pnl: proceeds - costOfClose, notional: proceeds });
      }
    }
  }
  return trades;
}

function metrics(trades: { ts: number; pnl: number; notional: number }[]) {
  if (trades.length === 0)
    return { score: 0, dd: 0, roi: 0, vol: 0, pnl: 0, curve: [] as number[] };
  const rets = trades.map((t) => (t.notional > 0 ? t.pnl / t.notional : 0));
  const mean = rets.reduce((a, b) => a + b, 0) / rets.length;
  const variance = rets.reduce((a, r) => a + (r - mean) ** 2, 0) / rets.length;
  const std = Math.sqrt(variance);
  const score = std > 0 ? mean / std : 0;
  let eq = 0, peak = 0, maxDdBps = 0;
  const vol = trades.reduce((a, t) => a + t.notional, 0);
  const curve: number[] = [0];
  for (const t of trades) {
    eq += t.pnl;
    curve.push(eq);
    if (eq > peak) peak = eq;
    const base = Math.max(peak, vol, 1e-9);
    maxDdBps = Math.max(maxDdBps, ((peak - eq) / base) * 10000);
  }
  const pnl = eq;
  return { score, dd: maxDdBps / 100, roi: vol > 0 ? (pnl / vol) * 100 : 0, vol, pnl, curve };
}

function main() {
  const batch = JSON.parse(readFileSync("../batch.json", "utf8")) as { entries: Entry[] };
  const cohort = JSON.parse(readFileSync("clawhack-cohort.json", "utf8")) as {
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
      trades: trades.map((t) => ({ ts: t.ts, pnl: +t.pnl.toFixed(4), notional: +t.notional.toFixed(4) })),
      score: +m.score.toFixed(3),
      dd: +m.dd.toFixed(2),
      roi: +m.roi.toFixed(2),
      vol: +m.vol.toFixed(2),
      pnl: +m.pnl.toFixed(4),
      curve: m.curve.map((x) => +x.toFixed(4)),
    };
  });

  // Volume rank (ClawHack-style: by swap count desc) vs proof rank (by score desc).
  const byVolume = [...rows].sort((a, b) => b.clawhackSwaps - a.clawhackSwaps);
  const byScore = [...rows].sort((a, b) => b.score - a.score);
  const volRank = new Map(byVolume.map((r, i) => [r.wallet, i + 1]));
  const scoreRank = new Map(byScore.map((r, i) => [r.wallet, i + 1]));
  const out = byScore.map((r) => ({
    ...r,
    volRank: volRank.get(r.wallet)!,
    proofRank: scoreRank.get(r.wallet)!,
  }));

  const meta = {
    window: "Apr 15–30, 2026 (ClawHack Phase 1)",
    walletsScanned: 382,
    walletsProven: out.length,
    totalLegs: out.reduce((a, r) => a + r.legs, 0),
    proofBytes: 714,
    batchTx: "0xe478d52a6c5e312bf0a62b4dad0f944b784da3011649947770c96e00fb82dbc6",
  };
  writeFileSync("../web/public/board-data.json", JSON.stringify({ meta, rows: out }));
  console.log(`board-data.json: ${out.length} rows`);
  console.log("Top by PROOF:", out.slice(0, 3).map((r) => `${r.wallet.slice(0, 8)} s=${r.score} (vol-rank #${r.volRank})`).join(" | "));
  console.log("Top by VOLUME:", byVolume.slice(0, 3).map((r) => `${r.wallet.slice(0, 8)} swaps=${r.clawhackSwaps} (proof-rank #${scoreRank.get(r.wallet)})`).join(" | "));
}
main();
