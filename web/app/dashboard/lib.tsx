"use client";

import { useEffect, useState } from "react";
import { fetchLeaderboard } from "../lib/contract";

export const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

/** Click-to-copy wallet address — copies the FULL address, shows a transient ✓.
 *  stopPropagation so it never triggers a parent row's expand handler. */
export function CopyAddr({ addr }: { addr: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      className={`copyaddr ${copied ? "copied" : ""}`}
      title={copied ? "Copied!" : `Copy ${addr}`}
      onClick={(e) => {
        e.stopPropagation();
        navigator.clipboard?.writeText(addr);
        setCopied(true);
        setTimeout(() => setCopied(false), 1100);
      }}
    >
      <span className="mono">{short(addr)}</span>
      <span className="copyaddr-ic">{copied ? "✓" : "⧉"}</span>
    </button>
  );
}

export interface BoardRow {
  wallet: string; clawhackSwaps: number; legs: number;
  trades: { ts: number; pnl: number; notional: number }[];
  score: number; dd: number; roi: number; vol: number; pnl: number; curve: number[];
  volRank: number; proofRank: number; tier: string; quadrant: string;
  winRate: number; profitFactor: number; sortino: number; calmar: number;
  avgWin: number; avgLoss: number; bestStreak: number; worstStreak: number;
}
export interface CohortStats {
  profitable: number; unprofitable: number; totalVolumeUsd: number; totalRealizedPnlUsd: number;
  pctVolumeFromLosers: number; avgRankGap: number; volumeScoreAgreementPct: number; medianScore: number;
}
export interface BoardData {
  meta: {
    window: string; walletsScanned: number; walletsProven: number; totalLegs: number;
    proofBytes: number; batchTx: string; attestationContract?: string; verifier?: string;
    chain?: string; cohort?: CohortStats;
  };
  rows: BoardRow[];
}

/** Shared loader: board witness data + a live/cache badge from chain events. */
export function useBoard() {
  const [board, setBoard] = useState<BoardData | null>(null);
  const [live, setLive] = useState<"checking" | "live" | "cache">("checking");
  useEffect(() => {
    fetch("/board-data.json").then((r) => r.json()).then(setBoard).catch(() => {});
    fetchLeaderboard().then((rows) => setLive(rows.length >= 25 ? "live" : "cache")).catch(() => setLive("cache"));
  }, []);
  return { board, live };
}

export function download(name: string, obj: unknown) {
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = name; a.click();
  URL.revokeObjectURL(url);
}

/** Print-to-PDF report for one wallet — opens a styled window and triggers the browser's
 *  Save-as-PDF. No dependency; the report mirrors the on-chain attestation. */
