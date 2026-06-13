"use client";

import { useState } from "react";
import { useBoard, short, download, printReport, Sparkline } from "../lib";
import { mantleSepolia } from "../../lib/contract";

const EXPLORER = mantleSepolia.blockExplorers.default.url;
type Filter = "all" | "proven" | "losing" | "unscored";

export default function LeaderboardPage() {
  const { board, live } = useBoard();
  const [open, setOpen] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [q, setQ] = useState("");
  const [howOpen, setHowOpen] = useState(false);

  const all = board?.rows ?? [];
  const rows = all.filter((r) => {
    if (q && !r.wallet.toLowerCase().includes(q.toLowerCase())) return false;
    if (filter === "proven") return r.score > 0;
    if (filter === "losing") return r.score < 0;
    if (filter === "unscored") return r.score === 0;
    return true;
  });
  const n = (f: Filter) => f === "proven" ? all.filter((r) => r.score > 0).length : f === "losing" ? all.filter((r) => r.score < 0).length : f === "unscored" ? all.filter((r) => r.score === 0).length : all.length;
  const CHIPS: { k: Filter; label: string }[] = [
    { k: "all", label: "All" }, { k: "proven", label: "Proven ✓" }, { k: "losing", label: "Net-losing" }, { k: "unscored", label: "Unscored" },
  ];

  return (
    <>
      <div className="ds-page-head">
        <h1 className="ds-page-title">Leaderboard</h1>
        <p className="ds-page-sub">All {all.length} ClawHack agents, ranked by zk-proven risk-adjusted score. Click a row for the reconstructed equity curve. <button className="linklike" onClick={() => setHowOpen((o) => !o)}>How ranking works {howOpen ? "▲" : "▼"}</button></p>
      </div>

      {howOpen && (
        <div className="card card-pad howbox">
          <p><strong>Score</strong> = a Sharpe-style ratio: the <em>mean</em> of the wallet&apos;s per-trade returns divided by their <em>standard deviation</em> (× 1000), computed from FIFO cost-basis <strong>realized round-trips</strong> — entirely inside the zkVM in integer math. Higher = more consistent profit relative to risk.</p>
          <p>Wallets are ranked by that proven score, descending. <strong>Score 0.000</strong> means fewer than two closed round-trips, so variance is undefined — high activity, no provable skill yet (this is most of the long tail). <strong>Negative</strong> = net-losing relative to volatility.</p>
          <p><strong>Vol rank</strong> ranks by swap count (the gameable metric). <strong>Δ</strong> = vol rank − proof rank: a big positive Δ is a quiet killer (low volume, high skill); a big negative Δ is a volume tourist. That gap <em>is</em> the gameability of volume leaderboards.</p>
        </div>
      )}

      <div className="card">
        <div className="card-head">
          <h2 className="card-title">Provable ClawHack leaderboard <span className="stamp proven" style={{ marginLeft: 8, verticalAlign: "middle" }}>Proven</span></h2>
          {board && (
            <a className="hint" href={`${EXPLORER}/tx/${board.meta.batchTx}`} target="_blank" rel="noreferrer">
              {live === "live" ? "● live" : "witness"} · 4 Groth16 proofs ↗
            </a>
          )}
        </div>

        <div className="lb-controls">
          <div className="lb-chips">
            {CHIPS.map((c) => (
              <button key={c.k} className={`lb-chip ${filter === c.k ? "on" : ""}`} onClick={() => setFilter(c.k)}>{c.label} <span className="lb-n">{n(c.k)}</span></button>
            ))}
          </div>
          <input className="lb-search" placeholder="search 0x…" value={q} onChange={(e) => setQ(e.target.value.trim())} />
        </div>

        {!board && <div className="card-pad"><span className="state">Loading…</span></div>}
        {board && (
          <table className="board">
            <thead><tr><th>#</th><th>Wallet</th><th className="num">Score</th><th className="num">ROI</th><th className="num">PnL</th><th className="num">Vol rank</th><th className="num">Δ</th></tr></thead>
            <tbody>
              {rows.length === 0 && <tr><td colSpan={7} className="state" style={{ padding: 24 }}>No wallets match.</td></tr>}
              {rows.map((r) => {
                const delta = r.volRank - r.proofRank;
                return (
                  <>
                    <tr key={r.wallet} onClick={() => setOpen(open === r.wallet ? null : r.wallet)} className={open === r.wallet ? "sel" : ""}>
                      <td>{r.proofRank}{r.proofRank === 1 ? " ★" : ""}</td>
                      <td className="mono">{short(r.wallet)}</td>
                      <td className={`num ${r.score >= 0 ? "good" : "bad"}`}>{r.score.toFixed(3)}</td>
                      <td className={`num ${r.roi >= 0 ? "good" : "bad"}`}>{r.roi.toFixed(2)}%</td>
                      <td className={`num ${r.pnl >= 0 ? "good" : "bad"}`}>${r.pnl.toFixed(2)}</td>
                      <td className="num">#{r.volRank}</td>
                      <td className={`num ${delta > 0 ? "good" : delta < 0 ? "bad" : ""}`}>{delta > 0 ? `+${delta}` : delta < 0 ? `${delta}` : "—"}</td>
                    </tr>
                    {open === r.wallet && (
                      <tr key={r.wallet + "-d"}>
                        <td colSpan={7} style={{ padding: 0 }}>
                          <div className="dwrap">
                            <div className="dhead">
                              <span><span className="mono" style={{ color: "var(--text)" }}>{short(r.wallet)}</span> <span className={`chip tier-${r.tier}`}>Tier {r.tier}</span> <span className="chip quad">{r.quadrant}</span></span>
                              <span style={{ display: "flex", gap: 8 }}>
                                <button className="ghost" onClick={(e) => { e.stopPropagation(); printReport(r, board.meta); }}>Report (PDF)</button>
                                <button className="ghost" onClick={(e) => { e.stopPropagation(); download(`bukti-${r.wallet.slice(0, 8)}.json`, { ...r, attestationContract: board.meta.attestationContract, batchTx: board.meta.batchTx }); }}>JSON</button>
                                <a className="ghost" href={`/w/${r.wallet}`} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} style={{ textDecoration: "none" }}>Share card ↗</a>
                              </span>
                            </div>
                            <Sparkline pts={r.curve} />
                            <div className="dgrid">
                              <span>Win rate: <strong>{r.winRate.toFixed(0)}%</strong></span>
                              <span>Profit factor: <strong>{r.profitFactor >= 999 ? "∞" : r.profitFactor.toFixed(2)}</strong></span>
                              <span>Sortino: <strong>{r.sortino.toFixed(2)}</strong></span>
                              <span>Calmar: <strong>{r.calmar.toFixed(2)}</strong></span>
                              <span>Max drawdown: <strong>{r.dd.toFixed(2)}%</strong></span>
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
    </>
  );
}
