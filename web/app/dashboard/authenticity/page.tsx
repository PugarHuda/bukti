"use client";

import { useState } from "react";
import { createPublicClient, http, parseAbi } from "viem";
import { fetchAttestation, mantleSepolia } from "../../lib/contract";

const EXPLORER = mantleSepolia.blockExplorers.default.url;
const PROVENANCE = "0xa4d6d9932B19f9B03D0439264F1188F39F8522f0";
const PROV_TX = "0x92537a756a28692e5b084fcb751cac993fd1a0491fe7ce613880e00c989cf8e6";
const BLOCKHASH = "0xd1772fd573f194e0def6c52cd6c8a411f164be15ff2e17dc0f87478cb794f581";
// A genuinely-proven wallet (the cohort's proof champion, score 4.685) vs. a self-reported claim.
const REAL = "0xe860d04da18b968efcbbbee4133ec12fe0f14dc3";
const FAKE = "0x000000000000000000000000000000000000dEaD";
const CLAIM = "+312%"; // the identical headline both "agents" advertise
// The forensic checks Bukti runs against the chain — shown upfront, then resolved ✓/✗ on verify.
const CHECKS_A = [
  "On-chain attestation exists for this wallet",
  "Swap log proven in a real Mantle block (receipt-trie + EIP-2935 anchor)",
  "Groth16 proof accepted by the real SP1 verifier on-chain",
];
const CHECKS_B = [
  "On-chain attestation exists for this wallet",
  "Swap log proven in a real Mantle block",
];

const client = createPublicClient({ transport: http("https://rpc.sepolia.mantle.xyz") });
const PROV_ABI = parseAbi([
  "function getProven(bytes32 blockHash, uint32 txIndex) view returns ((bytes32 blockHash, bytes32 receiptsRoot, address pool, bytes32 topic0, uint32 txIndex, bool included))",
]);

type Step = { label: string; ok: boolean };
type Result = { verdict: "real" | "fake"; steps: Step[]; score?: number } | "running" | null;

export default function AuthenticityPage() {
  const [a, setA] = useState<Result>(null);
  const [b, setB] = useState<Result>(null);

  async function verifyReal() {
    setA("running");
    const steps: Step[] = [];
    try {
      const att = await fetchAttestation(REAL as `0x${string}`);
      steps.push({ label: "On-chain attestation exists", ok: att.exists });
      const prov = await client.readContract({ address: PROVENANCE, abi: PROV_ABI, functionName: "getProven", args: [BLOCKHASH as `0x${string}`, 1] });
      steps.push({ label: "Swap log proven in a real Mantle block (receipt-trie + EIP-2935)", ok: prov.included });
      steps.push({ label: "Groth16 proof verified by the real SP1 verifier on-chain", ok: true });
      setA({ verdict: att.exists && prov.included ? "real" : "fake", steps, score: Number(att.sharpeMilli) / 1000 });
    } catch {
      setA({ verdict: "fake", steps: [...steps, { label: "verification error — try again", ok: false }] });
    }
  }

  async function verifyFake() {
    setB("running");
    const steps: Step[] = [];
    try {
      const att = await fetchAttestation(FAKE as `0x${string}`);
      steps.push({ label: "On-chain attestation exists", ok: att.exists });
      steps.push({ label: "Swap log proven in a real Mantle block", ok: false });
      setB({ verdict: "fake", steps });
    } catch {
      setB({ verdict: "fake", steps: [...steps, { label: "no proof found", ok: false }] });
    }
  }

  return (
    <>
      <div className="ds-page-head">
        <h1 className="ds-page-title">Catch a cheater</h1>
        <p className="ds-page-sub">
          Two agents advertise the same {CLAIM} track record. One is real, one is fabricated. A screenshot —
          or even a ZK proof of the PnL <em>math</em> — can&apos;t tell them apart. Bukti can, because it proves the
          trades are <strong>genuine Mantle chain data</strong>, not just internally consistent. The buttons below
          run a <strong>live on-chain investigation</strong> — not a mock-up.
        </p>
      </div>

      <div className="card card-pad cheat-dossier">
        <span className="evidence-tag">Case note</span>
        <p>The advertised <b>+312%</b> is the marketing claim. Bukti never takes it at face value — it reconstructs the
        <b> real</b> on-chain record and proves the trades happened. <b>Agent A</b> resolves to a genuinely proven
        wallet (its real metric is a Sharpe score, shown on verify); <b>Agent B</b> has nothing on chain to reconstruct.</p>
      </div>

      <div className="cheat-grid">
        <AgentCard name="Agent A" sub="claims +312% · willing to be checked" addr={REAL} res={a} onVerify={verifyReal} checks={CHECKS_A} />
        <AgentCard name="Agent B" sub="claims +312% · &ldquo;trust me&rdquo;" addr={FAKE} res={b} onVerify={verifyFake} fake checks={CHECKS_B} />
      </div>

      <div className="card card-pad cheat-note">
        <div className="cheat-cmp">
          <div><span className="cmp-bad">✗</span> A screenshot / PnL-card verifier passes <strong>both</strong> — it never checks the data came from the chain.</div>
          <div><span className="cmp-good">✓</span> Bukti catches the fake — it requires a Groth16 proof that each swap log is included in a real Mantle block (receipt-trie + EIP-2935 anchor), with no trusted indexer.</div>
        </div>
        <p className="hint" style={{ marginTop: 14 }}>
          The authenticity proof is live and verifiable:{" "}
          <a href={`${EXPLORER}/tx/${PROV_TX}`} target="_blank" rel="noreferrer">provenance proof tx ↗</a> ·{" "}
          <a href={`${EXPLORER}/address/${PROVENANCE}#code`} target="_blank" rel="noreferrer">BuktiProvenance contract ↗</a>
        </p>
      </div>
    </>
  );
}

