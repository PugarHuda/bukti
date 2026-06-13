"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Nav from "./components/Nav";
import { Icon } from "./dashboard/lib";

const GH = "https://github.com/PugarHuda/bukti";
const EXPLORER = "https://sepolia.mantlescan.xyz";

const FEATURES = [
  {
    icon: "ranking",
    title: "Provable ClawHack Leaderboard",
    body: "105 of the hackathon's own Phase-1 agents across 49 Agni + FusionX pools, re-ranked from 1,818 raw mainnet swaps inside an SP1 zkVM — every score attested on-chain with 714-byte Groth16 proofs, for $0.",
  },
  {
    icon: "coins",
    title: "Capital routed by proof",
    body: "BuktiAllocator splits a deposit by zk-proven score. Live: 0.01 MNT routed 81.8% to the proof champion, 0% to the volume champion who actually lost money. MI4 for proven alpha.",
  },
  {
    icon: "grid",
    title: "The ZK validator for ERC-8004",
    body: "Mantle shipped ERC-8004 with a Validation Registry specified for “ZK-based” validation — and left it empty. BuktiValidator fills it: validationScore reads the proof and answers 85/100, live on-chain.",
  },
  {
    icon: "check",
    title: "Anti-cherry-pick, in-circuit",
    body: "The proof commits to a hash of the wallet's FULL ordered swap set. Drop one losing trade and the on-chain attestation changes. 25/25 commitments verified against the public witness.",
  },
  {
    icon: "link",
    title: "Real data provenance — proven on-chain",
    body: "We cracked Mantle's receipt encoding and proved a real Agni swap log is genuine chain data with a Groth16 proof, verified on-chain (header → receiptsRoot → MPT inclusion), anchored trustlessly via EIP-2935. Prices proven guardian-signed via Pyth.",
  },
  {
    icon: "bot",
    title: "Agent-native",
    body: "An MCP server (5 tools) and Telegram + Discord bots let any AI agent check proof, not promises, before allocating capital — every reply read live from chain.",
  },
];

const CONTRACTS = [
  { label: "BuktiAttestation (batch)", addr: "0x2EB832F24136c24A3B38D4b06D3318C48B618163" },
  { label: "BuktiAttestation v3 (+completeness)", addr: "0x03fA99f0dE08F182b2880Ee12a2194DBF00a0Dbf" },
  { label: "SP1 v6.1.0 Groth16 verifier", addr: "0xb5c7a7761221931ee15c8C70DdF4192a94C49a5A" },
  { label: "BuktiValidator (ERC-8004)", addr: "0xda0cEB552af13f5a096D8aA4E5A9FceB9cf6D8D0" },
  { label: "BuktiAllocator", addr: "0x6DF2F45f9184346C175a94D783F37C77C8f3B8B2" },
  { label: "BuktiProvenance (swap-log proof)", addr: "0xa4d6d9932B19f9B03D0439264F1188F39F8522f0" },
];

const short = (a: string) => `${a.slice(0, 8)}…${a.slice(-6)}`;

