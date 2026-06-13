"use client";

import { useState } from "react";
import { useBoard, short, download, Sparkline } from "../lib";
import { mantleSepolia } from "../../lib/contract";

const EXPLORER = mantleSepolia.blockExplorers.default.url;

export default function LeaderboardPage() {
  const { board, live } = useBoard();
  const [open, setOpen] = useState<string | null>(null);

  return (
    <>
      <div className="ds-page-head">
        <h1 className="ds-page-title">Leaderboard</h1>
        <p className="ds-page-sub">All 25 ClawHack agents, ranked by zk-proven risk-adjusted score. Click a row for the reconstructed equity curve.</p>
      </div>

      <div className="card">
        <div className="card-head">
          <h2 className="card-title">Provable ClawHack leaderboard</h2>
          {board && (
            <a className="hint" href={`${EXPLORER}/tx/${board.meta.batchTx}`} target="_blank" rel="noreferrer">
              {live === "live" ? "● live" : "witness"} · one Groth16 proof ↗
            </a>
          )}
        </div>
        {!board && <div className="card-pad"><span className="state">Loading…</span></div>}
        {board && (
          <table className="board">
            <thead><tr><th>#</th><th>Wallet</th><th className="num">Score</th><th className="num">ROI</th><th className="num">PnL</th><th className="num">Vol rank</th><th className="num">Δ</th></tr></thead>
            <tbody>
              {board.rows.map((r) => {
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
                                <button className="ghost" onClick={(e) => { e.stopPropagation(); download(`bukti-${r.wallet.slice(0, 8)}.json`, { ...r, attestationContract: board.meta.attestationContract, batchTx: board.meta.batchTx }); }}>Download report</button>
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
