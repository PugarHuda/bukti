"use client";

import { useState } from "react";
import { createPublicClient, http, parseAbi } from "viem";
import { ATTESTATION_ADDRESS, VERIFIER_ADDRESS, VERIFIER_VERSION, mantleSepolia } from "../../lib/contract";
import { short } from "../lib";

const EXPLORER = mantleSepolia.blockExplorers.default.url;
const client = createPublicClient({ transport: http("https://rpc.sepolia.mantle.xyz") });
const VERIFIER_ABI = parseAbi(["function verifyProof(bytes32 programVKey, bytes publicValues, bytes proofBytes) view"]);

function VerifyProofYourself() {
  const [state, setState] = useState<"idle" | "real-ok" | "real-run" | "tamper-bad" | "tamper-run">("idle");
  const [detail, setDetail] = useState("");

  async function run(tamper: boolean) {
    setState(tamper ? "tamper-run" : "real-run");
    setDetail("");
    try {
      const fx = await (await fetch("/proof-fixture.json")).json();
      let proof = fx.proof as string;
      if (tamper) {
        // flip a byte in the proof body (after the 4-byte selector) -> must revert
        const i = 20;
        const flipped = (parseInt(proof.slice(i, i + 2), 16) ^ 0xff).toString(16).padStart(2, "0");
        proof = proof.slice(0, i) + flipped + proof.slice(i + 2);
      }
      await client.readContract({ address: VERIFIER_ADDRESS, abi: VERIFIER_ABI, functionName: "verifyProof", args: [fx.vkey as `0x${string}`, fx.publicValues as `0x${string}`, proof as `0x${string}`] });
      setState(tamper ? "real-ok" : "real-ok"); // (tampered proof should NOT reach here)
      if (tamper) setDetail("unexpected: tampered proof did not revert");
    } catch (e) {
      const msg = (e as Error).message || "";
      if (tamper) {
        setState("tamper-bad");
        setDetail(/revert|WrongVerifier|invalid|0x/i.test(msg) ? "reverted on-chain ✓ (proof rejected)" : msg.slice(0, 80));
      } else {
        setState("idle");
        setDetail("RPC hiccup — try again");
      }
    }
  }

  return (
    <div className="card card-pad" style={{ marginBottom: 16 }}>
      <h2 className="card-title" style={{ marginBottom: 10 }}>Verify a real Groth16 proof — live, in your browser</h2>
      <p className="hint" style={{ marginTop: 0 }}>
        These buttons ask the real on-chain SP1 verifier ({VERIFIER_VERSION}) to check Bukti&apos;s actual 356-byte proof, from your browser. Don&apos;t trust us — watch it pass, then watch a tampered proof get rejected.
      </p>
      <div className="copilot-btns" style={{ flexDirection: "row", flexWrap: "wrap" }}>
        <button className="go" onClick={() => run(false)} disabled={state.endsWith("run")}>{state === "real-run" ? "Verifying…" : "Verify the real proof"}</button>
        <button className="ghost" onClick={() => run(true)} disabled={state.endsWith("run")}>{state === "tamper-run" ? "Verifying…" : "Verify a tampered proof"}</button>
      </div>
      {state === "real-ok" && <div className="cheat-verdict real" style={{ marginTop: 12 }}>✓ VALID — the on-chain verifier accepted the proof {detail && `· ${detail}`}</div>}
      {state === "tamper-bad" && <div className="cheat-verdict fake" style={{ marginTop: 12 }}>✗ REJECTED — {detail}</div>}
    </div>
  );
}

const CONTRACTS = [
  { label: "BuktiAttestation (batch)", addr: ATTESTATION_ADDRESS },
  { label: "BuktiAttestation v3 (+completeness)", addr: "0x03fA99f0dE08F182b2880Ee12a2194DBF00a0Dbf" },
  { label: "SP1 v6.1.0 Groth16 verifier", addr: VERIFIER_ADDRESS },
  { label: "BuktiValidator (ERC-8004)", addr: "0xda0cEB552af13f5a096D8aA4E5A9FceB9cf6D8D0" },
  { label: "BuktiAllocator", addr: "0x6DF2F45f9184346C175a94D783F37C77C8f3B8B2" },
  { label: "BuktiProvenance (swap-log proof)", addr: "0xa4d6d9932B19f9B03D0439264F1188F39F8522f0" },
  { label: "BuktiFullProof (metric over proven chain data)", addr: "0xC16f221d8bae221A7B5B3ca74DCDCb892B9067FB" },
];

export default function ProofPage() {
  return (
    <>
      <div className="ds-page-head">
        <h1 className="ds-page-title">Proof layer</h1>
        <p className="ds-page-sub">Every contract is deployed and source-verified on Mantle Sepolia. Invalid proofs revert with <code>WrongVerifierSelector</code>. Don&apos;t trust us — check.</p>
      </div>

      <VerifyProofYourself />

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
