"use client";

import { useState } from "react";
import { recoverMessageAddress } from "viem";
import { fetchAttestation, type Attestation, mantleSepolia } from "../../lib/contract";
import { short } from "../lib";

const EXPLORER = mantleSepolia.blockExplorers.default.url;

type Live = { found: boolean; score?: number; roi?: number; pnl?: number; maxDrawdown?: number; volume?: number; swaps?: number; trades?: number; message?: string };

export default function VerifyPage() {
  const [addr, setAddr] = useState("");
  const [att, setAtt] = useState<Attestation | null>(null);
  const [state, setState] = useState<"idle" | "loading" | "empty" | "error">("idle");
  const [err, setErr] = useState("");
  const [account, setAccount] = useState<string | null>(null);
  const [control, setControl] = useState<"idle" | "signing" | "ok" | "fail">("idle");
  const [live, setLive] = useState<Live | null>(null);
  const [liveState, setLiveState] = useState<"idle" | "loading" | "done" | "err">("idle");

  async function verify(input?: string) {
    const a0 = (input ?? addr).trim();
    if (!/^0x[0-9a-fA-F]{40}$/.test(a0)) { setErr("Enter a valid 0x… address"); setState("error"); return; }
    setState("loading"); setErr(""); setAtt(null); setControl("idle"); setLive(null); setLiveState("idle");
    try {
      const a = await fetchAttestation(a0 as `0x${string}`);
      if (!a.exists) return setState("empty");
      setAtt(a); setState("idle");
    } catch (e) { setErr((e as Error).message); setState("error"); }
  }

  async function computeLive() {
    const a0 = addr.trim();
    setLiveState("loading"); setLive(null);
    try {
      const r = await fetch(`/api/score/${a0}`);
      const j: Live = await r.json();
      setLive(j); setLiveState(j.found ? "done" : "err");
    } catch { setLiveState("err"); }
  }

  async function connect() {
    const eth = (typeof window !== "undefined" ? (window as { ethereum?: { request: (a: { method: string; params?: unknown[] }) => Promise<string[]> } }).ethereum : undefined);
    if (!eth) { setErr("No injected wallet found — install MetaMask (or any EIP-1193 wallet)."); setState("error"); return; }
    try { const [a] = await eth.request({ method: "eth_requestAccounts" }); setAccount(a); setAddr(a); verify(a); }
    catch { setErr("Wallet connection rejected."); setState("error"); }
  }

  async function proveControl() {
    const eth = (window as { ethereum?: { request: (a: { method: string; params?: unknown[] }) => Promise<string> } }).ethereum;
    if (!eth || !account) return;
    setControl("signing");
    try {
      const nonce = Math.random().toString(16).slice(2, 10);
      const message = `Bukti: I control ${account.toLowerCase()} and bind it to my proven track record.\nnonce: ${nonce}`;
      const sig = (await eth.request({ method: "personal_sign", params: [message, account] })) as `0x${string}`;
      const recovered = await recoverMessageAddress({ message, signature: sig });
      setControl(recovered.toLowerCase() === account.toLowerCase() ? "ok" : "fail");
    } catch { setControl("fail"); }
  }

  const isMine = account && account.toLowerCase() === addr.toLowerCase();
  const sharpe = att ? Number(att.sharpeMilli) / 1000 : 0;
  const roi = att ? Number(att.roiBps) / 100 : 0;
  const dd = att ? att.maxDrawdownBps / 100 : 0;
  const vol = att ? Number(att.volumeUsdE6) / 1e6 : 0;

  return (
    <>
      <div className="ds-page-head">
        <h1 className="ds-page-title">Verify wallet</h1>
        <p className="ds-page-sub">Read any wallet&apos;s zk-proven track record from the attestation contract — or <strong>connect yours</strong> to score it live, share it, and prove you control it. Verify is a <strong>read</strong>; a score is proven, not self-registered.</p>
      </div>

      <div className="card card-pad">
        <div className="vw-bar">
          <input type="text" placeholder="0x… agent / wallet address" value={addr}
            onChange={(e) => setAddr(e.target.value.trim())} onKeyDown={(e) => e.key === "Enter" && verify()} />
          <button className="btn btn-primary" onClick={() => verify()} disabled={state === "loading"}>{state === "loading" ? "Verifying…" : "Verify"}</button>
          {account
            ? <span className="vw-conn mono" title={account}><span className="vw-dot" /> {short(account)}</span>
            : <button className="btn btn-soft" onClick={connect}>Connect wallet</button>}
        </div>

        {/* No on-chain attestation → offer a REAL live score from on-chain swaps */}
        {state === "empty" && (
          <div className="vw-panel">
            <p className="state" style={{ margin: "0 0 12px" }}>No proof on-chain for {short(addr)} yet — its track record is <strong>unverified</strong>.</p>
            <div className="vw-self">
              <div className="evidence-tag">Score it live — no proof needed to look</div>
              <p>Bukti can reconstruct this wallet&apos;s <strong>real</strong> risk-adjusted score from its actual on-chain swaps right now — the <em>exact</em> integer math the zk circuit proves (the on-chain cohort matches it bit-for-bit). The Groth16 attestation is that same computation, run through the prover.</p>
              {liveState !== "done" && (
                <button className="btn btn-primary" onClick={computeLive} disabled={liveState === "loading"}>
                  {liveState === "loading" ? "Scanning your on-chain swaps…" : "Compute my live score"}
                </button>
              )}
              {liveState === "err" && <p className="hint" style={{ marginTop: 10 }}>{live?.message ?? "No swaps found on the indexed Agni/FusionX pools in the recent window."}</p>}
              {liveState === "done" && live?.found && (
                <div className="vw-liveresult">
                  <div className="vw-live-tag mono">● live reconstruction · {live.trades} realized trades · {live.swaps} swaps</div>
                  <div className="metrics">
                    <div className="metric"><div className="k">Live score</div><div className={`v ${(live.score ?? 0) >= 0 ? "good" : "bad"}`}>{live.score?.toFixed(3)}</div></div>
                    <div className="metric"><div className="k">Max drawdown</div><div className="v">{live.maxDrawdown?.toFixed(2)}%</div></div>
                    <div className="metric"><div className="k">ROI</div><div className={`v ${(live.roi ?? 0) >= 0 ? "good" : "bad"}`}>{live.roi?.toFixed(2)}%</div></div>
                    <div className="metric"><div className="k">Volume</div><div className="v">${(live.volume ?? 0).toLocaleString(undefined, { maximumFractionDigits: (live.volume ?? 0) < 100 ? 2 : 0 })}</div></div>
                  </div>
                  <p className="hint" style={{ marginTop: 10 }}>This is your <strong>real</strong> score, computed live — same math as the proof. To mint the on-chain Groth16 attestation (so contracts can <code>require()</code> it), run it through the prover: <a href="https://github.com/PugarHuda/bukti" target="_blank" rel="noreferrer">how →</a></p>
                </div>
              )}
            </div>
          </div>
        )}
        {state === "error" && <p className="state err" style={{ marginTop: 16 }}>{err}</p>}

        {/* On-chain proven attestation */}
        {att && (
          <div className="vw-panel">
            <div className="metrics">
              <div className="metric"><div className="k">Bukti score</div><div className={`v ${sharpe >= 0 ? "good" : "bad"}`}>{sharpe.toFixed(3)}</div></div>
              <div className="metric"><div className="k">Max drawdown</div><div className="v">{dd.toFixed(2)}%</div></div>
              <div className="metric"><div className="k">ROI</div><div className={`v ${roi >= 0 ? "good" : "bad"}`}>{roi.toFixed(2)}%</div></div>
              <div className="metric"><div className="k">Volume</div><div className="v">${vol.toLocaleString(undefined, { maximumFractionDigits: vol < 100 ? 2 : 0 })}</div></div>
            </div>
            <div className="vw-actions">
              <span className="proven">✓ proven in SP1 zkVM · {att.numTrades} realized trades · read live</span>
              <a className="btn btn-ghost" href={`/w/${addr}`} target="_blank" rel="noreferrer">Share card ↗</a>
              <a className="btn btn-ghost" href={`/dashboard/wallet/${addr}`}>Full breakdown →</a>
              <a className="btn btn-ghost" href={`${EXPLORER}/address/${addr}`} target="_blank" rel="noreferrer">Mantlescan ↗</a>
            </div>

            {isMine && (
              <div className="vw-self">
                <div className="evidence-tag">Prove you control this wallet</div>
                <p>Bukti proves a wallet&apos;s <em>history</em>. Sign a Bukti challenge (EIP-191, free, off-chain) to bind this proven record to <strong>you</strong> — so the card is provably yours, not a wallet you pointed at.</p>
                {control === "ok"
                  ? <div className="vw-bound">✓ Control proven — you signed as {short(account!)}. This record is bound to you.</div>
                  : control === "fail"
                  ? <p className="state err" style={{ margin: 0 }}>Signature didn&apos;t match — try again.</p>
                  : <button className="btn btn-primary" onClick={proveControl} disabled={control === "signing"}>{control === "signing" ? "Check your wallet…" : "Sign to prove control"}</button>}
              </div>
            )}

            <div className="vw-badge">
              <div className="hint" style={{ marginBottom: 8 }}>Embeddable badge — drop your proven record into any README, agent profile, or site (live from chain):</div>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/badge/${addr}`} alt="Bukti score badge" style={{ height: 20, display: "block", marginBottom: 10 }} />
              <code className="snippet">![Bukti](https://bukti-smoky.vercel.app/badge/{addr})</code>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
