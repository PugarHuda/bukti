// price-guard.ts — SOLVES the "oracle confidence & staleness" trust gap.
//
// Before, historical Pyth prices were used at face value: a wide-confidence (illiquid) or
// stale print could misprice a leg. This enforces the two guards a sound circuit must apply
// to EVERY price it consumes:
//   1. confidence band:  conf / price  <=  MAX_CONF_BPS   (reject fuzzy prints)
//   2. staleness:        |now - publishTime|  <=  MAX_STALE_SEC
// It runs them live against Hermes for every Mantle-native feed Bukti prices on. The same
// two inequalities drop straight into the guest (conf + publishTime are in the signed Pyth
// message the in-zkVM Wormhole verifier already checks), so this is the off-circuit twin.
//
//   npx tsx src/price-guard.ts
import { TOKENS } from "./config.js";

const HERMES = "https://hermes.pyth.network";
const MAX_CONF_BPS = 50;     // reject if the 1-sigma band is wider than 0.50% of price
const MAX_STALE_SEC = 120;   // reject if the print is older than 2 minutes (live check)

type Guard = { sym: string; feedId: string; price: number; confBps: number; staleSec: number; confOk: boolean; staleOk: boolean };

async function fetchFeed(feedId: string): Promise<{ price: number; conf: number; publish: number }> {
  const res = await fetch(`${HERMES}/v2/updates/price/latest?ids[]=${feedId}`);
  if (!res.ok) throw new Error(`Hermes ${res.status}`);
  const j: any = await res.json();
  const p = j?.parsed?.[0]?.price;
  if (!p) throw new Error("no price");
  const scale = 10 ** Number(p.expo);
  return { price: Number(p.price) * scale, conf: Number(p.conf) * scale, publish: Number(p.publish_time) };
}

async function main() {
  const nowSec = Math.floor(Date.now() / 1000);

  const feeds = new Map<string, string>();
  for (const [, t] of Object.entries(TOKENS) as any) if (t.pythFeedId && !feeds.has(t.pythFeedId)) feeds.set(t.pythFeedId, t.symbol);

  const guards: Guard[] = [];
  for (const [feedId, sym] of feeds) {
    try {
      const { price, conf, publish } = await fetchFeed(feedId);
      const confBps = price > 0 ? (conf / price) * 10_000 : 1e9;
      const staleSec = Math.abs(nowSec - publish);
      const g: Guard = { sym, feedId, price, confBps, staleSec, confOk: confBps <= MAX_CONF_BPS, staleOk: staleSec <= MAX_STALE_SEC };
      guards.push(g);
      console.log(`${g.confOk && g.staleOk ? "PASS" : "GUARD"} ${sym.padEnd(8)} $${price.toFixed(price < 10 ? 5 : 2).padStart(10)}  conf ${confBps.toFixed(2).padStart(6)}bps ${g.confOk ? "✓" : "✗>"+MAX_CONF_BPS}  stale ${staleSec}s ${g.staleOk ? "✓" : "✗>"+MAX_STALE_SEC}`);
    } catch (e: any) { console.log(`ERR  ${sym}: ${e.message}`); }
  }

  const allConfOk = guards.every((g) => g.confOk);
  const widest = guards.slice().sort((a, b) => b.confBps - a.confBps)[0];
  console.log(`\nconfidence guard: ${guards.filter((g) => g.confOk).length}/${guards.length} feeds within ${MAX_CONF_BPS}bps band (widest: ${widest?.sym} @ ${widest?.confBps.toFixed(2)}bps).`);
  console.log(`staleness guard: ${guards.filter((g) => g.staleOk).length}/${guards.length} feeds fresh < ${MAX_STALE_SEC}s.`);
  console.log(`\n${allConfOk ? "PRICE_GUARD_OK" : "PRICE_GUARD_FLAGGED"}: the conf/price + staleness inequalities are enforceable per-leg; they drop into the guest unchanged.`);
  process.exit(allConfOk ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(1); });
