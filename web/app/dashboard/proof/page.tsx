"use client";

import { ATTESTATION_ADDRESS, VERIFIER_ADDRESS, VERIFIER_VERSION, mantleSepolia } from "../../lib/contract";
import { short } from "../lib";

const EXPLORER = mantleSepolia.blockExplorers.default.url;

const CONTRACTS = [
  { label: "BuktiAttestation (batch)", addr: ATTESTATION_ADDRESS },
  { label: "BuktiAttestation v3 (+completeness)", addr: "0x03fA99f0dE08F182b2880Ee12a2194DBF00a0Dbf" },
  { label: "SP1 v6.1.0 Groth16 verifier", addr: VERIFIER_ADDRESS },
  { label: "BuktiValidator (ERC-8004)", addr: "0xda0cEB552af13f5a096D8aA4E5A9FceB9cf6D8D0" },
  { label: "BuktiAllocator", addr: "0x6DF2F45f9184346C175a94D783F37C77C8f3B8B2" },
  { label: "BuktiProvenance (swap-log proof)", addr: "0xa4d6d9932B19f9B03D0439264F1188F39F8522f0" },
];

export default function ProofPage() {
  return (
    <>
      <div className="ds-page-head">
        <h1 className="ds-page-title">Proof layer</h1>
        <p className="ds-page-sub">Every contract is deployed and source-verified on Mantle Sepolia. Invalid proofs revert with <code>WrongVerifierSelector</code>. Don&apos;t trust us — check.</p>
      </div>

      <div className="card">
        <div className="card-head"><h2 className="card-title">Deployed contracts</h2><span className="badge">chainId 5003</span></div>
        <table className="board">
          <tbody>
            {CONTRACTS.map((c) => (
              <tr key={c.addr} onClick={() => window.open(`${EXPLORER}/address/${c.addr}#code`, "_blank")}>
                <td>{c.label}</td>
                <td className="mono num"><a href={`${EXPLORER}/address/${c.addr}#code`} target="_blank" rel="noreferrer">{short(c.addr)} ↗</a></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card card-pad">
        <p className="meta" style={{ marginTop: 0 }}>
          On-chain verifier <strong>{VERIFIER_VERSION}</strong> — invalid proofs revert. Scores also written to Mantle&apos;s canonical{" "}
          <a href={`${EXPLORER}/address/0x8004B663056A597Dffe9eCcC1965A193B7388713`} target="_blank" rel="noreferrer">ERC-8004 ReputationRegistry ↗</a>.
        </p>
        <code className="snippet">cast call {short(ATTESTATION_ADDRESS)} &quot;getSharpeMilli(address)(int64,bool)&quot; &lt;wallet&gt; --rpc-url https://rpc.sepolia.mantle.xyz</code>
      </div>
    </>
  );
}
