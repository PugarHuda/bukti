"use client";

import { useCallback, useEffect, useState } from "react";

/* ── Bukti pitch deck — live at /slide. ←/→ or click to navigate, F for fullscreen. ── */

type Slide = { kind: string; render: () => React.ReactNode };

const Stat = ({ n, l }: { n: string; l: string }) => (
  <div className="stat"><div className="stat-n mono">{n}</div><div className="stat-l">{l}</div></div>
);

const SLIDES: Slide[] = [
  {
    kind: "title",
    render: () => (
      <>
        <div className="eyebrow mono">Mantle · The Turing Test Hackathon 2026 · AI Alpha &amp; Data</div>
        <h1 className="title-xl">Bukti<span className="zk-badge mono">zk</span></h1>
        <p className="lede">Proof-of-Real-PnL — the <strong>chain-authenticity layer</strong> for the agent economy.</p>
        <p className="sub">A track record you can <em>verify</em>, not just trust. Reconstructed in a zkVM from raw Mantle swaps, proven genuine down to the chain data, attested on-chain for $0.</p>
        <div className="foot-url mono">bukti-smoky.vercel.app</div>
      </>
    ),
  },
  {
    kind: "problem",
    render: () => (
      <>
        <div className="kicker mono">01 — The problem</div>
        <h2>Every AI trading agent claims a great record. <span className="muted">None can prove it.</span></h2>
        <ul className="big-list">
          <li>Screenshots are editable.</li>
          <li>Dashboards say <em>"trust me."</em></li>
          <li>On-chain "reputation" today is self-reported.</li>
        </ul>
        <p className="punch">Capital flows to whoever tells the best story — including the liars.</p>
      </>
    ),
  },
  {
    kind: "insight",
    render: () => (
      <>
        <div className="kicker mono">02 — Why a ZK proof of the math isn&apos;t enough</div>
        <h2>Two agents both claim <span className="accent">+312%</span>. One is fabricated.</h2>
        <div className="two-col">
          <div className="card-lite">
            <div className="card-h mono">A screenshot verifier</div>
            <p>Passes both. It only reads pixels.</p>
          </div>
          <div className="card-lite">
            <div className="card-h mono">A ZK proof of the PnL <em>math</em></div>
            <p>Also passes both. It proves the arithmetic — on whatever numbers you feed it.</p>
          </div>
        </div>
        <p className="punch">The fabricated record&apos;s <strong>inputs</strong> were never real. You have to prove the <strong>trades</strong> are genuine chain data.</p>
      </>
    ),
  },
  {
    kind: "solution",
    render: () => (
      <>
        <div className="kicker mono">03 — What Bukti does</div>
        <h2>Bukti proves the whole chain, not just the math.</h2>
        <div className="flow">
          <div className="flow-step"><span className="mono num">1</span><div><b>Raw Mantle swaps</b><p>Agni / FusionX logs — the actual trades.</p></div></div>
          <div className="flow-arrow">→</div>
          <div className="flow-step"><span className="mono num">2</span><div><b>Proven genuine</b><p>Receipt-trie inclusion + EIP-2935 block anchor, in-circuit.</p></div></div>
          <div className="flow-arrow">→</div>
          <div className="flow-step"><span className="mono num">3</span><div><b>SP1 zkVM</b><p>Risk-adjusted PnL reconstructed in deterministic integer math.</p></div></div>
          <div className="flow-arrow">→</div>
          <div className="flow-step"><span className="mono num">4</span><div><b>On-chain</b><p>One Groth16 proof a smart contract can <span className="mono">require()</span>.</p></div></div>
        </div>
        <p className="punch">The proof <em>is</em> the product.</p>
      </>
    ),
  },
  {
    kind: "moat",
    render: () => (
      <>
        <div className="kicker mono">04 — The moat nobody else has</div>
        <h2>A fabricated record literally cannot pass.</h2>
        <p className="lede2">We cracked Mantle&apos;s non-standard receipt encoding and anchor every block hash trustlessly via <span className="mono">EIP-2935</span>. So Bukti proves every trade is <strong>genuine Mantle chain data</strong> — and <strong>catches the fake</strong> a screenshot or a math-proof would wave through.</p>
        <div className="catch">
          <div className="catch-row"><span className="dot ok" /> Agent A → <b className="accent">PROVEN REAL</b> <span className="muted">(on-chain attestation + receipt-trie inclusion)</span></div>
          <div className="catch-row"><span className="dot no" /> Agent B → <b className="neg">UNVERIFIED</b> <span className="muted">(no proof on chain)</span></div>
        </div>
        <p className="punch">That&apos;s the whole thesis. <span className="muted mono">/dashboard/authenticity</span></p>
      </>
    ),
  },
  {
    kind: "result",
    render: () => (
      <>
        <div className="kicker mono">05 — Flagship result</div>
        <h2>We re-ranked this hackathon&apos;s own ClawHack cohort — <span className="accent">provably</span>.</h2>
        <div className="stat-row">
          <Stat n="382" l="agents discovered" />
          <Stat n="105" l="re-ranked by proven score" />
          <Stat n="714 B" l="per Groth16 proof" />
          <Stat n="$0" l="proving cost · 8 GB laptop" />
        </div>
        <div className="insight-box">
          <div className="ib-h mono">The insight VCs remember</div>
          <p><strong>Volume crowns the wrong winners.</strong> Across the 105-agent cohort the volume champion ranks only <strong className="neg">#82</strong> by proven skill, and volume agrees with proven skill just <strong className="neg">25%</strong> of the time — 97% of all volume came from net-losing wallets.</p>
        </div>
      </>
    ),
  },
  {
    kind: "trust",
    render: () => (
      <>
        <div className="kicker mono">06 — A verifiability project, verifiable about itself</div>
        <h2>We publish our own trust boundary — and keep closing it.</h2>
        <div className="trust-grid">
          <div className="tg ok"><b>PROVEN</b><span>metric · completeness · swap-log authenticity</span></div>
          <div className="tg ok"><b>TRUSTLESS</b><span>block-hash anchor (EIP-2935)</span></div>
          <div className="tg mit"><b>MITIGATED (running code)</b><span>wash-trading · open-position MtM · identity-binding · oracle confidence</span></div>
          <div className="tg open"><b>HONEST GAP</b><span>funder-graph anti-sybil · external audit</span></div>
        </div>
        <p className="punch">Wash-trading is <strong>solved by construction</strong> — a fee-aware score makes volume-pumping self-defeating. <span className="muted mono">npm run wash-sybil</span></p>
      </>
    ),
  },
  {
    kind: "compose",
    render: () => (
      <>
        <div className="kicker mono">07 — A proof is useless until it moves money</div>
        <h2>One attestation, a whole ecosystem reads it.</h2>
        <div className="compose-grid">
          <div className="cg"><b className="mono">BuktiAllocator</b><p>Routes capital by proven score — <span className="accent">81.8%</span> to the proven leader of the set, <span className="neg">0%</span> to a high-volume wallet that lost money.</p></div>
          <div className="cg"><b className="mono">ERC-8004 validator</b><p>Fills Mantle&apos;s ZK Validation Registry for financial performance.</p></div>
          <div className="cg"><b className="mono">x402 proof-gate</b><p>HTTP 402 unless a wallet&apos;s proven score clears the bar.</p></div>
          <div className="cg"><b className="mono">MCP + badge + bot</b><p>Agents check proof, not promises — every reply read live from chain.</p></div>
        </div>
      </>
    ),
  },
  {
    kind: "traction",
    render: () => (
      <>
        <div className="kicker mono">08 — Live &amp; verifiable today</div>
        <h2>Not a deck-ware demo. It runs.</h2>
        <div className="stat-row">
          <Stat n="9" l="contracts live on Mantle" />
          <Stat n="48/48" l="contract tests · 22/22 lib" />
          <Stat n="2" l="full-proof cases on-chain" />
          <Stat n="100%" l="board == on-chain attested" />
        </div>
        <ul className="check-list">
          <li>Verify our real Groth16 proof <b>in your own browser</b> (real proof → VALID, tampered → REVERT).</li>
          <li>Reproduce the cracked Mantle receipts-root from source: <span className="mono">npm run receipt-trie</span>.</li>
          <li>Every score on the board is the score attested on-chain — checked, not claimed.</li>
        </ul>
      </>
    ),
  },
  {
    kind: "market",
    render: () => (
      <>
        <div className="kicker mono">09 — Who pays</div>
        <h2>The agent economy needs a credit bureau.</h2>
        <div className="two-col">
          <div className="card-lite"><div className="card-h mono">Demand</div><ul><li>Allocators routing capital to agents</li><li>Agent marketplaces ranking strategies</li><li>Vaults / DeFi gating by track record</li><li>Exchanges verifying copy-traders</li></ul></div>
          <div className="card-lite"><div className="card-h mono">Why now</div><ul><li>Mantle shipped ERC-8004 to mainnet — Validation Registry ships empty, spec&apos;d for ZK.</li><li>Bukti is the drop-in ZK validator that fills it.</li><li>Phase 2 is Human-vs-AI — Bukti is the provably-fair referee.</li></ul></div>
        </div>
      </>
    ),
  },
  {
    kind: "close",
    render: () => (
      <>
        <div className="eyebrow mono">Built on Mantle · open-source</div>
        <h1 className="title-l">Anyone can claim a track record.<br /><span className="accent">Bukti proves it&apos;s real</span> — down to the chain data.</h1>
        <p className="lede">Proof-of-Real-PnL — verifiably, on-chain, today.</p>
        <div className="close-links mono">
          <span>bukti-smoky.vercel.app</span><span className="sep">·</span><span>github.com/PugarHuda/bukti</span>
        </div>
      </>
    ),
  },
];

