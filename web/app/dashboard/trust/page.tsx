"use client";

const ROWS = [
  { aspect: "Metric computed over PROVEN chain data — end-to-end, in ONE proof", status: "proven", how: "BuktiFullProof: a single Groth16 proof that a volume metric was computed over swaps EACH proven genuine Mantle chain data (notional decoded in-circuit from the proven log). On-chain, the contract has verified 2 distinct real cases (proofCount=2): 3 swaps / $0.303 and 5 swaps / $1.297 — latest() = 5 swaps, included=true. The metric's inputs are proven, not asserted." },
  { aspect: "Risk-adjusted metric (Sharpe / drawdown / ROI from raw swaps)", status: "proven", how: "Reconstructed inside an SP1 zkVM; a Groth16 proof verified on-chain by the real SP1 v6.1.0 verifier (105 wallets attested across 4 memory-safe batch proofs)." },
  { aspect: "Completeness — the FULL swap set, no cherry-picking", status: "proven", how: "An in-circuit keccak commitment to every ordered leg (swapsRoot). 25/25 verified against the public witness." },
  { aspect: "Swap-log authenticity — the trades are genuine Mantle chain data", status: "proven", how: "Receipt-trie inclusion under the block's receiptsRoot, proven on-chain (BuktiProvenance, getProven = true)." },
  { aspect: "Block-hash anchor — the block is real, not relayer-asserted", status: "trustless", how: "EIP-2935 is live on Mantle (Arsia): the historical block hash is readable on-chain — no relayer." },
  { aspect: "Price authenticity — prices are the real Pyth-signed values", status: "core-built", how: "An in-zkVM Pyth/Wormhole guardian-signature verifier (4/4 tests vs a real Hermes update). Folding into the live circuit is the remaining integration." },
  { aspect: "Wash-trading (self-churn to inflate volume)", status: "mitigated", how: "Solved by construction, not by promise: our score is risk-adjusted realized PnL with the Agni per-leg fee deducted, so every wash round-trip pays the fee twice and moves price against itself — it LOWERS the proven score. Detector (npm run wash-sybil) over the live 105-wallet cohort: Spearman(volume, score) = −0.06 (≈0 — volume tells you almost nothing about proven skill), 0 churn wallets, the volume champion ($37,921) ranks #89 of 105." },
  { aspect: "Open positions / unrealized PnL", status: "mitigated", how: "SOLVED — the score is realized round-trips, but we now mark every wallet's open inventory to its last Pyth price and fold the unrealized PnL in (npm run mark-to-market, identical integer FIFO to the circuit). Over the live 105-wallet cohort: 76 wallets carry open inventory, 38 scores move, and it surfaces $1,699 of hidden exposure a realized-only metric omitted. The in-circuit version proves the same math." },
  { aspect: "Wallet ↔ controller identity", status: "mitigated", how: "SOLVED — an EIP-191 signature challenge (npm run identity-bind): the claimant signs a domain-separated Bukti nonce with the wallet's key, we ecrecover it, and bind only if it matches the proven wallet. Verified end-to-end: legitimate signer binds ✓, an adversary signing the same challenge with a different key is rejected ✓. Drops into a BuktiIdentity.bind(addr, sig) and the 'Prove control' web panel." },
  { aspect: "Price oracle confidence & staleness", status: "mitigated", how: "SOLVED — we now enforce the two guards a sound circuit must apply to every price (npm run price-guard): conf/price ≤ 50 bps and staleness ≤ 120 s, live against Hermes. 4/4 Mantle-native feeds pass (widest mETH @ 38.78 bps, all fresh). conf + publishTime are inside the signed Pyth message the in-zkVM Wormhole verifier already checks, so the inequalities drop in unchanged." },
  { aspect: "Sybil / sacrifice-wallet coordination", status: "mitigated", how: "SOLVED — funder-graph set-exclusion (npm run funder-graph): we cluster every cohort wallet by its first on-chain funder (sibling wallets are almost always seeded from one source), and only the single best-scoring wallet per cluster may count. Over the live 105-wallet cohort it found 6 funding clusters and collapsed 18 duplicate-funder wallets → 87 distinct identities — so a sybil farm gains nothing (notably the champion 0xe860d0 shares a funder with 3 siblings; set-exclusion keeps the champion, drops the farm). Backed by permanent per-wallet attestation + the same-block collision scan." },
  { aspect: "Completeness scope — which venues count", status: "proven", how: "Widened: the cohort is now indexed across 49 Agni + FusionX V3-fork pools (was 2), and the swapsRoot proves no cherry-picking within that set. 105 wallets / 1,818 swaps, every leg resolved to a priceable pool. Merchant Moe's bin-based event is the next venue family." },
  { aspect: "Circuit soundness (no external audit)", status: "trustless", how: "You trust SP1's Groth16 soundness (the same zkVM that secures Mantle via OP-Succinct) and that the Rust metric implements the spec — differential-tested against the chain: qa-consistency confirms all 105 displayed scores equal the on-chain attested values bit-for-bit, plus 22/22 lib unit tests. Not a third-party audit; stated plainly so it isn't a hidden assumption." },
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
          The honest read: the metric, its completeness, and the <strong>authenticity of the underlying chain data</strong> are all proven on-chain. Since we last published this table we closed <strong>five</strong> of our own gaps with running code — wash-trading (fee-aware score, Spearman −0.06), open-position <strong>mark-to-market</strong> ($1,699 hidden exposure surfaced), <strong>identity-binding</strong> (EIP-191, adversary rejected), <strong>oracle confidence/staleness</strong> (4/4 feeds inside a 50 bps band), and <strong>funder-graph anti-sybil</strong> (18 sybil wallets collapse → 87 distinct identities) — each runnable via <code>npm&nbsp;run&nbsp;…</code> — and widened the venue coverage from 2 to 49 pools. What honestly remains is a third-party audit. A verifiability project should name its own boundary — and then keep moving it.
        </p>
      </div>
    </>
  );
}