export function printReport(r: any, meta: any) {
  const g = (v: number) => (v >= 0 ? "#0e9f6e" : "#dc2626");
  const row = (k: string, v: string, c?: string) => `<tr><td>${k}</td><td style="text-align:right;font-family:monospace${c ? `;color:${c}` : ""}">${v}</td></tr>`;
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Bukti report ${r.wallet.slice(0, 10)}</title>
  <style>
    @page { margin: 22mm; }
    * { box-sizing: border-box; }
    body { font-family: -apple-system, "Segoe UI", Roboto, sans-serif; color: #14181d; margin: 0; }
    .stamp { float: right; border: 2px solid #0e9f6e; color: #0e9f6e; border-radius: 7px; padding: 8px 13px; transform: rotate(6deg); font: 600 12px/1.3 monospace; text-transform: uppercase; letter-spacing: .12em; text-align: center; }
    h1 { font-size: 22px; margin: 0 0 2px; letter-spacing: -.5px; }
    .sub { color: #5d6470; font-size: 12px; margin-bottom: 22px; }
    .addr { font-family: monospace; font-size: 13px; background: #f5f6f8; padding: 6px 10px; border-radius: 6px; display: inline-block; margin-bottom: 20px; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    td { padding: 8px 4px; border-bottom: 1px solid #e7e9ec; }
    td:first-child { color: #5d6470; }
    .big { font-size: 40px; font-weight: 700; letter-spacing: -1px; color: ${g(r.score)}; }
    .note { margin-top: 22px; font-size: 11px; color: #5d6470; line-height: 1.6; border-top: 1px solid #e7e9ec; padding-top: 14px; }
    .note code { background: #f5f6f8; padding: 1px 5px; border-radius: 3px; }
  </style></head><body>
    <div class="stamp">Proven<br/>✓ on-chain</div>
    <h1>Bukti — zk-proven track record</h1>
    <div class="sub">Reconstructed from raw Mantle swaps inside an SP1 zkVM · attested on Mantle Sepolia</div>
    <div class="addr">${r.wallet}</div>
    <div class="big">${r.score.toFixed(3)}</div>
    <div class="sub">risk-adjusted (Sharpe-style) score · tier ${r.tier ?? "—"} · ${r.quadrant ?? ""}</div>
    <table>
      ${row("ROI", `${r.roi.toFixed(2)}%`, g(r.roi))}
      ${row("Realized PnL", `$${r.pnl.toFixed(2)}`, g(r.pnl))}
      ${row("Max drawdown", `${(r.dd ?? 0).toFixed(2)}%`)}
      ${row("Win rate", `${(r.winRate ?? 0).toFixed(0)}%`)}
      ${row("Profit factor", r.profitFactor >= 999 ? "∞" : (r.profitFactor ?? 0).toFixed(2))}
      ${row("Sortino", (r.sortino ?? 0).toFixed(2))}
      ${row("Calmar", (r.calmar ?? 0).toFixed(2))}
      ${row("ClawHack swaps", String(r.clawhackSwaps ?? r.legs ?? "—"))}
      ${row("Volume (USD)", `$${(r.vol ?? 0).toFixed(2)}`)}
      ${row("Proof rank", `#${r.proofRank}`)}
      ${row("Volume rank", `#${r.volRank}`)}
    </table>
    <div class="note">
      <strong>Verify this report yourself.</strong> Every number above is the output of a Groth16 proof
      verified on-chain by the real SP1 verifier — not self-reported.<br/>
      Attestation contract: <code>${meta?.attestationContract ?? ""}</code><br/>
      Read it live: <code>cast call ${meta?.attestationContract ?? ""} "getSharpeMilli(address)(int64,bool)" ${r.wallet}</code><br/>
      Batch proof tx: <code>${meta?.batchTx ?? ""}</code> · bukti-smoky.vercel.app
    </div>
    <script>window.onload=()=>{window.print();}</script>
  </body></html>`;
  const w = window.open("", "_blank");
  if (!w) return;
  w.document.write(html);
  w.document.close();
}

export function Sparkline({ pts }: { pts: number[] }) {
  if (pts.length < 2) return null;
  const w = 560, h = 90, pad = 5;
  const min = Math.min(...pts), max = Math.max(...pts);
  const span = max - min || 1;
  const x = (i: number) => pad + (i * (w - 2 * pad)) / (pts.length - 1);
  const y = (v: number) => h - pad - ((v - min) * (h - 2 * pad)) / span;
  const d = pts.map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const up = pts[pts.length - 1] >= 0;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="spark" preserveAspectRatio="none">
      {min < 0 && max > 0 && <line x1={pad} x2={w - pad} y1={y(0)} y2={y(0)} className="zero" />}
      <path d={d} className={up ? "line good-s" : "line bad-s"} />
    </svg>
  );
}

/** Volume-rank vs proof-rank scatter — visually proves "volume crowns the wrong winners":
 *  points on the diagonal = volume predicted skill; points far off it = the gameable gap. */
export function VolumeVsProof({ rows }: { rows: BoardRow[] }) {
  const W = 520, H = 360, pad = 38, n = rows.length || 25;
  const sx = (r: number) => pad + ((r - 1) / (n - 1)) * (W - 2 * pad);
  const sy = (r: number) => pad + ((r - 1) / (n - 1)) * (H - 2 * pad);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", maxWidth: 520, display: "block" }}>
      {/* diagonal: where volume rank == proof rank */}
      <line x1={pad} y1={pad} x2={W - pad} y2={H - pad} stroke="var(--line-2)" strokeWidth="1" strokeDasharray="4 4" />
      <text x={W - pad} y={H - pad + 24} textAnchor="end" fontSize="10" fill="var(--faint)" fontFamily="var(--mono)">volume rank →</text>
      <text x={pad - 8} y={pad - 12} fontSize="10" fill="var(--faint)" fontFamily="var(--mono)">↑ proof rank</text>
      <text x={W / 2} y={pad - 12} textAnchor="middle" fontSize="10" fill="var(--faint)" fontFamily="var(--mono)">on the line = volume predicts skill</text>
      {rows.map((r) => (
        <g key={r.wallet}>
          <circle cx={sx(r.volRank)} cy={sy(r.proofRank)} r={4.5} fill={r.score >= 0 ? "var(--accent)" : "var(--neg)"} fillOpacity="0.85">
            <title>{`${r.wallet.slice(0, 8)}… · vol #${r.volRank} → proof #${r.proofRank} · score ${r.score.toFixed(3)}`}</title>
          </circle>
        </g>
      ))}
    </svg>
  );
}

/** Minimal 1.5px line icons (no emoji). */
export function Icon({ name }: { name: string }) {
  const p = { fill: "none", stroke: "currentColor", strokeWidth: 1.6, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  const paths: Record<string, React.ReactNode> = {
    grid: <><rect x="3" y="3" width="7" height="7" rx="1" {...p} /><rect x="14" y="3" width="7" height="7" rx="1" {...p} /><rect x="3" y="14" width="7" height="7" rx="1" {...p} /><rect x="14" y="14" width="7" height="7" rx="1" {...p} /></>,
    ranking: <><path d="M4 20V10M10 20V4M16 20v-8M22 20H2" {...p} /></>,
    search: <><circle cx="11" cy="11" r="7" {...p} /><path d="M21 21l-4-4" {...p} /></>,
    bot: <><rect x="4" y="8" width="16" height="11" rx="2" {...p} /><path d="M12 8V4M8 13h.01M16 13h.01M9 17h6" {...p} /></>,
    shield: <><path d="M12 3l8 3v6c0 4.5-3.2 7.8-8 9-4.8-1.2-8-4.5-8-9V6l8-3z" {...p} /></>,
    coins: <><ellipse cx="9" cy="7" rx="5" ry="2.5" {...p} /><path d="M4 7v5c0 1.4 2.2 2.5 5 2.5M14 11c2.8 0 5 1.1 5 2.5s-2.2 2.5-5 2.5-5-1.1-5-2.5" {...p} /><path d="M19 13.5v4c0 1.4-2.2 2.5-5 2.5s-5-1.1-5-2.5v-3" {...p} /></>,
    check: <><path d="M5 12.5l4.5 4.5L19 6.5" {...p} /></>,
    link: <><path d="M9 15l6-6M8.5 7.5l1-1a4 4 0 015.7 5.7l-1 1M15.5 16.5l-1 1a4 4 0 01-5.7-5.7l1-1" {...p} /></>,
    alert: <><path d="M12 3l9 16H3l9-16zM12 10v4M12 17.5h.01" {...p} /></>,
  };
  return <svg viewBox="0 0 24 24" aria-hidden>{paths[name]}</svg>;
}