export default function Deck() {
  const [i, setI] = useState(0);
  const n = SLIDES.length;
  const go = useCallback((d: number) => setI((p) => Math.min(n - 1, Math.max(0, p + d))), [n]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" || e.key === " " || e.key === "PageDown") { e.preventDefault(); go(1); }
      else if (e.key === "ArrowLeft" || e.key === "PageUp") { e.preventDefault(); go(-1); }
      else if (e.key === "Home") setI(0);
      else if (e.key === "End") setI(n - 1);
      else if (e.key.toLowerCase() === "f") { if (!document.fullscreenElement) document.documentElement.requestFullscreen?.(); else document.exitFullscreen?.(); }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [go, n]);

  return (
    <div className="deck">
      <div className="progress"><span style={{ width: `${((i + 1) / n) * 100}%` }} /></div>
      <button className="zone left" aria-label="previous" onClick={() => go(-1)} />
      <button className="zone right" aria-label="next" onClick={() => go(1)} />

      <main className={`slide s-${SLIDES[i].kind}`} key={i}>{SLIDES[i].render()}</main>

      <div className="deck-foot">
        <span className="brand mono">Bukti<span className="zk">zk</span></span>
        <span className="counter mono">{String(i + 1).padStart(2, "0")} / {String(n).padStart(2, "0")}</span>
        <span className="hint mono">← → navigate · F fullscreen</span>
      </div>

      <style jsx global>{`
        body { overflow: hidden; }
        .deck { position: fixed; inset: 0; background:
          radial-gradient(1200px 600px at 80% -10%, rgba(14,159,110,0.06), transparent 60%),
          var(--bg); display: flex; align-items: center; justify-content: center; }
        .progress { position: fixed; top: 0; left: 0; right: 0; height: 3px; background: var(--line); z-index: 30; }
        .progress span { display: block; height: 100%; background: var(--accent); transition: width .35s cubic-bezier(.4,0,.2,1); }
        .zone { position: fixed; top: 0; bottom: 0; width: 22%; border: 0; background: transparent; cursor: pointer; z-index: 20; }
        .zone.left { left: 0; } .zone.right { right: 0; }
        .slide { width: min(1040px, 90vw); max-height: 86vh; padding: 8px 12px; animation: fade .4s ease both; }
        @keyframes fade { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
        .deck-foot { position: fixed; bottom: 20px; left: 0; right: 0; display: flex; align-items: center; justify-content: space-between; padding: 0 32px; z-index: 25; }
        .deck-foot .brand { font-weight: 600; font-size: 13px; }
        .deck-foot .zk { color: var(--accent); margin-left: 1px; }
        .deck-foot .counter { color: var(--muted); font-size: 12px; }
        .deck-foot .hint { color: var(--faint); font-size: 11px; }

        .eyebrow, .kicker { color: var(--accent); font-size: 12px; letter-spacing: .04em; margin-bottom: 18px; text-transform: uppercase; }
        .kicker { color: var(--faint); }
        .slide h1, .slide h2 { letter-spacing: -0.02em; line-height: 1.08; margin: 0 0 18px; }
        .title-xl { font-size: clamp(56px, 10vw, 104px); font-weight: 700; display: flex; align-items: baseline; gap: 4px; }
        .title-l { font-size: clamp(30px, 5vw, 52px); font-weight: 700; }
        .slide h2 { font-size: clamp(26px, 4.2vw, 44px); font-weight: 650; }
        .zk-badge { font-size: 22px; color: var(--accent); background: var(--accent-dim); padding: 4px 9px; border-radius: 8px; align-self: center; }
        .lede { font-size: clamp(18px, 2.4vw, 25px); color: var(--text); max-width: 800px; margin: 0 0 14px; }
        .lede2 { font-size: clamp(17px, 2vw, 21px); color: var(--muted); max-width: 820px; line-height: 1.5; }
        .sub { font-size: 16px; color: var(--muted); max-width: 700px; }
        .muted { color: var(--muted); } .accent { color: var(--accent); } .neg { color: var(--neg); }
        .foot-url { position: absolute; bottom: 64px; color: var(--faint); font-size: 13px; }

        .big-list { list-style: none; padding: 0; margin: 8px 0 24px; }
        .big-list li { font-size: clamp(20px, 2.6vw, 28px); color: var(--text); padding: 9px 0; border-bottom: 1px solid var(--line); }
        .punch { font-size: clamp(18px, 2.3vw, 24px); color: var(--text); font-weight: 550; margin-top: 8px; }
        .punch.accent, .punch .accent { color: var(--accent); }

        .two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; margin: 18px 0 22px; }
        .card-lite { background: var(--surface); border: 1px solid var(--line); border-radius: 12px; padding: 22px; }
        .card-h { color: var(--accent); font-size: 13px; margin-bottom: 10px; }
        .card-lite p { margin: 0; font-size: 17px; color: var(--text); }
        .card-lite ul { margin: 6px 0 0; padding-left: 18px; color: var(--muted); font-size: 16px; }
        .card-lite li { padding: 3px 0; }

        .flow { display: flex; align-items: stretch; gap: 10px; margin: 24px 0; flex-wrap: wrap; }
        .flow-step { flex: 1; min-width: 180px; background: var(--surface); border: 1px solid var(--line); border-radius: 12px; padding: 18px; display: flex; gap: 12px; }
        .flow-step .num { width: 26px; height: 26px; flex: 0 0 26px; display: grid; place-items: center; background: var(--accent); color: #fff; border-radius: 7px; font-size: 13px; }
        .flow-step b { font-size: 17px; } .flow-step p { margin: 4px 0 0; font-size: 14px; color: var(--muted); }
        .flow-arrow { display: grid; place-items: center; color: var(--line-2); font-size: 22px; }

        .catch { background: var(--surface); border: 1px solid var(--line); border-radius: 12px; padding: 20px 24px; margin: 20px 0; }
        .catch-row { font-size: clamp(17px, 2vw, 21px); padding: 8px 0; }
        .dot { display: inline-block; width: 9px; height: 9px; border-radius: 50%; margin-right: 12px; }
        .dot.ok { background: var(--accent); } .dot.no { background: var(--neg); }

        .stat-row { display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px; margin: 26px 0; }
        .stat { background: var(--surface); border: 1px solid var(--line); border-radius: 12px; padding: 20px; }
        .stat-n { font-size: clamp(28px, 4vw, 42px); font-weight: 700; color: var(--text); letter-spacing: -0.02em; }
        .stat-l { font-size: 13px; color: var(--muted); margin-top: 6px; }
        .insight-box { background: var(--accent-dim); border: 1px solid rgba(14,159,110,0.25); border-radius: 12px; padding: 22px 24px; }
        .ib-h { color: var(--accent); font-size: 13px; margin-bottom: 8px; }
        .insight-box p { margin: 0; font-size: clamp(17px, 2vw, 21px); }

        .trust-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin: 22px 0; }
        .tg { border-radius: 12px; padding: 18px 20px; border: 1px solid var(--line); background: var(--surface); }
        .tg b { display: block; font-family: var(--mono); font-size: 13px; margin-bottom: 6px; }
        .tg span { font-size: 15px; color: var(--muted); }
        .tg.ok { background: var(--accent-dim); border-color: rgba(14,159,110,.25); } .tg.ok b { color: var(--accent); }
        .tg.mit b { color: #0d9488; } .tg.open b { color: #d97706; }

        .compose-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin: 22px 0; }
        .cg { background: var(--surface); border: 1px solid var(--line); border-radius: 12px; padding: 18px 20px; }
        .cg b { font-size: 15px; color: var(--text); } .cg p { margin: 6px 0 0; font-size: 15px; color: var(--muted); }

        .check-list { list-style: none; padding: 0; margin: 18px 0 0; }
        .check-list li { font-size: clamp(16px, 1.9vw, 19px); color: var(--text); padding: 10px 0 10px 30px; position: relative; border-bottom: 1px solid var(--line); }
        .check-list li::before { content: "✓"; position: absolute; left: 0; color: var(--accent); font-weight: 700; }

        .close-links { margin-top: 26px; color: var(--muted); font-size: 15px; display: flex; gap: 14px; }
        .close-links .sep { color: var(--line-2); }

        @media (max-width: 760px) {
          .two-col, .trust-grid, .compose-grid { grid-template-columns: 1fr; }
          .stat-row { grid-template-columns: 1fr 1fr; }
          .flow-arrow { display: none; }
          .deck-foot .hint { display: none; }
        }
      `}</style>
    </div>
  );
}
