"use client";

import Link from "next/link";
import { useBoard, short, VolumeVsProof, CopyAddr, ScoreHistogram } from "./lib";

export default function Overview() {
  const { board, live } = useBoard();
  const meta = board?.meta;
  const cohort = meta?.cohort;
  const volChamp = board ? [...board.rows].sort((a, b) => b.clawhackSwaps - a.clawhackSwaps)[0] : null;
  const top = board?.rows.slice(0, 5) ?? [];

  const KPIS = meta ? [
    { v: meta.walletsScanned, k: "scanned" },
    { v: meta.walletsProven, k: "proven" },
    { v: meta.totalLegs, k: "swap legs" },
    { v: "4", k: "Groth16 proofs" },
    { v: `${meta.proofBytes}B`, k: "proof size" },
    { v: "$0", k: "proving cost" },
  ] : [];

  return (
    <>
      <div className="ds-page-head">
        <h1 className="ds-page-title">Overview</h1>
        <p className="ds-page-sub">The Provable ClawHack cohort — 105 agents across 49 Agni + FusionX pools, re-ranked by zk-proven score, attested on Mantle.</p>
      </div>

      {meta && (
        <div className="kpi-row">
          {KPIS.map((s) => <div className="kpi" key={s.k}><div className="kpi-v">{s.v}</div><div className="kpi-k">{s.k}</div></div>)}
        </div>
      )}

      {volChamp && board && (
        <div className="insight" style={{ marginBottom: 18 }}>
          <strong>Volume crowns the wrong winners.</strong> The volume champion ({short(volChamp.wallet)}, {volChamp.clawhackSwaps} swaps) ranks #{volChamp.proofRank} by proven score; the proof champion ({short(board.rows[0].wallet)}, {board.rows[0].score.toFixed(2)}) sits at volume rank #{board.rows[0].volRank}.
        </div>
      )}

      <div className="card">
        <div className="card-head">
          <h2 className="card-title">Top proven traders</h2>
          {live === "live" ? <span className="badge live">live</span> : <span className="badge">witness</span>}
        </div>
        <table className="board">
          <thead><tr><th>#</th><th>Wallet</th><th className="num">Score</th><th className="num">ROI</th><th className="num">Vol rank</th></tr></thead>
          <tbody>
            {top.map((r) => (
              <tr key={r.wallet}>
                <td>{r.proofRank}</td>
                <td><CopyAddr addr={r.wallet} /></td>
                <td className={`num ${r.score >= 0 ? "good" : "bad"}`}>{r.score.toFixed(3)}</td>
                <td className={`num ${r.roi >= 0 ? "good" : "bad"}`}>{r.roi.toFixed(2)}%</td>
                <td className="num">#{r.volRank}</td>
              </tr>
            ))}
            {!board && <tr><td colSpan={5}><span className="state">Loading…</span></td></tr>}
          </tbody>
        </table>
        <div className="card-pad" style={{ paddingTop: 14, borderTop: "1px solid var(--line)" }}>
          <Link href="/dashboard/leaderboard" className="ghost">View full leaderboard →</Link>
        </div>
      </div>

      {board && board.rows.length > 0 && (
        <div className="card" style={{ marginTop: 4, marginBottom: 16 }}>
          <div className="card-head"><h2 className="card-title">Volume vs proven skill</h2><span className="badge">data</span></div>
          <div className="card-pad" style={{ display: "flex", gap: 20, alignItems: "center", flexWrap: "wrap" }}>
            <VolumeVsProof rows={board.rows} />
            <p className="hint" style={{ flex: 1, minWidth: 200 }}>
              Each dot is an agent: <strong>volume rank</strong> (x) vs <strong>proven-score rank</strong> (y). If volume predicted skill, every dot would sit on the dashed line. It doesn&apos;t — the scatter <em>is</em> the gameability of volume-based leaderboards. Green = profitable, red = net-losing (all proven on-chain).
            </p>
          </div>
        </div>
      )}

      {board && board.rows.length > 0 && (
        <div className="card" style={{ marginTop: 4, marginBottom: 16 }}>
          <div className="card-head"><h2 className="card-title">Proven-score distribution</h2><span className="badge">{board.rows.length} agents</span></div>
          <div className="card-pad" style={{ display: "flex", gap: 22, alignItems: "center", flexWrap: "wrap" }}>
            <ScoreHistogram rows={board.rows} />
            <p className="hint" style={{ flex: 1, minWidth: 220 }}>
              The cohort&apos;s shape in one view: a big spike at <strong>0</strong> — wallets with fewer than two closed round-trips, so no provable skill yet — flanked by a thin <span className="good">green</span> tail of genuinely skilled traders and a heavier <span className="bad">red</span> tail of net-losers. <strong>Proof separates signal from noise.</strong>
            </p>
          </div>
        </div>
      )}

      {cohort && (
        <div className="xray" style={{ marginTop: 4 }}>
          <div className="xstat"><div className="xv bad">{cohort.volumeScoreAgreementPct}%</div><div className="xk">volume ↔ proven-skill agreement</div></div>
          <div className="xstat"><div className="xv">{cohort.avgRankGap}</div><div className="xk">avg vol-vs-proof rank gap</div></div>
          <div className="xstat"><div className="xv bad">{cohort.pctVolumeFromLosers}%</div><div className="xk">volume from net-losing wallets</div></div>
          <div className="xstat"><div className="xv"><span className="good">{cohort.profitable}</span> / <span className="bad">{cohort.unprofitable}</span></div><div className="xk">profitable vs unprofitable</div></div>
        </div>
      )}
    </>
  );
}
