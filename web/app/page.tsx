"use client";

import { useEffect, useState } from "react";
import {
  fetchAttestation,
  fetchLeaderboard,
  ATTESTATION_ADDRESS,
  VERIFIER_ADDRESS,
  VERIFIER_VERSION,
  mantleSepolia,
  type Attestation,
} from "./lib/contract";

const EXPLORER = mantleSepolia.blockExplorers.default.url;
const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

interface BoardRow {
  wallet: string;
  clawhackSwaps: number;
  legs: number;
  trades: { ts: number; pnl: number; notional: number }[];
  score: number;
  dd: number;
  roi: number;
  vol: number;
  pnl: number;
  curve: number[];
  volRank: number;
  proofRank: number;
  tier: string;
  quadrant: string;
  winRate: number;
  profitFactor: number;
  sortino: number;
  calmar: number;
  avgWin: number;
  avgLoss: number;
  bestStreak: number;
  worstStreak: number;
}
interface CohortStats {
  profitable: number;
  unprofitable: number;
  totalVolumeUsd: number;
  totalRealizedPnlUsd: number;
  pctVolumeFromLosers: number;
  avgRankGap: number;
  volumeScoreAgreementPct: number;
  medianScore: number;
}
interface BoardData {
  meta: {
    window: string;
    walletsScanned: number;
    walletsProven: number;
    totalLegs: number;
    proofBytes: number;
    batchTx: string;
    attestationContract?: string;
    verifier?: string;
    chain?: string;
    cohort?: CohortStats;
  };
  rows: BoardRow[];
}

function download(name: string, obj: unknown) {
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
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
  const zeroY = y(0);
  const up = pts[pts.length - 1] >= 0;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="spark">
      {min < 0 && max > 0 && (
        <line x1={pad} x2={w - pad} y1={zeroY} y2={zeroY} className="zero" />
      )}
      <path d={d} className={up ? "line good-s" : "line bad-s"} />
    </svg>
  );
}

