"use client";

import { useState } from "react";
import { fetchAttestation, type Attestation, mantleSepolia } from "../../lib/contract";
import { short } from "../lib";

const EXPLORER = mantleSepolia.blockExplorers.default.url;

export default function VerifyPage() {
  const [addr, setAddr] = useState("");
  const [att, setAtt] = useState<Attestation | null>(null);
  const [state, setState] = useState<"idle" | "loading" | "empty" | "error">("idle");
  const [err, setErr] = useState("");

  async function verify() {
    const a0 = addr.trim();
    if (!/^0x[0-9a-fA-F]{40}$/.test(a0)) { setErr("Enter a valid 0x… address"); setState("error"); return; }
    setState("loading"); setErr(""); setAtt(null);
    try {
      const a = await fetchAttestation(a0 as `0x${string}`);
      if (!a.exists) return setState("empty");
      setAtt(a); setState("idle");
    } catch (e) { setErr((e as Error).message); setState("error"); }
  }

  const sharpe = att ? Number(att.sharpeMilli) / 1000 : 0;
  const roi = att ? Number(att.roiBps) / 100 : 0;
  const dd = att ? att.maxDrawdownBps / 100 : 0;
  const vol = att ? Number(att.volumeUsdE6) / 1e6 : 0;

  return (
    <>
      <div className="ds-page-head">
        <h1 className="ds-page-title">Verify wallet</h1>
        <p className="ds-page-sub">Read any wallet&apos;s zk-proven track record straight from the attestation contract on Mantle.</p>
      </div>

      <div className="card card-pad">
        <div className="row">
          <input type="text" placeholder="0x… agent / wallet address" value={addr}
            onChange={(e) => setAddr(e.target.value.trim())} onKeyDown={(e) => e.key === "Enter" && verify()} />
          <button className="go" onClick={verify} disabled={state === "loading"}>{state === "loading" ? "…" : "Verify"}</button>
        </div>
        {state === "empty" && <p className="state" style={{ marginTop: 16 }}>No verified attestation on-chain for {short(addr)} — any performance claim from it is unverified.</p>}
        {state === "error" && <p className="state err" style={{ marginTop: 16 }}>{err}</p>}
        {att && (
          <div style={{ marginTop: 18 }}>
            <div className="metrics">
              <div className="metric"><div className="k">Bukti score</div><div className={`v ${sharpe >= 0 ? "good" : "bad"}`}>{sharpe.toFixed(3)}</div></div>
              <div className="metric"><div className="k">Max drawdown</div><div className="v">{dd.toFixed(2)}%</div></div>
              <div className="metric"><div className="k">ROI</div><div className={`v ${roi >= 0 ? "good" : "bad"}`}>{roi.toFixed(2)}%</div></div>
              <div className="metric"><div className="k">Volume</div><div className="v">${vol.toLocaleString(undefined, { maximumFractionDigits: 0 })}</div></div>
            </div>
            <div style={{ marginTop: 14, display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap" }}>
              <span className="proven">✓ proven in SP1 zkVM · {att.numTrades} realized trades · read live</span>
              <a className="hint" href={`/w/${addr}`} target="_blank" rel="noreferrer">Share card ↗</a>
              <a className="hint" href={`${EXPLORER}/address/${addr}`} target="_blank" rel="noreferrer">Mantlescan ↗</a>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
