"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  fetchAttestation,
  fetchLeaderboard,
  ATTESTATION_ADDRESS,
  VERIFIER_ADDRESS,
  VERIFIER_VERSION,
  mantleSepolia,
  type Attestation,
} from "../lib/contract";

const EXPLORER = mantleSepolia.blockExplorers.default.url;
const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

interface BoardRow {
  wallet: string; clawhackSwaps: number; legs: number;
  trades: { ts: number; pnl: number; notional: number }[];
  score: number; dd: number; roi: number; vol: number; pnl: number; curve: number[];
  volRank: number; proofRank: number; tier: string; quadrant: string;
  winRate: number; profitFactor: number; sortino: number; calmar: number;
  avgWin: number; avgLoss: number; bestStreak: number; worstStreak: number;
}
interface CohortStats {
  profitable: number; unprofitable: number; totalVolumeUsd: number; totalRealizedPnlUsd: number;
  pctVolumeFromLosers: number; avgRankGap: number; volumeScoreAgreementPct: number; medianScore: number;
}
interface BoardData {
  meta: {
    window: string; walletsScanned: number; walletsProven: number; totalLegs: number;
    proofBytes: number; batchTx: string; attestationContract?: string; verifier?: string;
    chain?: string; cohort?: CohortStats;
  };
  rows: BoardRow[];
}

function download(name: string, obj: unknown) {
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = name; a.click();
  URL.revokeObjectURL(url);
}

function Sparkline({ pts }: { pts: number[] }) {
  if (pts.length < 2) return null;
  const w = 560, h = 96, pad = 6;
  const min = Math.min(...pts), max = Math.max(...pts);
  const span = max - min || 1;
  const x = (i: number) => pad + (i * (w - 2 * pad)) / (pts.length - 1);
  const y = (v: number) => h - pad - ((v - min) * (h - 2 * pad)) / span;
  const d = pts.map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const up = pts[pts.length - 1] >= 0;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="spark">
      {min < 0 && max > 0 && <line x1={pad} x2={w - pad} y1={y(0)} y2={y(0)} className="zero" />}
      <path d={d} className={up ? "line good-s" : "line bad-s"} />
    </svg>
  );
}