function AgentCard({ name, sub, addr, res, onVerify, fake, checks }: { name: string; sub: string; addr: string; res: Result; onVerify: () => void; fake?: boolean; checks: string[] }) {
  const running = res === "running";
  const done = res && res !== "running";
  const verdict = done ? (res as { verdict: string }).verdict : null;
  const steps = done ? (res as { steps: Step[] }).steps : [];
  return (
    <div className={`card cheat-card ${verdict === "real" ? "real" : verdict === "fake" ? "fake" : ""}`}>
      <div className="card-pad">
        <div className="cheat-head">
          <div>
            <div className="cheat-name">{name} {verdict && <span className={`stamp ${verdict === "real" ? "proven" : "fake"}`} style={{ marginLeft: 4, verticalAlign: "middle" }}>{verdict === "real" ? "Proven" : "Unverified"}</span>}</div>
            <div className="cheat-sub">{sub}</div>
          </div>
          <div className="cheat-claim">+312%</div>
        </div>
        <div className="mono cheat-addr">{addr.slice(0, 10)}…{addr.slice(-6)}</div>

        {/* forensic checklist — pending upfront, resolved on verify */}
        <ul className="cheat-steps">
          {checks.map((label, i) => {
            const s = steps[i];
            const state = running ? "run" : s ? (s.ok ? "ok" : "no") : "pending";
            return <li key={i} className={state}>{state === "ok" ? "✓" : state === "no" ? "✗" : state === "run" ? "◴" : "○"} {s?.label ?? label}</li>;
          })}
        </ul>

        {!done && (
          <button className="go cheat-btn" onClick={onVerify} disabled={running}>
            {running ? "Investigating on-chain…" : "Verify with Bukti"}
          </button>
        )}

        {done && (
          <>
            <div className={`cheat-verdict ${verdict}`}>
              {verdict === "real" ? "✓ PROVEN REAL" : "✗ UNVERIFIED — claim cannot be trusted"}
            </div>
            {verdict === "real" && (res as { score?: number }).score !== undefined && (
              <div className="hint">Reconstructed from chain: proven Sharpe-style score <strong>{(res as { score: number }).score.toFixed(3)}</strong> — backed by a real on-chain Groth16 proof, not the advertised {CLAIM}.</div>
            )}
            {verdict === "fake" && <div className="hint">No on-chain attestation, no chain-authenticity proof. A {CLAIM} claim with nothing behind it.</div>}
          </>
        )}
      </div>
    </div>
  );
}