export default function Landing() {
  const [stats, setStats] = useState<{ scanned: number; proven: number; legs: number } | null>(null);

  useEffect(() => {
    fetch("/board-data.json")
      .then((r) => r.json())
      .then((b) => setStats({ scanned: b.meta.walletsScanned, proven: b.meta.walletsProven, legs: b.meta.totalLegs }))
      .catch(() => {});
  }, []);

  const s = stats ?? { scanned: 382, proven: 105, legs: 1818 };

  return (
    <>
      <Nav />
      <div className="landing">
        <section className="hero">
          <span className="hero-eyebrow">zk-verified · on Mantle</span>
          <h1 className="hero-title">
            Trading track records you <span className="grad">don&apos;t have to trust</span>.
          </h1>
          <p className="hero-tag">Volume crowns the wrong winners. Proof doesn&apos;t.</p>
          <p className="hero-sub">
            The un-gameable way to screen smart-money wallets and AI agents. Bukti reconstructs a
            trader&apos;s risk-adjusted track record from raw Mantle swaps <strong>inside an SP1
            zero-knowledge VM</strong> and attests it on-chain — and unlike a screenshot, or a proof
            of the PnL <em>math</em> alone, it proves every trade is <strong>genuine Mantle chain
            data</strong>. Proof-of-real-PnL for the agent economy.
          </p>
          <div className="hero-cta">
            <Link href="/dashboard" className="btn-primary">
              Open the live dashboard →
            </Link>
            <a href={GH} target="_blank" rel="noreferrer" className="btn-ghost">
              View on GitHub ↗
            </a>
          </div>
          <div className="hero-stats">
            <div><b>{s.scanned}</b><span>wallets scanned</span></div>
            <div><b>{s.proven}</b><span>proven on-chain</span></div>
            <div><b>{s.legs}</b><span>raw swap legs</span></div>
            <div><b>1</b><span>Groth16 proof</span></div>
            <div><b>$0</b><span>proving cost</span></div>
          </div>
        </section>

        <section className="band">
          <div className="band-inner">
            <h2 className="sec-title">The problem</h2>
            <p className="sec-lead">
              Every AI trading agent claims a great track record. None can prove it. Screenshots are
              edited, dashboards say &ldquo;trust me,&rdquo; and on-chain reputation is self-reported.
              When you rank by volume — the metric everyone games — the busiest wallet wins, not the
              best one.
            </p>
            <div className="big-insight">
              Across the ClawHack cohort, volume predicts proven skill only{" "}
              <span className="grad">36% of the time</span>. The volume champion ranks{" "}
              <span className="grad">#17</span> by proven risk-adjusted score.
            </div>
          </div>
        </section>

        <section className="band alt">
          <div className="band-inner">
            <h2 className="sec-title">How it works</h2>
            <div className="steps3">
              <div className="step3">
                <div className="step3-n">1</div>
                <h3>Raw Mantle swaps</h3>
                <p>Pull a wallet&apos;s real swap logs from Agni, priced at their historical Pyth price. Nothing self-reported.</p>
              </div>
              <div className="step3">
                <div className="step3-n">2</div>
                <h3>Reconstruct in a zkVM</h3>
                <p>Cost-basis PnL → risk-adjusted score, drawdown, ROI — computed entirely inside an SP1 zkVM in deterministic integer math.</p>
              </div>
              <div className="step3">
                <div className="step3-n">3</div>
                <h3>One proof, on-chain</h3>
                <p>A single Groth16 proof attests the whole cohort, verified by a real SP1 verifier on Mantle. The proof is the product.</p>
              </div>
            </div>
          </div>
        </section>

        <section className="band">
          <div className="band-inner">
            <h2 className="sec-title">A primitive, not a dashboard</h2>
            <p className="sec-lead">
              Six things other Mantle apps build on — every one live and verifiable on-chain.
            </p>
            <div className="features">
              {FEATURES.map((f) => (
                <div className="feature" key={f.title}>
                  <div className="feature-icon"><Icon name={f.icon} /></div>
                  <h3>{f.title}</h3>
                  <p>{f.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="band alt">
          <div className="band-inner">
            <h2 className="sec-title">Don&apos;t trust us — check</h2>
            <p className="sec-lead">
              Every contract is deployed and source-verified on Mantle Sepolia. Invalid proofs
              revert with <code>WrongVerifierSelector</code>.
            </p>
            <div className="contracts">
              {CONTRACTS.map((c) => (
                <a key={c.addr} className="contract" href={`${EXPLORER}/address/${c.addr}#code`} target="_blank" rel="noreferrer">
                  <span className="contract-label">{c.label}</span>
                  <span className="contract-addr mono">{short(c.addr)} ↗</span>
                </a>
              ))}
            </div>
          </div>
        </section>

        <section className="cta-final">
          <h2>See the proof move money.</h2>
          <p>Re-rank 105 agents, catch the volume champion, route capital by proof — live on Mantle.</p>
          <Link href="/dashboard" className="btn-primary big">
            Open the dashboard →
          </Link>
        </section>

        <footer className="land-footer">
          Built on Mantle for The Turing Test Hackathon 2026 ·{" "}
          <a href={GH} target="_blank" rel="noreferrer">GitHub</a> ·{" "}
          <Link href="/doc">Docs</Link> ·{" "}
          <Link href="/dashboard">Dashboard</Link>
        </footer>
      </div>
    </>
  );
}
