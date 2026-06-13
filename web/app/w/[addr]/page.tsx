import type { Metadata } from "next";
import { fetchAttestation, mantleSepolia, ATTESTATION_ADDRESS } from "../../lib/contract";
import Logo from "../../components/Logo";

const EXPLORER = mantleSepolia.blockExplorers.default.url;
const short = (a: string) => `${a.slice(0, 10)}…${a.slice(-8)}`;

export async function generateMetadata({ params }: { params: Promise<{ addr: string }> }): Promise<Metadata> {
  const { addr } = await params;
  return {
    title: `Bukti — verified track record ${short(addr)}`,
    description: `${short(addr)}'s zk-verified, risk-adjusted trading track record — reconstructed in an SP1 zkVM from raw Mantle swaps and attested on-chain.`,
    openGraph: { images: ["/opengraph-image"] },
    twitter: { card: "summary_large_image" },
  };
}

export default async function WalletPage({ params }: { params: Promise<{ addr: string }> }) {
  const addr = (await params).addr as `0x${string}`;
  let att: Awaited<ReturnType<typeof fetchAttestation>> | null = null;
  try { att = await fetchAttestation(addr); } catch {}
  const exists = att?.exists;
  const score = att ? Number(att.sharpeMilli) / 1000 : 0;
  const roi = att ? Number(att.roiBps) / 100 : 0;
  const dd = att ? att.maxDrawdownBps / 100 : 0;
  const vol = att ? Number(att.volumeUsdE6) / 1e6 : 0;
  const tweet = encodeURIComponent(
    `My on-chain trading track record, zk-verified on @0xMantle — proven risk-adjusted score ${score.toFixed(3)}. Not a screenshot, a Groth16 proof. Check yours: https://bukti-smoky.vercel.app #MantleAIHackathon`,
  );

  return (
    <div className="bw-page">
      <div className="bw-card">
        <div className="bw-grid" aria-hidden />
        <header className="bw-head">
          <span className="bw-brand"><Logo size={20} /> Bukti<span className="bw-zk">zk</span></span>
          {exists ? <span className="bw-stamp ok">Proven ✓</span> : <span className="bw-stamp no">Unverified</span>}
        </header>

        <div className="bw-addr">{addr}</div>

        {exists ? (
          <>
            <div className="bw-hero">
              <div className="bw-hero-k">Proven score <span className="bw-hint">· risk-adjusted (Sharpe-style)</span></div>
              <div className={`bw-hero-v ${score >= 0 ? "pos" : "neg"}`}>{score.toFixed(3)}</div>
            </div>

            <div className="bw-metrics">
              <div><span className="mk">ROI</span><span className={`mv ${roi >= 0 ? "pos" : "neg"}`}>{roi.toFixed(2)}%</span></div>
              <div><span className="mk">Max drawdown</span><span className="mv">{dd.toFixed(2)}%</span></div>
              <div><span className="mk">Realized trades</span><span className="mv">{att!.numTrades}</span></div>
              <div><span className="mk">Volume</span><span className="mv">${vol.toLocaleString(undefined, { maximumFractionDigits: vol < 100 ? 2 : 0 })}</span></div>
            </div>

            <div className="bw-proof">
              <Logo size={14} /> Reconstructed in an SP1 zkVM from raw Mantle swaps · Groth16-attested on-chain · read live, not self-reported
            </div>
            <div className="bw-contract">Mantle Sepolia · attestation <span className="mono">{short(ATTESTATION_ADDRESS)}</span></div>

            <div className="bw-actions">
              <a href={`${EXPLORER}/address/${ATTESTATION_ADDRESS}#readContract`} target="_blank" rel="noreferrer">Verify on Mantlescan ↗</a>
              <a href={`https://twitter.com/intent/tweet?text=${tweet}`} target="_blank" rel="noreferrer">Share to X ↗</a>
              <a href="/dashboard/leaderboard">Full leaderboard →</a>
            </div>
          </>
        ) : (
          <div className="bw-empty">
            <p>No zk-verified attestation on-chain for this address yet — any performance claim from it is <strong>unverified</strong>.</p>
            <a href="/dashboard/leaderboard">See the Provable ClawHack leaderboard →</a>
          </div>
        )}
      </div>

      <footer className="bw-foot">Every number is reconstructed from raw Mantle swaps inside an SP1 zkVM and attested on-chain — verifiable by anyone. Built for The Turing Test Hackathon 2026.</footer>

      <style>{`
        .bw-page { min-height: 100vh; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 18px; padding: 40px 20px;
          background: radial-gradient(900px 460px at 50% -8%, rgba(14,159,110,.06), transparent 60%), var(--bg); }
        .bw-card { position: relative; width: 100%; max-width: 460px; background: var(--bg); border: 1px solid var(--line); border-radius: 18px;
          padding: 26px 26px 22px; box-shadow: 0 1px 2px rgba(20,24,29,.04), 0 14px 40px -18px rgba(20,24,29,.18); overflow: hidden; }
        .bw-grid { position: absolute; inset: 0; z-index: 0; pointer-events: none; opacity: .5;
          background-image: radial-gradient(var(--line) 1px, transparent 1.4px); background-size: 20px 20px;
          -webkit-mask-image: linear-gradient(180deg,#000,transparent 70%); mask-image: linear-gradient(180deg,#000,transparent 70%); }
        .bw-card > *:not(.bw-grid) { position: relative; z-index: 1; }
        .bw-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 18px; }
        .bw-brand { display: inline-flex; align-items: center; gap: 8px; font-weight: 600; font-size: 16px; color: var(--text); }
        .bw-brand svg { color: var(--text); }
        .bw-zk { font-family: var(--mono); font-size: 9.5px; color: var(--accent); border: 1px solid var(--line-2); border-radius: 4px; padding: 2px 5px; margin-left: -3px; }
        .bw-stamp { font-family: var(--mono); font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: .12em; padding: 5px 10px; border: 1.5px solid; border-radius: 6px; transform: rotate(4deg); }
        .bw-stamp.ok { color: var(--accent); border-color: var(--accent); background: var(--accent-dim); }
        .bw-stamp.no { color: var(--neg); border-color: var(--neg); background: var(--neg-dim); transform: rotate(-4deg); }
        .bw-addr { font-family: var(--mono); font-size: 12px; color: var(--muted); background: var(--surface); border: 1px solid var(--line); border-radius: 7px; padding: 8px 11px; word-break: break-all; margin-bottom: 20px; }
        .bw-hero-k { font-size: 12px; color: var(--muted); text-transform: uppercase; letter-spacing: .06em; margin-bottom: 4px; }
        .bw-hint { text-transform: none; letter-spacing: 0; color: var(--faint); font-size: 11px; }
        .bw-hero-v { font-family: var(--mono); font-size: 64px; font-weight: 700; line-height: 1; letter-spacing: -.03em; }
        .bw-hero-v.pos { color: var(--accent); } .bw-hero-v.neg { color: var(--neg); }
        .bw-metrics { display: grid; grid-template-columns: 1fr 1fr; gap: 1px; background: var(--line); border: 1px solid var(--line); border-radius: 11px; overflow: hidden; margin: 22px 0 18px; }
        .bw-metrics > div { background: var(--bg); padding: 13px 15px; display: flex; flex-direction: column; gap: 4px; }
        .bw-metrics .mk { font-size: 11px; color: var(--faint); text-transform: uppercase; letter-spacing: .05em; }
        .bw-metrics .mv { font-family: var(--mono); font-size: 18px; color: var(--text); font-variant-numeric: tabular-nums; }
        .bw-metrics .mv.pos { color: var(--accent); } .bw-metrics .mv.neg { color: var(--neg); }
        .bw-proof { display: flex; align-items: center; gap: 7px; font-size: 12px; line-height: 1.45; color: var(--accent); background: var(--accent-dim); border-radius: 8px; padding: 10px 12px; }
        .bw-proof svg { flex: none; color: var(--accent); }
        .bw-contract { font-size: 11px; color: var(--faint); margin: 8px 0 0; }
        .bw-contract .mono { font-family: var(--mono); }
        .bw-actions { display: flex; flex-wrap: wrap; gap: 14px; margin-top: 16px; padding-top: 14px; border-top: 1px solid var(--line); }
        .bw-actions a { font-size: 12.5px; color: var(--muted); }
        .bw-actions a:hover { color: var(--accent); }
        .bw-empty { padding: 8px 0; }
        .bw-empty p { font-size: 14px; color: var(--muted); line-height: 1.55; margin: 0 0 14px; }
        .bw-empty strong { color: var(--neg); }
        .bw-empty a, .bw-actions a:last-child { color: var(--accent); }
        .bw-foot { max-width: 460px; text-align: center; font-size: 11.5px; line-height: 1.5; color: var(--faint); }
        @media (max-width: 480px) { .bw-hero-v { font-size: 52px; } }
      `}</style>
    </div>
  );
}
