// QA for the pricing layer + Mantle-native asset support.
//   npx tsx src/qa-pricing.ts
// (1) Static invariants on the TOKENS registry (unique ids, feed wiring).
// (2) LIVE check that every distinct Pyth feed resolves to a positive current price on
//     Hermes — proving the Mantle-native feed IDs (METH/USD, USDY/USD, MNT/USD) are real.
import { TOKENS } from "./config.js";

const HERMES = "https://hermes.pyth.network";
let pass = 0,
  fail = 0;
function check(name: string, ok: boolean, detail = "") {
  console.log(`${ok ? "✓" : "✗"} ${name}${detail ? " — " + detail : ""}`);
  ok ? pass++ : fail++;
}

async function livePrice(feedId: string): Promise<number> {
  const url = `${HERMES}/v2/updates/price/latest?ids[]=${feedId}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Hermes ${res.status}`);
  const json: any = await res.json();
  const p = json?.parsed?.[0]?.price;
  if (!p) throw new Error("no price");
  return Number(p.price) * 10 ** Number(p.expo);
}

async function main() {
  const entries = Object.entries(TOKENS);

  // ---- (1) static invariants ----
  // Every non-USD-cash token must have a Pyth feed (else it cannot be priced).
  for (const [addr, t] of entries) {
    if (!t.isUsd) check(`${t.symbol} has a Pyth feed`, !!t.pythFeedId, addr.slice(0, 10));
  }
  // Witness ids must be unique per *distinct* asset id (USD-cash share id 0 by design).
  const nonUsdIds = entries.filter(([, t]) => !t.isUsd).map(([, t]) => t.id);
  check("non-USD witness ids are unique", new Set(nonUsdIds).size === nonUsdIds.length, nonUsdIds.join(","));

  // Mantle-native assets are first-class.
  const symbols = new Set(entries.map(([, t]) => t.symbol));
  for (const s of ["mETH", "cmETH", "USDY", "WMNT"]) {
    check(`Mantle-native asset supported: ${s}`, symbols.has(s));
  }

  // ---- (2) live feed verification (distinct feeds only, to respect rate limits) ----
  const feeds = new Map<string, string>(); // feedId -> example symbol
  for (const [, t] of entries) if (t.pythFeedId && !feeds.has(t.pythFeedId)) feeds.set(t.pythFeedId, t.symbol);

  for (const [feedId, sym] of feeds) {
    try {
      const px = await livePrice(feedId);
      check(`live Pyth price for ${sym} feed`, px > 0, `$${px.toFixed(sym.includes("USD") ? 4 : 2)}`);
    } catch (e: any) {
      check(`live Pyth price for ${sym} feed`, false, e.message);
    }
  }

  console.log(`\n${fail === 0 ? "PRICING_OK" : "PRICING_FAIL"}: ${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