export default function Dashboard() {
  const [addr, setAddr] = useState("");
  const [att, setAtt] = useState<Attestation | null>(null);
  const [state, setState] = useState<"idle" | "loading" | "empty" | "error">("idle");
  const [err, setErr] = useState("");
  const [board, setBoard] = useState<BoardData | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [liveOk, setLiveOk] = useState<"checking" | "live" | "cache">("checking");
  const [copilot, setCopilot] = useState<{ q: string; a: string } | null>(null);
  const [copilotBusy, setCopilotBusy] = useState(false);

  useEffect(() => {
    fetch("/board-data.json").then((r) => r.json()).then(setBoard).catch(() => {});
    fetchLeaderboard().then((rows) => setLiveOk(rows.length >= 25 ? "live" : "cache")).catch(() => setLiveOk("cache"));
  }, []);

  async function askCopilot(wallet: string, label: string) {
    setCopilotBusy(true);
    setCopilot({ q: `Should I copy-trade ${label} (${short(wallet)})?`, a: "…checking the proof layer on Mantle…" });
    try {
      const a = await fetchAttestation(wallet as `0x${string}`);
      const row = board?.rows.find((r) => r.wallet.toLowerCase() === wallet.toLowerCase());
      if (!a.exists) {
        setCopilot({ q: `Should I copy-trade ${label} (${short(wallet)})?`, a: `No verified attestation exists on-chain for this wallet. Any performance claims from it are UNVERIFIED — I would not allocate capital.` });
      } else {
        const sc = Number(a.sharpeMilli) / 1000;
        const clears = sc >= 0.5;
        const alt = board?.rows[0];
        setCopilot({
          q: `Should I copy-trade ${label} (${short(wallet)})?`,
          a: clears
            ? `Yes — its zk-PROVEN score is ${sc.toFixed(3)} (ROI ${(Number(a.roiBps) / 100).toFixed(2)}%, max drawdown ${(a.maxDrawdownBps / 100).toFixed(2)}%) over ${a.numTrades} realized trades, read live from the attestation contract. It clears the 0.5 capital gate${row ? ` and sits at proof-rank #${row.proofRank}` : ""}.`
            : `No. ${row ? `Despite ${row.clawhackSwaps} swaps in ClawHack (volume rank #${row.volRank}), ` : ""}its zk-PROVEN score is ${sc.toFixed(3)} — below the 0.5 capital gate; the vault contract would revert SharpeBelowThreshold. Volume isn't performance.${alt && alt.wallet.toLowerCase() !== wallet.toLowerCase() ? ` The proven top performer is ${short(alt.wallet)} (score ${alt.score.toFixed(3)}), already vault-approved on-chain.` : ""}`,
        });
      }
    } catch {
      setCopilot({ q: `Should I copy-trade ${short(wallet)}?`, a: "RPC hiccup — try again." });
    }
    setCopilotBusy(false);
  }

  async function verify(target?: string) {
    const a0 = (target ?? addr).trim();
    if (!/^0x[0-9a-fA-F]{40}$/.test(a0)) { setErr("Enter a valid 0x… address"); setState("error"); return; }
    if (target) setAddr(target);
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
  const meta = board?.meta;
  const cohort = board?.meta.cohort;
  const volChamp = board ? [...board.rows].sort((a, b) => b.clawhackSwaps - a.clawhackSwaps)[0] : null;

  const KPIS = meta ? [
    { v: meta.walletsScanned, k: "wallets scanned" },
    { v: meta.walletsProven, k: "proven on-chain" },
    { v: meta.totalLegs, k: "raw swap legs" },
    { v: "1", k: "Groth16 proof" },
    { v: `${meta.proofBytes}B`, k: "proof size" },
    { v: "$0", k: "proving cost" },
  ] : [];

  return (
    <div className="dash-shell">
      <aside className="dash-sidebar">
        <Link href="/" className="ds-brand">Bukti<span className="zk">zk</span></Link>
        <div className="ds-nav">
          <a href="#overview">▦ Overview</a>
          <a href="#leaderboard">🏆 Leaderboard</a>
          <a href="#verify">🔎 Verify wallet</a>
          <a href="#copilot">🤖 Agent copilot</a>
          <a href="#proof">🔗 Proof layer</a>
        </div>
        <div className="ds-foot">
          <span className={`ds-live ${liveOk}`}>
            <span className="dot" /> {liveOk === "live" ? "live on Mantle" : liveOk === "cache" ? "witness cache" : "connecting…"}
          </span>
          <a href="https://github.com/PugarHuda/bukti" target="_blank" rel="noreferrer">GitHub ↗</a>
          <Link href="/">← Home</Link>
        </div>
      </aside>

      <main className="dash-main">
        <header className="dm-head" id="overview">
          <div>
            <h1>Provable ClawHack Leaderboard</h1>
            <p>25 AI agents re-ranked by zk-proven score — read live from Mantle.</p>
          </div>
          <div className="dm-search">
            <input
              type="text" placeholder="0x… verify any wallet" value={addr}
              onChange={(e) => setAddr(e.target.value.trim())}
              onKeyDown={(e) => e.key === "Enter" && verify()}
            />
            <button onClick={() => verify()} disabled={state === "loading"}>
              {state === "loading" ? "…" : "Verify"}
            </button>
          </div>
        </header>

        <section className="kpis">
          {KPIS.map((s) => (
            <div className="kpi" key={s.k}><div className="kpi-v">{s.v}</div><div className="kpi-k">{s.k}</div></div>
          ))}
        </section>

        {att && (
          <div className="panel" id="verify">
            <div className="panel-head"><h2>Verified: {short(addr)}</h2><span className="proven">✓ zk-proven · {att.numTrades} trades · live</span></div>
            <div className="metrics">
              <div className="metric"><div className="k">Bukti Score</div><div className={`v ${sharpe >= 0 ? "good" : "bad"}`}>{sharpe.toFixed(3)}</div></div>
              <div className="metric"><div className="k">Max Drawdown</div><div className="v">{dd.toFixed(2)}%</div></div>
              <div className="metric"><div className="k">ROI</div><div className={`v ${roi >= 0 ? "good" : "bad"}`}>{roi.toFixed(2)}%</div></div>
              <div className="metric"><div className="k">Volume</div><div className="v">${vol.toLocaleString(undefined, { maximumFractionDigits: 0 })}</div></div>
            </div>
          </div>
        )}
        {state === "empty" && <div className="panel" id="verify"><p className="state">No verified attestation for {short(addr)} yet.</p></div>}
        {state === "error" && <div className="panel" id="verify"><p className="state err">{err}</p></div>}

        <div className="dm-grid">
          <div className="dm-col-main">
            <div className="panel" id="leaderboard">
              <div className="panel-head">
                <h2>Leaderboard</h2>
                {liveOk === "live" ? <span className="badge live">● live</span> : <span className="badge">witness</span>}
              </div>
              {volChamp && board && (
                <div className="insight slim">
                  💡 <strong>Volume crowns the wrong winners.</strong> The volume champion ({short(volChamp.wallet)}, {volChamp.clawhackSwaps} swaps) ranks only <strong>#{volChamp.proofRank}</strong> by proven score.
                </div>
              )}
              {!board && <p className="state">Loading…</p>}
              {board && (
                <table className="board">
                  <thead><tr><th>#</th><th>Wallet</th><th>Score</th><th>ROI</th><th>PnL</th><th>Vol</th><th>Δ</th></tr></thead>
                  <tbody>
                    {board.rows.map((r) => {
                      const delta = r.volRank - r.proofRank;
                      return (
                        <>
                          <tr key={r.wallet} onClick={() => setOpen(open === r.wallet ? null : r.wallet)} style={{ cursor: "pointer" }} className={open === r.wallet ? "sel" : ""}>
                            <td>{r.proofRank}{r.proofRank === 1 ? " 👑" : ""}</td>
                            <td className="mono">{short(r.wallet)}</td>
                            <td className={r.score >= 0 ? "good" : "bad"}>{r.score.toFixed(3)}</td>
                            <td className={r.roi >= 0 ? "good" : "bad"}>{r.roi.toFixed(2)}%</td>
                            <td className={r.pnl >= 0 ? "good" : "bad"}>${r.pnl.toFixed(2)}</td>
                            <td>#{r.volRank}</td>
                            <td className={delta > 0 ? "good" : delta < 0 ? "bad" : ""}>{delta > 0 ? `▲${delta}` : delta < 0 ? `▼${-delta}` : "—"}</td>
                          </tr>
                          {open === r.wallet && (
                            <tr className="detail" key={r.wallet + "-d"}>
                              <td colSpan={7}>
                                <div className="dwrap">
                                  <div className="dhead">
                                    <span><span className="mono">{short(r.wallet)}</span> <span className={`chip tier-${r.tier}`}>Tier {r.tier}</span> <span className="chip quad">{r.quadrant}</span></span>
                                    <span style={{ display: "flex", gap: 8 }}>
                                      <button className="ghost" onClick={(e) => { e.stopPropagation(); download(`bukti-${r.wallet.slice(0, 8)}.json`, { ...r, attestationContract: board?.meta.attestationContract, batchTx: board?.meta.batchTx }); }}>⭳ Report</button>
                                      <a className="ghost" href={`/w/${r.wallet}`} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} style={{ textDecoration: "none", display: "inline-flex", alignItems: "center" }}>↗ Share</a>
                                      <button className="ghost" onClick={(e) => { e.stopPropagation(); verify(r.wallet); }}>Read on-chain →</button>
                                    </span>
                                  </div>
                                  <Sparkline pts={r.curve} />
                                  <div className="dgrid">
                                    <span>Win rate: <strong>{r.winRate.toFixed(0)}%</strong></span>
                                    <span>Profit factor: <strong>{r.profitFactor >= 999 ? "∞" : r.profitFactor.toFixed(2)}</strong></span>
                                    <span>Sortino: <strong>{r.sortino.toFixed(2)}</strong></span>
                                    <span>Calmar: <strong>{r.calmar.toFixed(2)}</strong></span>
                                    <span>Max DD: <strong>{r.dd.toFixed(2)}%</strong></span>
                                    <span>Streak: <strong>{r.bestStreak}W / {r.worstStreak}L</strong></span>
                                    <span>ClawHack swaps: <strong>{r.clawhackSwaps}</strong></span>
                                    <span>Volume: <strong>${r.vol.toFixed(2)}</strong></span>
                                  </div>
                                </div>
                              </td>
                            </tr>
                          )}
                        </>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          <div className="dm-col-side">
            {cohort && (
              <div className="panel">
                <div className="panel-head"><h2>Cohort X-ray</h2></div>
                <div className="xray2">
                  <div className="xstat"><div className="xv bad">{cohort.volumeScoreAgreementPct}%</div><div className="xk">volume ↔ proven-skill agreement (coin-flip)</div></div>
                  <div className="xstat"><div className="xv">{cohort.avgRankGap}</div><div className="xk">avg vol-vs-proof rank gap (of 25)</div></div>
                  <div className="xstat"><div className="xv bad">{cohort.pctVolumeFromLosers}%</div><div className="xk">cohort volume from net-losing wallets</div></div>
                  <div className="xstat"><div className="xv"><span className="good">{cohort.profitable}</span>/<span className="bad">{cohort.unprofitable}</span></div><div className="xk">profitable vs unprofitable</div></div>
                </div>
                {board && (
                  <a className="dl-link" onClick={() => download("bukti-clawhack-cohort-report.json", { meta: board.meta, rows: board.rows })}>⭳ Download full verified report (JSON)</a>
                )}
              </div>
            )}

            <div className="panel" id="copilot">
              <div className="panel-head"><h2>🤖 Agent copilot</h2></div>
              <p className="hint" style={{ marginTop: 0 }}>Any AI agent checks <strong>proof, not promises</strong> via bukti-mcp. Try its two flows (live chain):</p>
              <div className="copilot-btns">
                <button className="ghost" disabled={copilotBusy || !board} onClick={() => volChamp && askCopilot(volChamp.wallet, "the volume champion")}>Copy the volume champion?</button>
                <button className="ghost" disabled={copilotBusy || !board} onClick={() => board && askCopilot(board.rows[0].wallet, "the proven top performer")}>Copy the proof champion?</button>
              </div>
              {copilot && (
                <div className="chat">
                  <div className="bubble user">{copilot.q}</div>
                  <div className="bubble agent">{copilot.a}</div>
                </div>
              )}
            </div>

            <div className="panel" id="proof">
              <div className="panel-head"><h2>🔗 Proof layer</h2></div>
              <div className="meta" style={{ marginTop: 0 }}>
                Attestation: <a href={`${EXPLORER}/address/${ATTESTATION_ADDRESS}#code`} target="_blank" rel="noreferrer">{short(ATTESTATION_ADDRESS)} ↗</a><br />
                Verifier: <a href={`${EXPLORER}/address/${VERIFIER_ADDRESS}#code`} target="_blank" rel="noreferrer">{short(VERIFIER_ADDRESS)} ↗</a> — <strong>{VERIFIER_VERSION}</strong><br />
                Batch proof: <a href={`${EXPLORER}/tx/${meta?.batchTx ?? ""}`} target="_blank" rel="noreferrer">one Groth16 tx ↗</a>
                <code className="snippet">cast call {short(ATTESTATION_ADDRESS)} &quot;getSharpeMilli(address)(int64,bool)&quot; &lt;wallet&gt;</code>
              </div>
            </div>
          </div>
        </div>

        <footer className="dm-footer">
          Built on Mantle for The Turing Test Hackathon 2026 · numbers reconstructed in an SP1 zkVM, attested on-chain.
        </footer>
      </main>
    </div>
  );
}
