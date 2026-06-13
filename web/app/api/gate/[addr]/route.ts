import { createPublicClient, http, parseAbi, isAddress } from "viem";
import { ATTESTATION_ADDRESS } from "../../../lib/contract";

// x402-style proof-gate: an agent endpoint that returns HTTP 402 ("Proof Required") unless the
// caller's wallet has a zk-PROVEN trading score above the gate. Demonstrates Bukti as
// infrastructure — any paid endpoint / agent action on Mantle can gate itself on a score that's
// provably backed by real on-chain trades, not a self-reported claim.
//   GET /api/gate/0xWALLET  ->  402 (gated) or 200 (unlocked)

const GATE = 0.5; // minimum proven score (per-trade Sharpe-style)
const client = createPublicClient({ transport: http("https://rpc.sepolia.mantle.xyz") });
const ABI = parseAbi([
  "function getAttestation(address wallet) view returns ((bytes32 anchorBlockHash, uint64 windowStart, uint64 windowEnd, uint32 numTrades, int64 sharpeMilli, uint32 maxDrawdownBps, int64 roiBps, uint64 volumeUsdE6, uint64 attestedAt, address attester, bool exists))",
]);

export async function GET(_req: Request, { params }: { params: Promise<{ addr: string }> }) {
  const { addr } = await params;
  if (!isAddress(addr)) {
    return Response.json({ error: "invalid address" }, { status: 400 });
  }
  try {
    const a = await client.readContract({ address: ATTESTATION_ADDRESS, abi: ABI, functionName: "getAttestation", args: [addr as `0x${string}`] });
    const score = a.exists ? Number(a.sharpeMilli) / 1000 : null;
    if (a.exists && score !== null && score >= GATE) {
      return Response.json(
        { unlocked: true, wallet: addr, provenScore: score, gate: GATE, message: `Access granted — proven score ${score.toFixed(3)} clears the ${GATE} gate. Backed by a Groth16 proof on Mantle.` },
        { status: 200 },
      );
    }
    return Response.json(
      {
        error: "Proof Required",
        scheme: "x402-bukti",
        wallet: addr,
        provenScore: score,
        gate: GATE,
        reason: a.exists ? `proven score ${score?.toFixed(3)} is below the ${GATE} gate` : "no zk-verified attestation on-chain for this wallet",
        howToPass: "submit a Bukti Groth16 attestation that raises this wallet's proven score above the gate",
      },
      { status: 402, headers: { "x-402-scheme": "x402-bukti", "x-402-gate": String(GATE) } },
    );
  } catch {
    return Response.json({ error: "verification unavailable" }, { status: 503 });
  }
}
