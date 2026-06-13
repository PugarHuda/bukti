"use client";

import { useEffect, useState } from "react";
import { createPublicClient, http, parseAbi } from "viem";
import { useBoard, short } from "../lib";
import { mantleSepolia } from "../../lib/contract";

const EXPLORER = mantleSepolia.blockExplorers.default.url;
const ALLOCATOR = "0xa2D2E87367A5cEB1c10B02952fD1e5d375b4b5B9"; // bound to the 105-wallet attestation
const ALLOC_TX = "0x5c8db66770d97717424c728384e26195332c72bfb6e69a84b65fbbdd3ad52803";
// Straight from the live leaderboard: the proof champion, a mid proven trader, and the volume
// champion (77 swaps) whose net-losing score gates it to 0%. All three are in the 105 cohort.
const CANDIDATES = [
  "0xe860d04da18b968efcbbbee4133ec12fe0f14dc3",
  "0xa29ad6ea6209502e53518d17b5b75c76cc74966c",
  "0xc0db4a2fee7c7f9a148d2e1dd598506b1f3b60bd",
];
const DEMO_SCORES: Record<string, number> = {
  "0xe860d04da18b968efcbbbee4133ec12fe0f14dc3": 4.685,
  "0xa29ad6ea6209502e53518d17b5b75c76cc74966c": 0.997,
  "0xc0db4a2fee7c7f9a148d2e1dd598506b1f3b60bd": -0.077,
};

const client = createPublicClient({ transport: http("https://rpc.sepolia.mantle.xyz") });
const ABI = parseAbi([
  "function previewAllocation(address[] candidates, uint256 amount) view returns (uint256[] weights, uint256[] amounts, uint256 eligible)",
]);

export default function AllocatePage() {
  const { board } = useBoard();
  const [amount, setAmount] = useState("10");
  const [rows, setRows] = useState<{ wallet: string; weight: bigint; share: bigint }[] | null>(null);

  async function preview(amt: string) {
    const wei = BigInt(Math.max(0, Math.floor(Number(amt) * 1e6))) * 10n ** 12n; // amt MNT -> wei
    try {
      const [weights, amounts] = await client.readContract({
        address: ALLOCATOR, abi: ABI, functionName: "previewAllocation", args: [CANDIDATES as `0x${string}`[], wei],
      });
      setRows(CANDIDATES.map((w, i) => ({ wallet: w, weight: weights[i], share: amounts[i] })));
    } catch {
      setRows(null);
    }
  }

  useEffect(() => { preview("10"); /* eslint-disable-next-line */ }, []);

  const total = rows ? rows.reduce((s, r) => s + r.share, 0n) : 0n;
  const pct = (v: bigint) => (total > 0n ? Number((v * 10000n) / total) / 100 : 0);
  const mnt = (v: bigint) => (Number(v / 10n ** 9n) / 1e9).toFixed(4);
  const scoreOf = (w: string) => board?.rows.find((r) => r.wallet.toLowerCase() === w.toLowerCase())?.score ?? DEMO_SCORES[w.toLowerCase()];

  return (
    <>
      <div className="ds-page-head">
        <h1 className="ds-page-title">Capital routed by proof</h1>
        <p className="ds-page-sub">
          A proof is inert until it moves money. <strong>BuktiAllocator</strong> splits a deposit across agents weighted by their
          zk-proven score — net-losing or unproven wallets get <strong>zero</strong>. This reads the live on-chain
          <code> previewAllocation</code>; no wallet needed.
        </p>
      </div>

      <div className="card card-pad" style={{ marginBottom: 16 }}>
        <div className="row" style={{ maxWidth: 360 }}>
          <input type="text" value={amount} onChange={(e) => setAmount(e.target.value)} onKeyDown={(e) => e.key === "Enter" && preview(amount)} />
          <button className="go" onClick={() => preview(amount)}>Preview split</button>
        </div>
        <span className="hint" style={{ display: "block", marginTop: 8 }}>amount in MNT — routed by proven score</span>
      </div>

      <div className="card">
        <div className="card-head"><h2 className="card-title">Allocation of {amount} MNT</h2><span className="badge">live · previewAllocation</span></div>
        {!rows && <div className="card-pad"><span className="state">Loading…</span></div>}
        {rows && (
          <div className="card-pad" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {rows.map((r) => {
              const sc = scoreOf(r.wallet);
              const p = pct(r.share);
              const zero = r.weight === 0n;
              return (
                <div key={r.wallet}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 6 }}>
                    <span className="mono">{short(r.wallet)} {sc !== undefined && <span style={{ color: sc >= 0 ? "var(--accent)" : "var(--neg)" }}>· score {sc.toFixed(3)}</span>}{zero && <span style={{ color: "var(--neg)" }}> · below gate → 0</span>}</span>
                    <span className="mono"><strong>{p.toFixed(1)}%</strong> · {mnt(r.share)} MNT</span>
                  </div>
                  <div style={{ height: 8, background: "var(--surface-2)", borderRadius: 4, overflow: "hidden" }}>
                    <div style={{ width: `${p}%`, height: "100%", background: zero ? "var(--neg)" : "var(--accent)" }} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="card card-pad">
        <p className="hint" style={{ margin: 0 }}>
          The volume champion (77 swaps, score −0.077) is gated out — <strong>0%</strong>, despite the most activity. A real 0.01 MNT allocation already ran on-chain:{" "}
          <a href={`${EXPLORER}/tx/${ALLOC_TX}`} target="_blank" rel="noreferrer">allocation tx ↗</a> ·{" "}
          <a href={`${EXPLORER}/address/${ALLOCATOR}#code`} target="_blank" rel="noreferrer">BuktiAllocator ↗</a>.
          It&apos;s the on-chain analog of Mantle&apos;s MI4 index — but constituents are admitted by a Groth16 proof, not a committee.
        </p>
      </div>
    </>
  );
}
