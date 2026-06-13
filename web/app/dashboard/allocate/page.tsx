"use client";

import { useEffect, useState } from "react";
import { createPublicClient, http, parseAbi } from "viem";
import { useBoard, short } from "../lib";
import { mantleSepolia } from "../../lib/contract";

const EXPLORER = mantleSepolia.blockExplorers.default.url;
const ALLOCATOR = "0x6DF2F45f9184346C175a94D783F37C77C8f3B8B2";
const ALLOC_TX = "0x559503d328df13df28ba8ee61564046307d69f9341af557a5be0db04f9011db0";
// proof champion, runner-up, and the losing volume champion (score -1.316) — these are the
// canonical proven wallets the live BuktiAllocator was deployed against (known scores below).
const CANDIDATES = [
  "0x48f1142afa03a3b710f63c3d9ff56655a58f7b8d",
  "0x0a8577eb450bd1e926325986f2b00d127120342a",
  "0x4cf89f51e090d6dcddbbbe5a458a01e9061823c5",
];
const DEMO_SCORES: Record<string, number> = {
  "0x48f1142afa03a3b710f63c3d9ff56655a58f7b8d": 4.265,
  "0x0a8577eb450bd1e926325986f2b00d127120342a": 0.949,
  "0x4cf89f51e090d6dcddbbbe5a458a01e9061823c5": -1.316,
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
          The losing volume champion (score −1.316) is gated out — <strong>0%</strong>, even at high volume. A real 0.01 MNT allocation already ran on-chain:{" "}
          <a href={`${EXPLORER}/tx/${ALLOC_TX}`} target="_blank" rel="noreferrer">allocation tx ↗</a> ·{" "}
          <a href={`${EXPLORER}/address/${ALLOCATOR}#code`} target="_blank" rel="noreferrer">BuktiAllocator ↗</a>.
          It&apos;s the on-chain analog of Mantle&apos;s MI4 index — but constituents are admitted by a Groth16 proof, not a committee.
        </p>
      </div>
    </>
  );
}
