"use client";

import { useState } from "react";
import { recoverMessageAddress } from "viem";
import { fetchAttestation, type Attestation, mantleSepolia } from "../../lib/contract";
import { short } from "../lib";

const EXPLORER = mantleSepolia.blockExplorers.default.url;

export default function VerifyPage() {
  const [addr, setAddr] = useState("");
  const [att, setAtt] = useState<Attestation | null>(null);
  const [state, setState] = useState<"idle" | "loading" | "empty" | "error">("idle");
  const [err, setErr] = useState("");
  const [account, setAccount] = useState<string | null>(null);
  const [control, setControl] = useState<"idle" | "signing" | "ok" | "fail">("idle");

  async function verify(input?: string) {
    const a0 = (input ?? addr).trim();
    if (!/^0x[0-9a-fA-F]{40}$/.test(a0)) { setErr("Enter a valid 0x… address"); setState("error"); return; }
    setState("loading"); setErr(""); setAtt(null); setControl("idle");
    try {
      const a = await fetchAttestation(a0 as `0x${string}`);
      if (!a.exists) return setState("empty");
      setAtt(a); setState("idle");
    } catch (e) { setErr((e as Error).message); setState("error"); }
  }

  async function connect() {
    const eth = (typeof window !== "undefined" ? (window as { ethereum?: { request: (a: { method: string; params?: unknown[] }) => Promise<string[]> } }).ethereum : undefined);
    if (!eth) { setErr("No injected wallet found — install MetaMask (or any EIP-1193 wallet)."); setState("error"); return; }
    try {
      const [a] = await eth.request({ method: "eth_requestAccounts" });
      setAccount(a); setAddr(a); verify(a);
    } catch { setErr("Wallet connection rejected."); setState("error"); }
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

  const isMine = account && att && account.toLowerCase() === addr.toLowerCase();
  const sharpe = att ? Number(att.sharpeMilli) / 1000 : 0;
  const roi = att ? Number(att.roiBps) / 100 : 0;
  const dd = att ? att.maxDrawdownBps / 100 : 0;
  const vol = att ? Number(att.volumeUsdE6) / 1e6 : 0;

  return (
    <>
      <div className="ds-page-head">
        <h1 className="ds-page-title">Verify wallet</h1>
        <p className="ds-page-sub">Read any wallet&apos;s zk-proven track record straight from the attestation contract on Mantle — or <strong>connect yours</strong> to view, share, and prove you control it. This is a <strong>read</strong>: the score must already be proven on-chain (Bukti runs the zkVM pipeline; it isn&apos;t self-registered).</p>
      </div>

      <div className="card card-pad">
        <div className="row" style={{ alignItems: "center" }}>
          <input type="text" placeholder="0x… agent / wallet address" value={addr}
            onChange={(e) => setAddr(e.target.value.trim())} onKeyDown={(e) => e.key === "Enter" && verify()} />
          <button className="go" onClick={() => verify()} disabled={state === "loading"}>{state === "loading" ? "…" : "Verify"}</button>
          {account
            ? <span className="vw-conn mono" title={account}>● {short(account)}</span>
            : <button className="ghost" onClick={connect}>Connect wallet</button>}
        </div>

        {state === "empty" && (
          <div style={{ marginTop: 16 }}>
            <p className="state">No verified attestation on-chain for {short(addr)} — any performance claim from it is <strong>unverified</strong>.</p>
            {account && account.toLowerCase() === addr.toLowerCase() && (
              <div className="vw-request">
                <div className="evidence-tag" style={{ display: "inline-block", marginBottom: 8 }}>Get your wallet proven</div>
                <p>Your wallet isn&apos;t proven yet. A Bukti score isn&apos;t self-registered — it&apos;s the output of a real proof. Self-service proving runs the full pipeline for your wallet:</p>
                <ol className="vw-steps">
                  <li>index your real Mantle swaps (Agni / FusionX) + historical Pyth prices</li>
                  <li>reconstruct cost-basis PnL &amp; risk metrics inside the SP1 zkVM</li>
                  <li>a Groth16 proof, verified on-chain → your composable, shareable attestation</li>
                </ol>
                <p className="hint">Proving takes a few minutes of compute, so this is a queued request — <strong>self-service proving is on the roadmap</strong>. The ClawHack cohort (105 wallets) is pre-proven today.</p>
                <a className="go" href="https://github.com/PugarHuda/bukti" target="_blank" rel="noreferrer" style={{ textDecoration: "none", display: "inline-block", marginTop: 4 }}>Request a proof (join the waitlist) ↗</a>
              </div>
            )}
          </div>
        )}
        {state === "error" && <p className="state err" style={{ marginTop: 16 }}>{err}</p>}

        {att && (
          <div style={{ marginTop: 18 }}>
            <div className="metrics">
              <div className="metric"><div className="k">Bukti score</div><div className={`v ${sharpe >= 0 ? "good" : "bad"}`}>{sharpe.toFixed(3)}</div></div>
              <div className="metric"><div className="k">Max drawdown</div><div className="v">{dd.toFixed(2)}%</div></div>
              <div className="metric"><div className="k">ROI</div><div className={`v ${roi >= 0 ? "good" : "bad"}`}>{roi.toFixed(2)}%</div></div>
              <div className="metric"><div className="k">Volume</div><div className="v">${vol.toLocaleString(undefined, { maximumFractionDigits: vol < 100 ? 2 : 0 })}</div></div>
            </div>
            <div style={{ marginTop: 14, display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap" }}>
              <span className="proven">✓ proven in SP1 zkVM · {att.numTrades} realized trades · read live</span>
              <a className="hint" href={`/w/${addr}`} target="_blank" rel="noreferrer">Share card ↗</a>
              <a className="hint" href={`${EXPLORER}/address/${addr}`} target="_blank" rel="noreferrer">Mantlescan ↗</a>
            </div>

            {isMine && (
              <div className="vw-control">
                <div className="evidence-tag" style={{ display: "inline-block", marginBottom: 8 }}>Prove you control this wallet</div>
                <p className="hint" style={{ marginTop: 0 }}>Bukti proves a wallet&apos;s <em>history</em> is real. Sign a Bukti challenge (EIP-191, free, off-chain) to bind this proven record to <strong>you</strong> — so the card is provably yours, not just a wallet you pointed at.</p>
                {control === "ok"
                  ? <div className="vw-bound">✓ Control proven — you signed as {short(account!)}. This proven track record is bound to you.</div>
                  : control === "fail"
                  ? <div className="state err">Signature didn&apos;t match — try again.</div>
                  : <button className="go" onClick={proveControl} disabled={control === "signing"}>{control === "signing" ? "Check your wallet…" : "Sign to prove control"}</button>}
              </div>
            )}

            <div style={{ marginTop: 18, paddingTop: 16, borderTop: "1px solid var(--line)" }}>
              <div className="hint" style={{ marginBottom: 8 }}>Embeddable badge — drop your proven track record into any README, agent profile, or site (reads live from chain):</div>
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
