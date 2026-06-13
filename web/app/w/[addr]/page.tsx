import type { Metadata } from "next";
import { fetchAttestation, mantleSepolia, ATTESTATION_ADDRESS } from "../../lib/contract";

const EXPLORER = mantleSepolia.blockExplorers.default.url;
const short = (a: string) => `${a.slice(0, 8)}…${a.slice(-6)}`;

export async function generateMetadata({ params }: { params: Promise<{ addr: string }> }): Promise<Metadata> {
  const { addr } = await params;
  return {
    title: `Bukti — verified track record ${short(addr)}`,
    description: `${short(addr)}'s zk-verified risk-adjusted trading track record, reconstructed in an SP1 zkVM and attested on Mantle.`,
    openGraph: { images: ["/opengraph-image"] },
    twitter: { card: "summary_large_image" },
  };
}

export default async function WalletPage({ params }: { params: Promise<{ addr: string }> }) {
  const addr = (await params).addr as `0x${string}`;
  let att: Awaited<ReturnType<typeof fetchAttestation>> | null = null;
  try {
    att = await fetchAttestation(addr);
  } catch {}
  const exists = att?.exists;
  const score = att ? Number(att.sharpeMilli) / 1000 : 0;
  const tweet = encodeURIComponent(
    `My on-chain trading track record, zk-verified on @0xMantle — proven score ${score.toFixed(
      3,
    )}. Not a screenshot. Check yours: https://bukti-smoky.vercel.app #MantleAIHackathon`,
  );

  return (
    <div className="wrap">
      <div className="brand">
        <h1>Bukti</h1>
        <span className="zk">zk-verified</span>
      </div>
      <div className="card">
        <div className="meta" style={{ fontSize: 13, marginBottom: 10 }}>{addr}</div>
        {exists ? (
          <>
            <div className="metrics">
              <div className="metric"><div className="k">Proven Score</div><div className={`v ${score >= 0 ? "good" : "bad"}`}>{score.toFixed(3)}</div></div>
              <div className="metric"><div className="k">ROI</div><div className={`v ${Number(att!.roiBps) >= 0 ? "good" : "bad"}`}>{(Number(att!.roiBps) / 100).toFixed(2)}%</div></div>
              <div className="metric"><div className="k">Max Drawdown</div><div className="v">{(att!.maxDrawdownBps / 100).toFixed(2)}%</div></div>
              <div className="metric"><div className="k">Realized Trades</div><div className="v">{att!.numTrades}</div></div>
            </div>
            <div className="proven">✓ Proven in SP1 zkVM · attested on Mantle · read live from chain</div>
            <div className="meta">
              <a href={`${EXPLORER}/address/${ATTESTATION_ADDRESS}#readContract`} target="_blank" rel="noreferrer">Verify on Mantlescan ↗</a>
              {" · "}
              <a href={`https://twitter.com/intent/tweet?text=${tweet}`} target="_blank" rel="noreferrer">Share to X ↗</a>
              {" · "}
              <a href="/dashboard">← Full leaderboard</a>
            </div>
          </>
        ) : (
          <>
            <p className="state">No zk-verified attestation on-chain for this address yet — any performance claims from it are unverified.</p>
            <div className="meta"><a href="/dashboard">← See the Provable ClawHack Leaderboard</a></div>
          </>
        )}
      </div>
      <footer>Every number is reconstructed from raw Mantle swaps inside an SP1 zkVM and attested on-chain. Built for The Turing Test Hackathon 2026.</footer>
    </div>
  );
}