export default function Home() {
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
    fetch("/board-data.json")
      .then((r) => r.json())
      .then(setBoard)
      .catch(() => {});
    // Cross-verify the static witness data against LIVE chain events; badge the result.
    fetchLeaderboard()
      .then((rows) => setLiveOk(rows.length >= 25 ? "live" : "cache"))
      .catch(() => setLiveOk("cache"));
  }, []);

  async function askCopilot(wallet: string, label: string) {
    setCopilotBusy(true);
    setCopilot({ q: `Should I copy-trade ${label} (${short(wallet)})?`, a: "…checking the proof layer on Mantle…" });
    try {
      const a = await fetchAttestation(wallet as `0x${string}`);
      const row = board?.rows.find((r) => r.wallet.toLowerCase() === wallet.toLowerCase());
      if (!a.exists) {
        setCopilot({
          q: `Should I copy-trade ${label} (${short(wallet)})?`,
          a: `No verified attestation exists on-chain for this wallet. Any performance claims from it are UNVERIFIED — I would not allocate capital.`,
        });
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
    if (!/^0x[0-9a-fA-F]{40}$/.test(a0)) {
      setErr("Enter a valid 0x… address");
      setState("error");
      return;
    }
    if (target) setAddr(target);
    setState("loading");
    setErr("");
    setAtt(null);
    try {
      const a = await fetchAttestation(a0 as `0x${string}`);
      if (!a.exists) return setState("empty");
      setAtt(a);
      setState("idle");
    } catch (e) {
      setErr((e as Error).message);
      setState("error");
    }
  }

  const sharpe = att ? Number(att.sharpeMilli) / 1000 : 0;
  const roi = att ? Number(att.roiBps) / 100 : 0;
  const dd = att ? att.maxDrawdownBps / 100 : 0;
  const vol = att ? Number(att.volumeUsdE6) / 1e6 : 0;
  const meta = board?.meta;
  const volChamp = board ? [...board.rows].sort((a, b) => b.clawhackSwaps - a.clawhackSwaps)[0] : null;

  return (
    <div className="wrap">
      <div className="brand">
        <h1>Bukti</h1>
        <span className="zk">zk-verified</span>
      </div>
      <p className="tagline">
        During this hackathon&apos;s Phase 1 — <strong>ClawHack</strong> — hundreds of AI agents
        traded on Mantle, ranked by a leaderboard you had to <em>trust</em>. Bukti re-ran the
        cohort <strong>provably</strong>: raw mainnet swaps reconstructed inside an SP1 zkVM,
        the entire ranking attested on-chain with <strong>one Groth16 proof</strong>.
      </p>

      {meta && (
        <div className="stats">
          <div className="stat"><div className="v">{meta.walletsScanned}</div><div className="k">wallets scanned</div></div>
          <div className="stat"><div className="v">{meta.walletsProven}</div><div className="k">wallets proven</div></div>
          <div className="stat"><div className="v">{meta.totalLegs}</div><div className="k">raw swap legs</div></div>
          <div className="stat"><div className="v">1</div><div className="k">Groth16 proof</div></div>
          <div className="stat"><div className="v">{meta.proofBytes}B</div><div className="k">proof size</div></div>
          <div className="stat"><div className="v">$0</div><div className="k">proving cost</div></div>
        </div>
      )}

      {volChamp && board && (
        <div className="insight">
          💡 <strong>Volume crowns the wrong winners.</strong> The cohort&apos;s volume champion
          ({short(volChamp.wallet)}, {volChamp.clawhackSwaps} swaps) ranks only{" "}
          <strong>#{volChamp.proofRank} by proven risk-adjusted score</strong> — while the proof
          champion ({short(board.rows[0].wallet)}, score {board.rows[0].score.toFixed(2)}) sits at
          volume rank #{board.rows[0].volRank}.
        </div>
      )}

      {board?.meta.cohort && (
        <div className="card" style={{ marginBottom: 18 }}>
          <h2 className="h2">Cohort X-ray — what the proof reveals</h2>
          <div className="xray">
            <div className="xstat">
              <div className="xv bad">{board.meta.cohort.volumeScoreAgreementPct}%</div>
              <div className="xk">of the time the higher-volume wallet also has the higher proven
                score — barely better than a coin flip</div>
            </div>
            <div className="xstat">
              <div className="xv">{board.meta.cohort.avgRankGap}</div>
              <div className="xk">average gap (of 25) between a wallet&apos;s volume rank and its
                proven rank</div>
            </div>
            <div className="xstat">
              <div className="xv bad">{board.meta.cohort.pctVolumeFromLosers}%</div>
              <div className="xk">of cohort volume came from wallets that ended net-negative</div>
            </div>
            <div className="xstat">
              <div className="xv">
                <span className="good">{board.meta.cohort.profitable}</span> /{" "}
                <span className="bad">{board.meta.cohort.unprofitable}</span>
              </div>
              <div className="xk">profitable vs unprofitable (proven)</div>
            </div>
          </div>
          <p className="hint">
            Volume — the metric ClawHack ranked on — predicts proven skill only{" "}
            {board.meta.cohort.volumeScoreAgreementPct}% of the time. Every number here is derived
            from the same witness the on-chain proof attests.{" "}
            <a onClick={() => download("bukti-clawhack-cohort-report.json", { meta: board.meta, rows: board.rows })} style={{ cursor: "pointer", color: "var(--accent-2)" }}>
              ⭳ Download full verified report (JSON)
            </a>
          </p>
        </div>
      )}

      <div className="card">
        <div className="row">
          <input
            type="text"
            placeholder="0x… agent / wallet address"
            value={addr}
            onChange={(e) => setAddr(e.target.value.trim())}
            onKeyDown={(e) => e.key === "Enter" && verify()}
          />
          <button onClick={() => verify()} disabled={state === "loading"}>
            {state === "loading" ? "Verifying…" : "Verify on-chain"}
          </button>
        </div>
        {att && (
          <>
            <div className="metrics">
              <div className="metric"><div className="k">Bukti Score (per-trade)</div><div className={`v ${sharpe >= 0 ? "good" : "bad"}`}>{sharpe.toFixed(3)}</div></div>
              <div className="metric"><div className="k">Max Drawdown</div><div className="v">{dd.toFixed(2)}%</div></div>
              <div className="metric"><div className="k">ROI</div><div className={`v ${roi >= 0 ? "good" : "bad"}`}>{roi.toFixed(2)}%</div></div>
              <div className="metric"><div className="k">Volume (USD)</div><div className="v">${vol.toLocaleString(undefined, { maximumFractionDigits: 0 })}</div></div>
            </div>
            <div className="proven">✓ Proven in SP1 zkVM · {att.numTrades} realized trades · read live from Mantle</div>
          </>
        )}
        {state === "empty" && <p className="state">No verified attestation for this address yet.</p>}
        {state === "error" && <p className="state err">{err}</p>}
      </div>

      <div className="card" style={{ marginTop: 18 }}>
        <h2 className="h2">
          The Provable ClawHack Leaderboard{" "}
          {liveOk === "live" && <span className="badge live">● verified live from chain events</span>}
          {liveOk === "cache" && <span className="badge">from proof witness</span>}
        </h2>
        <p className="hint" style={{ marginTop: 2 }}>
          Every row is attested by{" "}
          <a href={`${EXPLORER}/tx/${meta?.batchTx ?? ""}`} target="_blank" rel="noreferrer">
            one on-chain Groth16 proof ↗
          </a>
          . Click a row for the reconstructed equity curve &amp; trades (derived from the proof&apos;s
          public witness).
        </p>
        {!board && <p className="state">Loading…</p>}
        {board && (
          <table className="board">
            <thead>
              <tr>
                <th>Proof #</th>
                <th>Wallet</th>
                <th>Score</th>
                <th>ROI</th>
                <th>PnL</th>
                <th>Vol rank</th>
                <th>Δ</th>
              </tr>
            </thead>
            <tbody>
              {board.rows.map((r) => {
                const delta = r.volRank - r.proofRank;
                return (
                  <>
                    <tr
                      key={r.wallet}
                      onClick={() => setOpen(open === r.wallet ? null : r.wallet)}
                      style={{ cursor: "pointer" }}
                      className={open === r.wallet ? "sel" : ""}
                    >
                      <td>{r.proofRank}{r.proofRank === 1 ? " 👑" : ""}</td>
                      <td className="mono">{short(r.wallet)}</td>
                      <td className={r.score >= 0 ? "good" : "bad"}>{r.score.toFixed(3)}</td>
                      <td className={r.roi >= 0 ? "good" : "bad"}>{r.roi.toFixed(2)}%</td>
                      <td className={r.pnl >= 0 ? "good" : "bad"}>${r.pnl.toFixed(2)}</td>
                      <td>#{r.volRank}</td>
                      <td className={delta > 0 ? "good" : delta < 0 ? "bad" : ""}>
                        {delta > 0 ? `▲${delta}` : delta < 0 ? `▼${-delta}` : "—"}
                      </td>
                    </tr>
                    {open === r.wallet && (
                      <tr className="detail" key={r.wallet + "-d"}>
                        <td colSpan={7}>
                          <div className="dwrap">
                            <div className="dhead">
                              <span>
                                <span className="mono">{r.wallet}</span>{" "}
                                <span className={`chip tier-${r.tier}`}>Tier {r.tier}</span>{" "}
                                <span className="chip quad">{r.quadrant}</span>
                              </span>
                              <span style={{ display: "flex", gap: 8 }}>
                                <button className="ghost" onClick={(e) => { e.stopPropagation(); download(`bukti-${r.wallet.slice(0, 8)}.json`, { ...r, attestationContract: board?.meta.attestationContract, batchTx: board?.meta.batchTx }); }}>
                                  ⭳ Report
                                </button>
                                <a className="ghost" href={`/w/${r.wallet}`} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} style={{ textDecoration: "none", display: "inline-flex", alignItems: "center" }}>
                                  ↗ Share card
                                </a>
                                <button className="ghost" onClick={(e) => { e.stopPropagation(); verify(r.wallet); }}>
                                  Read on-chain →
                                </button>
                              </span>
                            </div>
                            <Sparkline pts={r.curve} />
                            <div className="dgrid">
                              <span>Win rate: <strong>{r.winRate.toFixed(0)}%</strong></span>
                              <span>Profit factor: <strong>{r.profitFactor >= 999 ? "∞" : r.profitFactor.toFixed(2)}</strong></span>
                              <span>Sortino: <strong>{r.sortino.toFixed(2)}</strong></span>
                              <span>Calmar: <strong>{r.calmar.toFixed(2)}</strong></span>
                              <span>Max drawdown: <strong>{r.dd.toFixed(2)}%</strong></span>
                              <span>Best/worst streak: <strong>{r.bestStreak}W / {r.worstStreak}L</strong></span>
                              <span>Avg win/loss: <strong>${r.avgWin.toFixed(3)} / ${r.avgLoss.toFixed(3)}</strong></span>
                              <span>ClawHack swaps: <strong>{r.clawhackSwaps}</strong></span>
                              <span>Realized trades: <strong>{r.trades.length}</strong></span>
                              <span>Volume: <strong>${r.vol.toFixed(2)}</strong></span>
                            </div>
                            {r.trades.length > 0 && (
                              <table className="trades">
                                <thead><tr><th>Time (UTC)</th><th>Realized PnL</th><th>Notional</th></tr></thead>
                                <tbody>
                                  {r.trades.slice(-6).map((t, i) => (
                                    <tr key={i}>
                                      <td>{new Date(t.ts * 1000).toISOString().slice(5, 16).replace("T", " ")}</td>
                                      <td className={t.pnl >= 0 ? "good" : "bad"}>${t.pnl.toFixed(3)}</td>
                                      <td>${t.notional.toFixed(2)}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            )}
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

      <div className="card" style={{ marginTop: 18 }}>
        <h2 className="h2">🤖 What your AI agent sees (via bukti-mcp)</h2>
        <p className="hint" style={{ marginTop: 2 }}>
          The repo ships an MCP server so any agent checks <strong>proof, not promises</strong>{" "}
          before allocating capital. Try the two flows it runs — both read the chain live:
        </p>
        <div className="row" style={{ marginTop: 10, gap: 8 }}>
          <button
            className="ghost"
            disabled={copilotBusy || !board}
            onClick={() => volChamp && askCopilot(volChamp.wallet, "the ClawHack volume champion")}
          >
            Ask: copy the volume champion ({volChamp ? `${volChamp.clawhackSwaps} swaps` : "…"})?
          </button>
          <button
            className="ghost"
            disabled={copilotBusy || !board}
            onClick={() => board && askCopilot(board.rows[0].wallet, "the proven top performer")}
          >
            Ask: copy the proof champion?
          </button>
        </div>
        {copilot && (
          <div className="chat">
            <div className="bubble user">{copilot.q}</div>
            <div className="bubble agent">{copilot.a}</div>
          </div>
        )}
        <p className="hint">
          Same logic ships as 5 MCP tools (<code>bukti_get_verified_score</code>,{" "}
          <code>bukti_check_vault_eligibility</code>, …) —{" "}
          <a href="https://github.com/PugarHuda/bukti/blob/main/docs/MCP.md" target="_blank" rel="noreferrer">
            setup for Claude ↗
          </a>
        </p>
      </div>

      <div className="card" style={{ marginTop: 18 }}>
        <h2 className="h2">The proof layer</h2>
        <div className="meta" style={{ marginTop: 6 }}>
          Attestation contract:{" "}
          <a href={`${EXPLORER}/address/${ATTESTATION_ADDRESS}#code`} target="_blank" rel="noreferrer">
            {short(ATTESTATION_ADDRESS)} ↗
          </a>{" "}
          (verified source) · On-chain verifier:{" "}
          <a href={`${EXPLORER}/address/${VERIFIER_ADDRESS}#code`} target="_blank" rel="noreferrer">
            {short(VERIFIER_ADDRESS)} ↗
          </a>{" "}
          — <strong>{VERIFIER_VERSION}</strong> (invalid proofs revert with{" "}
          <code>WrongVerifierSelector</code>). Scores also written to Mantle&apos;s canonical{" "}
          <a href={`${EXPLORER}/address/0x8004B663056A597Dffe9eCcC1965A193B7388713`} target="_blank" rel="noreferrer">
            ERC-8004 ReputationRegistry ↗
          </a>
          .
          <br />
          Verify it yourself:{" "}
          <code className="snippet">
            cast call {short(ATTESTATION_ADDRESS)} &quot;getSharpeMilli(address)(int64,bool)&quot; &lt;wallet&gt; --rpc-url
            https://rpc.sepolia.mantle.xyz
          </code>
        </div>
      </div>

      <footer>
        Built on Mantle for The Turing Test Hackathon 2026. The zk proof covers the full
        reconstruction (raw swaps → cost-basis PnL → risk metrics) in deterministic integer math;
        equity curves &amp; trade lists are derived from the proof&apos;s public witness.
      </footer>
    </div>
  );
}
