"use client";

const ROWS = [
  { aspect: "Risk-adjusted metric (Sharpe / drawdown / ROI from raw swaps)", status: "proven", how: "Reconstructed inside an SP1 zkVM; one Groth16 proof verified on-chain by the real SP1 v6.1.0 verifier." },
  { aspect: "Completeness — the FULL swap set, no cherry-picking", status: "proven", how: "An in-circuit keccak commitment to every ordered leg (swapsRoot). 25/25 verified against the public witness." },
  { aspect: "Swap-log authenticity — the trades are genuine Mantle chain data", status: "proven", how: "Receipt-trie inclusion under the block's receiptsRoot, proven on-chain (BuktiProvenance, getProven = true)." },
  { aspect: "Block-hash anchor — the block is real, not relayer-asserted", status: "trustless", how: "EIP-2935 is live on Mantle (Arsia): the historical block hash is readable on-chain — no relayer." },
  { aspect: "Price authenticity — prices are the real Pyth-signed values", status: "core-built", how: "An in-zkVM Pyth/Wormhole guardian-signature verifier (4/4 tests vs a real Hermes update). Folding into the live circuit is the remaining integration." },
  { aspect: "Wash-trading / sybil volume", status: "open", how: "Inherent to any on-chain metric — but our headline insight makes it visible: the volume champion ranks #17 by proven score. Anti-sybil set-exclusion is a scoped roadmap item." },
];

const LABEL: Record<string, string> = { proven: "PROVEN", trustless: "TRUSTLESS", "core-built": "CORE BUILT", open: "HONEST GAP" };

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
          The honest read: the metric, its completeness, and the <strong>authenticity of the underlying chain data</strong> are all proven on-chain — the trust boundary other ZK-PnL tools leave wide open. Price-signature verification is built and tested; its circuit integration plus anti-sybil are the precise, scoped roadmap.
        </p>
      </div>
    </>
  );
}
