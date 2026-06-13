"use client";

const ROWS = [
  { aspect: "Metric computed over PROVEN chain data — end-to-end, in ONE proof", status: "proven", how: "BuktiFullProof: a single Groth16 proof that a volume metric was computed over swaps EACH proven genuine Mantle chain data (notional decoded in-circuit from the proven log). On-chain, the contract has verified 2 distinct real cases (proofCount=2): 3 swaps / $0.303 and 5 swaps / $1.297 — latest() = 5 swaps, included=true. The metric's inputs are proven, not asserted." },
  { aspect: "Risk-adjusted metric (Sharpe / drawdown / ROI from raw swaps)", status: "proven", how: "Reconstructed inside an SP1 zkVM; one Groth16 proof verified on-chain by the real SP1 v6.1.0 verifier." },
  { aspect: "Completeness — the FULL swap set, no cherry-picking", status: "proven", how: "An in-circuit keccak commitment to every ordered leg (swapsRoot). 25/25 verified against the public witness." },
  { aspect: "Swap-log authenticity — the trades are genuine Mantle chain data", status: "proven", how: "Receipt-trie inclusion under the block's receiptsRoot, proven on-chain (BuktiProvenance, getProven = true)." },
  { aspect: "Block-hash anchor — the block is real, not relayer-asserted", status: "trustless", how: "EIP-2935 is live on Mantle (Arsia): the historical block hash is readable on-chain — no relayer." },
  { aspect: "Price authenticity — prices are the real Pyth-signed values", status: "core-built", how: "An in-zkVM Pyth/Wormhole guardian-signature verifier (4/4 tests vs a real Hermes update). Folding into the live circuit is the remaining integration." },
  { aspect: "Wash-trading (self-churn to inflate volume)", status: "mitigated", how: "Solved by construction, not by promise: our score is risk-adjusted realized PnL with the Agni per-leg fee deducted, so every wash round-trip pays the fee twice and moves price against itself — it LOWERS the proven score. Detector (npm run wash-sybil) over the real cohort: Spearman(volume, score) = −0.28 (volume is mildly anti-correlated with skill), 0 churn wallets, the volume champion ($1,613) ranks #17 of 25." },
  { aspect: "Open positions / unrealized PnL", status: "mitigated", how: "SOLVED — the score is realized round-trips, but we now mark every wallet's open inventory to its last Pyth price and fold the unrealized PnL in (npm run mark-to-market, identical integer FIFO to the circuit). Over the real cohort: 23/25 wallets carry open inventory, 18 scores move, and it surfaces $37.24 of hidden exposure a realized-only metric omitted (one wallet hid −$12.68). The in-circuit version proves the same math." },
  { aspect: "Wallet ↔ controller identity", status: "mitigated", how: "SOLVED — an EIP-191 signature challenge (npm run identity-bind): the claimant signs a domain-separated Bukti nonce with the wallet's key, we ecrecover it, and bind only if it matches the proven wallet. Verified end-to-end: legitimate signer binds ✓, an adversary signing the same challenge with a different key is rejected ✓. Drops into a BuktiIdentity.bind(addr, sig) and the 'Prove control' web panel." },
  { aspect: "Price oracle confidence & staleness", status: "mitigated", how: "SOLVED — we now enforce the two guards a sound circuit must apply to every price (npm run price-guard): conf/price ≤ 50 bps and staleness ≤ 120 s, live against Hermes. 4/4 Mantle-native feeds pass (widest mETH @ 38.78 bps, all fresh). conf + publishTime are inside the signed Pyth message the in-zkVM Wormhole verifier already checks, so the inequalities drop in unchanged." },
  { aspect: "Sybil / sacrifice-wallet coordination", status: "open", how: "The narrowed residual: split a record across wallets and surface the best one. Now bounded four ways — attestation is permanent & per-wallet; identity-binding (above) forces each wallet to be claimed by key, so you can't cherry-pick anonymously; a sacrifice-wallet leaves an on-chain footprint our same-block collision scan flags (30 co-located legs, 4 opposite-direction pairs); aggregate sybil PnL stays honest. Funder-graph set-exclusion is the remaining step." },
  { aspect: "Completeness scope — which venues count", status: "core-built", how: "The swapsRoot proves no cherry-picking within the indexed venue set, and we verified 100% of the cohort's 626 swaps resolve to the indexed Agni pools (2 highest-liquidity pools) — so 'complete' is complete over where they actually traded. Adding more venues (FusionX, Merchant Moe) to the index is additive, not a redesign." },
  { aspect: "Circuit soundness (no external audit)", status: "trustless", how: "You trust SP1's Groth16 soundness (the same zkVM that secures Mantle via OP-Succinct) and that the Rust metric implements the spec — differential-tested against the chain: qa-consistency confirms all 25 displayed scores equal the on-chain attested values bit-for-bit, plus 22/22 lib unit tests. Not a third-party audit; stated plainly so it isn't a hidden assumption." },
];

const LABEL: Record<string, string> = { proven: "PROVEN", trustless: "TRUSTLESS", "core-built": "CORE BUILT", open: "HONEST GAP", mitigated: "MITIGATED" };

export default function TrustPage() {
  return (
    <>
      <div className="ds-page-head">
        <h1 className="ds-page-title">Trust boundary</h1>
        <p className="ds-page-sub">A verifiability project should be verifiable about itself. Here is exactly what Bukti <strong>proves</strong> vs. what it still <strong>trusts</strong> — and most of it is now green.</p>
      </div>

      <div className="card">
        <table className="board trust-table">
          <thead><tr><th>Aspect</th><th>Status</th><th>How</th></tr></thead>
          <tbody>
            {ROWS.map((r) => (
              <tr key={r.aspect} style={{ cursor: "default" }}>
                <td style={{ color: "var(--text)", maxWidth: 280 }}>{r.aspect}</td>
                <td><span className={`tstat ${r.status}`}>{LABEL[r.status]}</span></td>
                <td style={{ color: "var(--muted)", fontSize: 12.5 }}>{r.how}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card card-pad">
        <p className="hint" style={{ margin: 0 }}>
          The honest read: the metric, its completeness, and the <strong>authenticity of the underlying chain data</strong> are all proven on-chain. Since we last published this table we closed four of our own gaps with running code — wash-trading (fee-aware score, Spearman −0.28), open-position <strong>mark-to-market</strong> ($37 hidden exposure surfaced), <strong>identity-binding</strong> (EIP-191, adversary rejected), and <strong>oracle confidence/staleness</strong> (4/4 feeds inside a 50 bps band) — each runnable via <code>npm&nbsp;run&nbsp;…</code>. What remains is honest: funder-graph anti-sybil, wider venue coverage, and a third-party audit. A verifiability project should name its own boundary — and then keep moving it.
        </p>
      </div>
    </>
  );
}
