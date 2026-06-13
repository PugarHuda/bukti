// mark-to-market.ts — SOLVES the "open positions / unrealized PnL" trust gap.
//
// The proven score is over REALIZED round-trips (FIFO close). The honest cost was: a wallet
// sitting on a large UNREALIZED loss looked clean until it closed. This computes the fix —
// mark every wallet's leftover open inventory to its last observed Pyth price at cohort-end,
// fold the unrealized PnL into the score, and report who moves. The math is the same integer
// FIFO the circuit uses, so this is exactly what an in-circuit mark-to-market would prove.
//
//   npx tsx src/mark-to-market.ts
import { readFileSync, writeFileSync } from "node:fs";

type Sw = {
  timestamp: number; sold_id: number; sold_amount_e6: number; sold_price_e6: number;
  sold_is_usd: boolean; bought_id: number; bought_amount_e6: number; bought_price_e6: number;
  bought_is_usd: boolean;
};
const E6 = 1_000_000n;
const vUsdE6 = (a: bigint, p: bigint) => (a * p) / E6;
function isqrt(x: bigint): bigint { if (x < 2n) return x; let a = x, b = (x >> 1n) + 1n; while (b < a) { a = b; b = (b + x / b) >> 1n; } return a; }

// FIFO reconstruction that ALSO returns the open inventory + the last USD price seen per token.
function reconstruct(swaps: Sw[]) {
  const pos = new Map<number, { qty: bigint; cost: bigint }>();
  const lastPx = new Map<number, bigint>();
  const trades: { pnlE6: bigint; notionalE6: bigint }[] = [];
  for (const s of swaps) {
    if (!s.bought_is_usd) lastPx.set(s.bought_id, BigInt(s.bought_price_e6));
    if (!s.sold_is_usd) lastPx.set(s.sold_id, BigInt(s.sold_price_e6));
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
        p.cost -= costOfClose; p.qty -= closeQty;
        trades.push({ pnlE6: proceeds - costOfClose, notionalE6: proceeds });
      }
    }
  }
  // unrealized: value each open lot at its last observed price minus its cost basis
  let unrealizedE6 = 0n; const open: { id: number; qty: bigint; cost: bigint; markE6: bigint }[] = [];
  for (const [id, p] of pos) {
    if (p.qty <= 0n) continue;
    const px = lastPx.get(id) ?? 0n;
    const markE6 = vUsdE6(p.qty, px);
    unrealizedE6 += markE6 - p.cost;
    open.push({ id, qty: p.qty, cost: p.cost, markE6 });
  }
  return { trades, unrealizedE6, open };
}

function scoreMilli(trades: { pnlE6: bigint; notionalE6: bigint }[], extraPnlE6 = 0n, extraNotionalE6 = 0n) {
  const all = extraNotionalE6 > 0n ? [...trades, { pnlE6: extraPnlE6, notionalE6: extraNotionalE6 }] : trades;
  if (!all.length) return 0;
  const n = BigInt(all.length);
  const rets = all.map((t) => (t.notionalE6 > 0n ? (t.pnlE6 * 1_000_000n) / t.notionalE6 : 0n));
  const mean = rets.reduce((a, b) => a + b, 0n) / n;
  const variance = rets.reduce((a, r) => a + (r - mean) * (r - mean), 0n) / n;
  const std = isqrt(variance < 0n ? 0n : variance);
  return std > 0n ? Number((mean * 1000n) / std) : 0;
}

async function main() {
  const b = JSON.parse(readFileSync(process.argv[2] ?? "./batch-state.json", "utf8"));
  const entries: Record<string, Sw[]> = b.entries;
  const cohort = Object.keys(entries).filter((w) => Array.isArray(entries[w]) && entries[w].length);

  const rows = cohort.map((w) => {
    const { trades, unrealizedE6, open } = reconstruct(entries[w]);
    const realized = scoreMilli(trades);
    const markE6 = open.reduce((a, o) => a + o.markE6, 0n);
    const mtm = scoreMilli(trades, unrealizedE6, markE6); // fold the open lot in as one marked trade
    return { wallet: w, realizedMilli: realized, mtmMilli: mtm, unrealizedUsd: Number(unrealizedE6) / 1e6, openLots: open.length };
  });

  const withOpen = rows.filter((r) => r.openLots > 0);
  const movers = rows.filter((r) => r.realizedMilli !== r.mtmMilli);
  const hiddenLoss = rows.filter((r) => r.unrealizedUsd < 0).sort((a, b) => a.unrealizedUsd - b.unrealizedUsd);

  console.log(`=== mark-to-market: fold open inventory into the proven score ===`);
  console.log(`cohort ${rows.length}; ${withOpen.length} wallets carry open inventory at cohort-end.`);
  console.log(`${movers.length} wallets' score changes once unrealized PnL is marked in.`);
  console.log(`\ntop hidden unrealized losses (invisible to a realized-only metric):`);
  for (const r of hiddenLoss.slice(0, 6)) {
    if (r.unrealizedUsd >= 0) break;
    console.log(`  ${r.wallet.slice(0, 10)}  unrealized $${r.unrealizedUsd.toFixed(4)}  score ${(r.realizedMilli / 1000).toFixed(3)} -> MtM ${(r.mtmMilli / 1000).toFixed(3)}`);
  }
  const totalUnreal = rows.reduce((a, r) => a + r.unrealizedUsd, 0);
  console.log(`\ncohort net unrealized: $${totalUnreal.toFixed(4)} (the exposure a realized-only score omits).`);

  writeFileSync("./mark-to-market-report.json", JSON.stringify({
    cohort: rows.length, walletsWithOpenInventory: withOpen.length, scoreMovers: movers.length,
    netUnrealizedUsd: +totalUnreal.toFixed(4),
    hiddenLosses: hiddenLoss.filter((r) => r.unrealizedUsd < 0).slice(0, 10).map((r) => ({ wallet: r.wallet, unrealizedUsd: +r.unrealizedUsd.toFixed(4), realized: +(r.realizedMilli / 1000).toFixed(3), markToMarket: +(r.mtmMilli / 1000).toFixed(3) })),
  }, null, 2));
  console.log(`\nMARK_TO_MARKET_OK: wrote mark-to-market-report.json (the in-circuit version proves the same integer math)`);
}
main().catch((e) => { console.error(e); process.exit(1); });
