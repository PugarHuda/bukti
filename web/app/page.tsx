"use client";

import { useState } from "react";
import {
  fetchAttestation,
  ATTESTATION_ADDRESS,
  mantleSepolia,
  type Attestation,
} from "./lib/contract";

const SAMPLE = "0x1111111111111111111111111111111111111111";

export default function Home() {
  const [addr, setAddr] = useState("");
  const [att, setAtt] = useState<Attestation | null>(null);
  const [state, setState] = useState<"idle" | "loading" | "empty" | "error">("idle");
  const [err, setErr] = useState("");

  const deployed = ATTESTATION_ADDRESS && ATTESTATION_ADDRESS.length === 42;

  async function verify() {
    if (!/^0x[0-9a-fA-F]{40}$/.test(addr)) {
      setErr("Enter a valid 0x… address");
      setState("error");
      return;
    }
    setState("loading");
    setErr("");
    setAtt(null);
    try {
      const a = await fetchAttestation(addr as `0x${string}`);
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
        <strong>verified Sharpe</strong>, not self-reported screenshots.
      </p>

      <div className="card">
        <div className="row">
          <input
            type="text"
            placeholder="0x… agent / wallet address"
            value={addr}
            onChange={(e) => setAddr(e.target.value.trim())}
            onKeyDown={(e) => e.key === "Enter" && verify()}
          />
          <button onClick={verify} disabled={state === "loading" || !deployed}>
            {state === "loading" ? "Verifying…" : "Verify"}
          </button>
        </div>
        {!deployed && (
          <p className="hint">
            Contract not configured yet — set <code>NEXT_PUBLIC_ATTESTATION_ADDRESS</code> after
            deploying to Mantle Sepolia.
          </p>
        )}
        {deployed && state === "idle" && !att && (
          <p className="hint">
            Try the demo agent{" "}
            <a onClick={() => setAddr(SAMPLE)} style={{ cursor: "pointer" }}>
              {SAMPLE}
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
            <div className="proven">✓ Proven in SP1 zkVM · {att.numTrades} trades</div>
            <div className="meta">
              anchor block hash: {att.anchorBlockHash}
              <br />
              attester: {att.attester}
              <br />
              <a
                href={`${mantleSepolia.blockExplorers.default.url}/address/${ATTESTATION_ADDRESS}`}
                target="_blank"
                rel="noreferrer"
              >
                View attestation contract on Mantlescan ↗
              </a>
            </div>
          </>
        )}

        {state === "empty" && (
          <p className="state">No verified attestation for this address yet.</p>
        )}
        {state === "error" && <p className="state err">{err}</p>}
      </div>

      <footer>
        Built on Mantle for The Turing Test Hackathon 2026. The zk proof makes the computation
        (trades → metrics) trustless; data provenance is anchored to a Mantle block hash.
        Contract: {deployed ? ATTESTATION_ADDRESS : "(pending deploy)"}.
      </footer>
    </div>
  );
}
