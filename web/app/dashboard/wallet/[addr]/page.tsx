"use client";

import { use } from "react";
import Link from "next/link";
import { useBoard, short, Sparkline, printReport, download, CopyAddr } from "../../lib";
import { mantleSepolia } from "../../../lib/contract";

const EXPLORER = mantleSepolia.blockExplorers.default.url;

export default function WalletDetail({ params }: { params: Promise<{ addr: string }> }) {
  const { addr } = use(params);
  const { board } = useBoard();
  const r = board?.rows.find((x) => x.wallet.toLowerCase() === addr.toLowerCase());

  return (
    <>
      <div className="ds-page-head">
        <h1 className="ds-page-title">Wallet detail</h1>
        <p className="ds-page-sub">The full zk-proven breakdown for one cohort wallet — reconstructed from raw Mantle swaps, attested on-chain. <Link href="/dashboard/leaderboard" className="linklike">← Back to leaderboard</Link></p>
      </div>

      {!board && <div className="card card-pad"><span className="state">Loading…</span></div>}

      {board && !r && (
        <div className="card card-pad">
          <p className="state">{addr.length === 42 ? <>This address isn&apos;t in the 105-wallet ClawHack cohort. Verify any wallet&apos;s on-chain attestation on the <Link href="/dashboard/verify" className="linklike">Verify</Link> page, or open its <a className="linklike" href={`/w/${addr}`} target="_blank" rel="noreferrer">share card</a>.</> : "Invalid address."}</p>
        </div>
      )}

      {board && r && (
        <>
          <div className="card card-pad wd-top">
            <div className="wd-id">
              <CopyAddr addr={r.wallet} />
              <span className={`chip tier-${r.tier}`}>Tier {r.tier}</span>
              <span className="chip quad">{r.quadrant}</span>
              {r.proofRank === 1 && <span className="stamp proven">★ Proof champion</span>}
            </div>
            <div className="wd-hero">
              <div className="wd-k">Proven score · risk-adjusted (Sharpe-style)</div>
              <div className={`wd-v ${r.score >= 0 ? "good" : "bad"}`}>{r.score.toFixed(3)}</div>
              <div className="wd-rank">#{r.proofRank} by proof · #{r.volRank} by volume <span className={r.volRank - r.proofRank > 0 ? "good" : r.volRank - r.proofRank < 0 ? "bad" : ""}>({r.volRank - r.proofRank > 0 ? "+" : ""}{r.volRank - r.proofRank} Δ)</span></div>
            </div>
          </div>

          <div className="card" style={{ marginTop: 12 }}>
            <div className="card-head"><h2 className="card-title">Equity curve (cumulative realized PnL)</h2><span className="badge">{r.trades.length} trades</span></div>
            <div className="card-pad"><Sparkline pts={r.curve} /></div>
          </div>

          <div className="card card-pad" style={{ marginTop: 12 }}>
            <div className="metrics">
              <div className="metric"><div className="k">ROI</div><div className={`v ${r.roi >= 0 ? "good" : "bad"}`}>{r.roi.toFixed(2)}%</div></div>
              <div className="metric"><div className="k">Realized PnL</div><div className={`v ${r.pnl >= 0 ? "good" : "bad"}`}>${r.pnl.toFixed(2)}</div></div>
              <div className="metric"><div className="k">Max drawdown</div><div className="v">{r.dd.toFixed(2)}%</div></div>
              <div className="metric"><div className="k">Volume</div><div className="v">${r.vol.toLocaleString(undefined, { maximumFractionDigits: r.vol < 100 ? 2 : 0 })}</div></div>
            </div>
            <div className="dgrid" style={{ marginTop: 14 }}>
              <span>Win rate: <strong>{r.winRate.toFixed(0)}%</strong></span>
              <span>Profit factor: <strong>{r.profitFactor >= 999 ? "∞" : r.profitFactor.toFixed(2)}</strong></span>
              <span>Sortino: <strong>{r.sortino.toFixed(2)}</strong></span>
              <span>Calmar: <strong>{r.calmar.toFixed(2)}</strong></span>
              <span>Best / worst streak: <strong>{r.bestStreak}W / {r.worstStreak}L</strong></span>
              <span>Realized trades: <strong>{r.trades.length}</strong></span>
              <span>ClawHack swaps: <strong>{r.clawhackSwaps}</strong></span>
              <span>Legs in proof: <strong>{r.legs}</strong></span>
            </div>
            <div className="wd-actions">
              <button className="ghost" onClick={() => printReport(r, board.meta)}>Report (PDF)</button>
              <button className="ghost" onClick={() => download(`bukti-${r.wallet.slice(0, 8)}.json`, { ...r, attestationContract: board.meta.attestationContract, batchTx: board.meta.batchTx })}>JSON</button>
              <a className="ghost" href={`/w/${r.wallet}`} target="_blank" rel="noreferrer" style={{ textDecoration: "none" }}>Share card ↗</a>
              <a className="ghost" href={`/dashboard/verify`} style={{ textDecoration: "none" }}>Verify live ↗</a>
              <a className="ghost" href={`${EXPLORER}/address/${r.wallet}`} target="_blank" rel="noreferrer" style={{ textDecoration: "none" }}>Mantlescan ↗</a>
            </div>
          </div>
        </>
      )}
    </>
  );
}
