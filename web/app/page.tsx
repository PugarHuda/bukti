"use client";

import { useEffect, useState } from "react";
import {
  fetchAttestation,
  fetchLeaderboard,
  ATTESTATION_ADDRESS,
  VERIFIER_ADDRESS,
  VERIFIER_VERSION,
  mantleSepolia,
  type Attestation,
  type LeaderboardEntry,
} from "./lib/contract";

// Real ClawHack-cohort top scorer (batch-attested on-chain) — used as the demo hint.
const SAMPLE = "0x48f1142AFA03A3b710f63c3D9fF56655A58F7b8d";
const EXPLORER = mantleSepolia.blockExplorers.default.url;

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

export default function Home() {
  const [addr, setAddr] = useState("");
  const [att, setAtt] = useState<Attestation | null>(null);
  const [state, setState] = useState<"idle" | "loading" | "empty" | "error">("idle");
  const [err, setErr] = useState("");
  const [board, setBoard] = useState<LeaderboardEntry[] | null>(null);
  const [boardErr, setBoardErr] = useState(false);

  const deployed = ATTESTATION_ADDRESS && ATTESTATION_ADDRESS.length === 42;

  useEffect(() => {
    fetchLeaderboard()
      .then(setBoard)
      .catch(() => setBoardErr(true));
  }, []);

  async function verify(target?: string) {
    const a0 = (target ?? addr).trim();
    if (!/^0x[0-9a-fA-F]{40}$/.test(a0)) {
      setErr("Enter a valid 0x… address");
      setState("error");
      return;
    }
    if (target) setAddr(target);
    setState("loading");
    setErr("");
    setAtt(null);
    try {
      const a = await fetchAttestation(a0 as `0x${string}`);
      if (!a.exists) {
        setState("empty");
        return;
      }
      setAtt(a);
      setState("idle");
    } catch (e) {
      setErr((e as Error).message);
      setState("error");
    }
  }

  const sharpe = att ? Number(att.sharpeMilli) / 1000 : 0;
  const roi = att ? Number(att.roiBps) / 100 : 0;
  const dd = att ? att.maxDrawdownBps / 100 : 0;
  const vol = att ? Number(att.volumeUsdE6) / 1e6 : 0;

  return (
    <div className="wrap">
      <div className="brand">
        <h1>Bukti</h1>
        <span className="zk">zk-verified</span>
      </div>
      <p className="tagline">
        Nansen tells you a wallet&apos;s PnL. <strong>Bukti proves its risk-adjusted
        track record on-chain</strong> — reconstructed from raw Mantle DeFi trades inside an
        SP1 zkVM, so any vault, lender, or copy-trade protocol can route capital by{" "}
        <strong>verified score</strong>, not self-reported screenshots.
      </p>

      <div className="steps">
        <div className="step">
          <span className="n">1</span> Raw swaps pulled from Mantle + historical Pyth prices
        </div>
        <div className="step">
          <span className="n">2</span> Cost-basis PnL &amp; risk metrics reconstructed{" "}
          <strong>inside the SP1 zkVM</strong>
        </div>
        <div className="step">
          <span className="n">3</span> Groth16 proof verified on-chain → composable score +
          ERC-8004 reputation
        </div>
      </div>

      <div className="card">
        <div className="row">
          <input
            type="text"
            placeholder="0x… agent / wallet address"
            value={addr}
            onChange={(e) => setAddr(e.target.value.trim())}
            onKeyDown={(e) => e.key === "Enter" && verify()}
          />
          <button onClick={() => verify()} disabled={state === "loading" || !deployed}>
            {state === "loading" ? "Verifying…" : "Verify"}
          </button>
        </div>
        {deployed && state === "idle" && !att && (
          <p className="hint">
            Pick a wallet from the leaderboard below, or try the top ClawHack trader{" "}
            <a onClick={() => verify(SAMPLE)} style={{ cursor: "pointer" }}>
              {short(SAMPLE)}
            </a>
          </p>
        )}

        {att && (
          <>
            <div className="metrics">
              <div className="metric">
                <div className="k">Bukti Score (per-trade)</div>
                <div className={`v ${sharpe >= 0 ? "good" : "bad"}`}>{sharpe.toFixed(3)}</div>
              </div>
              <div className="metric">
                <div className="k">Max Drawdown</div>
                <div className="v">{dd.toFixed(2)}%</div>
              </div>
              <div className="metric">
                <div className="k">ROI</div>
                <div className={`v ${roi >= 0 ? "good" : "bad"}`}>{roi.toFixed(2)}%</div>
              </div>
              <div className="metric">
                <div className="k">Volume (USD)</div>
                <div className="v">${vol.toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
              </div>
            </div>
            <div className="proven">✓ Proven in SP1 zkVM · {att.numTrades} realized trades</div>
            <div className="meta">
              anchor block hash: {att.anchorBlockHash}
              <br />
              attester: {att.attester}
            </div>
          </>
        )}

        {state === "empty" && (
          <p className="state">No verified attestation for this address yet.</p>
        )}
        {state === "error" && <p className="state err">{err}</p>}
      </div>

      <div className="card" style={{ marginTop: 18 }}>
        <h2 className="h2">On-chain leaderboard</h2>
        <p className="hint" style={{ marginTop: 2 }}>
          Built live from <code>AttestationSubmitted</code> events — every row is a wallet whose
          score was verified on-chain.
        </p>
        {board === null && !boardErr && <p className="state">Scanning Mantle Sepolia…</p>}
        {boardErr && <p className="state err">Could not scan events (RPC busy) — refresh.</p>}
        {board && board.length === 0 && <p className="state">No attestations yet.</p>}
        {board && board.length > 0 && (
          <table className="board">
            <thead>
              <tr>
                <th>#</th>
                <th>Wallet</th>
                <th>Score</th>
                <th>ROI</th>
                <th>Volume</th>
                <th>Proof</th>
              </tr>
            </thead>
            <tbody>
              {board.map((e, i) => (
                <tr key={e.wallet} onClick={() => verify(e.wallet)} style={{ cursor: "pointer" }}>
                  <td>{i + 1}</td>
                  <td className="mono">
                    {short(e.wallet)}
                    {e.wallet.toLowerCase() === SAMPLE.toLowerCase() ? " 👑" : ""}
                  </td>
                  <td className={Number(e.sharpeMilli) >= 0 ? "good" : "bad"}>
                    {(Number(e.sharpeMilli) / 1000).toFixed(3)}
                  </td>
                  <td className={Number(e.roiBps) >= 0 ? "good" : "bad"}>
                    {(Number(e.roiBps) / 100).toFixed(2)}%
                  </td>
                  <td>${(Number(e.volumeUsdE6) / 1e6).toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
                  <td>
                    <a
                      href={`${EXPLORER}/tx/${e.txHash}`}
                      target="_blank"
                      rel="noreferrer"
                      onClick={(ev) => ev.stopPropagation()}
                    >
                      tx ↗
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="card" style={{ marginTop: 18 }}>
        <h2 className="h2">The proof layer</h2>
        <div className="meta" style={{ marginTop: 6 }}>
          Attestation contract:{" "}
          <a href={`${EXPLORER}/address/${ATTESTATION_ADDRESS}#code`} target="_blank" rel="noreferrer">
            {short(ATTESTATION_ADDRESS)} ↗
          </a>{" "}
          (verified source)
          <br />
          On-chain verifier:{" "}
          <a href={`${EXPLORER}/address/${VERIFIER_ADDRESS}#code`} target="_blank" rel="noreferrer">
            {short(VERIFIER_ADDRESS)} ↗
          </a>{" "}
          — <strong>{VERIFIER_VERSION}</strong>, a real Groth16 verifier: invalid proofs revert.
          <br />
          Reputation rail: scores are also written to Mantle&apos;s canonical{" "}
          <a
            href={`${EXPLORER}/address/0x8004B663056A597Dffe9eCcC1965A193B7388713`}
            target="_blank"
            rel="noreferrer"
          >
            ERC-8004 ReputationRegistry ↗
          </a>
          .
        </div>
      </div>

      <footer>
        Built on Mantle for The Turing Test Hackathon 2026. The zk proof covers the full
        reconstruction (raw swaps → cost-basis PnL → risk metrics) in deterministic integer math;
        data provenance is anchored to a Mantle block hash.
      </footer>
    </div>
  );
}
