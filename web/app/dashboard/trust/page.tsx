"use client";

const ROWS = [
  { aspect: "Metric computed over PROVEN chain data — end-to-end, in ONE proof", status: "proven", how: "BuktiFullProof: a single Groth16 proof that a volume metric was computed over swaps EACH proven genuine Mantle chain data (notional decoded in-circuit from the proven log). On-chain, latest() = 3 swaps, included=true. The metric's inputs are proven, not asserted." },
  { aspect: "Risk-adjusted metric (Sharpe / drawdown / ROI from raw swaps)", status: "proven", how: "Reconstructed inside an SP1 zkVM; one Groth16 proof verified on-chain by the real SP1 v6.1.0 verifier." },
  { aspect: "Completeness — the FULL swap set, no cherry-picking", status: "proven", how: "An in-circuit keccak commitment to every ordered leg (swapsRoot). 25/25 verified against the public witness." },
  { aspect: "Swap-log authenticity — the trades are genuine Mantle chain data", status: "proven", how: "Receipt-trie inclusion under the block's receiptsRoot, proven on-chain (BuktiProvenance, getProven = true)." },
  { aspect: "Block-hash anchor — the block is real, not relayer-asserted", status: "trustless", how: "EIP-2935 is live on Mantle (Arsia): the historical block hash is readable on-chain — no relayer." },
  { aspect: "Price authenticity — prices are the real Pyth-signed values", status: "core-built", how: "An in-zkVM Pyth/Wormhole guardian-signature verifier (4/4 tests vs a real Hermes update). Folding into the live circuit is the remaining integration." },
  { aspect: "Wash-trading (self-churn to inflate volume)", status: "mitigated", how: "Solved by construction, not by promise: our score is risk-adjusted realized PnL with the Agni per-leg fee deducted, so every wash round-trip pays the fee twice and moves price against itself — it LOWERS the proven score. Detector (npm run wash-sybil) over the real cohort: Spearman(volume, score) = −0.28 (volume is mildly anti-correlated with skill), 0 churn wallets, the volume champion ($1,613) ranks #17 of 25." },
  { aspect: "Sybil / sacrifice-wallet coordination", status: "open", how: "The residual: split a record across wallets and surface the best one. Narrowed three ways — attestation is permanent & per-wallet (you can't un-attest the losers); a sacrifice-wallet leaves an on-chain footprint our same-block collision scan flags (30 co-located legs, 4 opposite-direction pairs found); aggregate sybil PnL stays honest (one wallet's gain is another's loss). Identity-binding + set-exclusion is the scoped next step." },
  { aspect: "Open positions / unrealized PnL", status: "open", how: "The score is over REALIZED round-trips (FIFO cost-basis close) — deliberately, so it can't be inflated by marking open inventory to a favorable price. The honest cost: a wallet sitting on a large unrealized loss isn't penalized until it closes. Mark-to-market-at-proof-time is a scoped extension." },
  { aspect: "Completeness scope — which venues count", status: "core-built", how: "The swapsRoot proves no cherry-picking WITHIN the indexed venue set (Agni pools). A wallet that also trades on other DEXs or bridges out has a record that's complete-over-Agni, not complete-over-everything. Expanding the indexed venue set is additive, not a redesign." },
  { aspect: "Wallet ↔ controller identity", status: "open", how: "Bukti proves a WALLET's history is real; it does not by itself prove the claimant controls that wallet's key (someone could point at a stranger's good wallet). A signature challenge / ERC-8004 identity binding closes this — the registries are already wired." },
  { aspect: "Price oracle confidence & staleness", status: "open", how: "Historical prices are real Pyth-signed benchmarks, but used at face value: the confidence band and staleness window aren't enforced in-circuit, so an illiquid wide-confidence print could misprice a leg. Enforcing the band is a circuit add-on." },
  { aspect: "Circuit soundness (no external audit)", status: "trustless", how: "You trust SP1's Groth16 soundness (the same zkVM that secures Mantle via OP-Succinct) and that the Rust metric faithfully implements the spec — covered by 22/22 lib tests + on-chain verification, but not a third-party audit. Stated plainly so it isn't a hidden assumption." },
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
          The honest read: the metric, its completeness, and the <strong>authenticity of the underlying chain data</strong> are all proven on-chain — the trust boundary other ZK-PnL tools leave wide open. Wash-trading is <strong>solved by construction</strong> — a fee-aware risk-adjusted score makes volume-pumping self-defeating (<code>npm&nbsp;run&nbsp;wash-sybil</code>: Spearman −0.28, 0 churners). The remaining gaps — sybil identity, open-position mark-to-market, venue scope, oracle confidence, an external audit — are listed here on purpose: a verifiability project should name its own boundary, and each is a scoped add-on, not a redesign.
        </p>
      </div>
    </>
  );
}
