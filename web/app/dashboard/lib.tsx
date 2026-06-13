"use client";

import { useEffect, useState } from "react";
import { fetchLeaderboard } from "../lib/contract";

export const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

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
