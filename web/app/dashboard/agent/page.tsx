"use client";

import { useState } from "react";
import { fetchAttestation } from "../../lib/contract";
import { useBoard, short } from "../lib";

export default function AgentPage() {
  const { board } = useBoard();
  const [copilot, setCopilot] = useState<{ q: string; a: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const volChamp = board ? [...board.rows].sort((a, b) => b.clawhackSwaps - a.clawhackSwaps)[0] : null;

  const [gateAddr, setGateAddr] = useState("");
  const [gateRes, setGateRes] = useState<{ status: number; body: unknown } | null>(null);
  async function hitGate(addr: string) {
    setGateRes(null);
    setGateAddr(addr);
    try {
      const r = await fetch(`/api/gate/${addr}`);
      setGateRes({ status: r.status, body: await r.json() });
    } catch {
      setGateRes({ status: 0, body: { error: "request failed" } });
    }
  }

  async function ask(wallet: string, label: string) {
    setBusy(true);
    setCopilot({ q: `Should I copy-trade ${label} (${short(wallet)})?`, a: "checking the proof layer on Mantle…" });
    try {
      const a = await fetchAttestation(wallet as `0x${string}`);
      const row = board?.rows.find((r) => r.wallet.toLowerCase() === wallet.toLowerCase());
      if (!a.exists) {
        setCopilot({ q: `Should I copy-trade ${label} (${short(wallet)})?`, a: `No verified attestation exists on-chain for this wallet. Any performance claims are UNVERIFIED — I would not allocate capital.` });
      } else {
        const sc = Number(a.sharpeMilli) / 1000;
        const clears = sc >= 0.5;
        const alt = board?.rows[0];
        setCopilot({
          q: `Should I copy-trade ${label} (${short(wallet)})?`,
          a: clears
            ? `Yes — its zk-PROVEN score is ${sc.toFixed(3)} (ROI ${(Number(a.roiBps) / 100).toFixed(2)}%, max drawdown ${(a.maxDrawdownBps / 100).toFixed(2)}%) over ${a.numTrades} realized trades, read live from the attestation contract. It clears the 0.5 capital gate${row ? ` and sits at proof-rank #${row.proofRank}` : ""}.`
            : `No. ${row ? `Despite ${row.clawhackSwaps} swaps in ClawHack (volume rank #${row.volRank}), ` : ""}its zk-PROVEN score is ${sc.toFixed(3)} — below the 0.5 capital gate; the vault would revert SharpeBelowThreshold. Volume isn't performance.${alt && alt.wallet.toLowerCase() !== wallet.toLowerCase() ? ` The proven top performer is ${short(alt.wallet)} (score ${alt.score.toFixed(3)}), already vault-approved.` : ""}`,
        });
      }
    } catch {
      setCopilot({ q: `Should I copy-trade ${short(wallet)}?`, a: "RPC hiccup — try again." });
    }
    setBusy(false);
  }

  return (
    <>
      <div className="ds-page-head">
        <h1 className="ds-page-title">Agent copilot</h1>
        <p className="ds-page-sub">Bukti ships an MCP server so any AI agent checks proof, not promises, before allocating capital. These two flows read the chain live.</p>
      </div>

      <div className="card card-pad">
        <div className="copilot-btns">
          <button className="ghost" disabled={busy || !board} onClick={() => volChamp && ask(volChamp.wallet, "the ClawHack volume champion")}>
            Ask: copy the volume champion{volChamp ? ` (${volChamp.clawhackSwaps} swaps)` : ""}?
          </button>
          <button className="ghost" disabled={busy || !board} onClick={() => board && ask(board.rows[0].wallet, "the proven top performer")}>
            Ask: copy the proof champion?
          </button>
        </div>
        {copilot && (
          <div className="chat">
            <div className="bubble user">{copilot.q}</div>
            <div className="bubble agent">{copilot.a}</div>
          </div>
        )}
      </div>

      <div className="card card-pad">
        <h2 className="card-title" style={{ marginBottom: 8 }}>Proof-gated endpoint (x402-style)</h2>
        <p className="hint" style={{ marginTop: 0 }}>
          Bukti is infrastructure: any paid endpoint or agent action can gate itself on a <strong>proven</strong> score. This API returns HTTP <code>402 Proof Required</code> unless the wallet clears the 0.5 gate — try a proven wallet vs. an unproven one.
        </p>
        <div className="copilot-btns" style={{ flexDirection: "row", flexWrap: "wrap" }}>
          <button className="ghost" disabled={!board} onClick={() => board && hitGate(board.rows[0].wallet)}>Call gate with the proof champion</button>
          <button className="ghost" onClick={() => hitGate("0x000000000000000000000000000000000000dEaD")}>Call gate with an unproven wallet</button>
        </div>
        {gateRes && (
          <div style={{ marginTop: 12 }}>
            <div className={`cheat-verdict ${gateRes.status === 200 ? "real" : "fake"}`} style={{ marginBottom: 8 }}>
              HTTP {gateRes.status} {gateRes.status === 200 ? "· UNLOCKED" : gateRes.status === 402 ? "· PROOF REQUIRED" : ""}
            </div>
            <code className="snippet">{JSON.stringify(gateRes.body, null, 2)}</code>
          </div>
        )}
      </div>

      <div className="card card-pad">
        <p className="hint" style={{ margin: 0 }}>
          The same logic ships as 5 MCP tools — <code>bukti_get_verified_score</code>, <code>bukti_check_vault_eligibility</code>, <code>bukti_leaderboard</code>, <code>bukti_compare_wallets</code>, <code>bukti_proof_info</code> — plus Telegram &amp; Discord bots.{" "}
          <a href="https://github.com/PugarHuda/bukti/blob/main/docs/MCP.md" target="_blank" rel="noreferrer">Setup for Claude ↗</a>
        </p>
      </div>
    </>
  );
}
