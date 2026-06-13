import { createPublicClient, http, parseAbi, isAddress } from "viem";
import { ATTESTATION_ADDRESS } from "../../lib/contract";

// Embeddable, live "Bukti score" badge (shields.io-style) — turns a zk-proven track record into
// a composable artifact any agent profile / GitHub README / site can embed. Reads the on-chain
// attestation live and renders an SVG. Self-contained colors so it works in any context.
//   ![Bukti](https://bukti-smoky.vercel.app/badge/0xWALLET)

const RPC = "https://rpc.sepolia.mantle.xyz";
const ATT_ABI = parseAbi([
  "function getAttestation(address wallet) view returns ((bytes32 anchorBlockHash, uint64 windowStart, uint64 windowEnd, uint32 numTrades, int64 sharpeMilli, uint32 maxDrawdownBps, int64 roiBps, uint64 volumeUsdE6, uint64 attestedAt, address attester, bool exists))",
]);
const client = createPublicClient({ transport: http(RPC) });

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
// rough monospace-ish width per char at 11px
const tw = (s: string) => s.length * 6.6 + 12;

function svg(value: string, color: string): string {
  const label = "bukti";
  const lw = tw(label), vw = tw(value), w = lw + vw, h = 20;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" role="img" aria-label="bukti: ${esc(value)}">
  <linearGradient id="s" x2="0" y2="100%"><stop offset="0" stop-color="#fff" stop-opacity=".1"/><stop offset="1" stop-opacity=".1"/></linearGradient>
  <clipPath id="r"><rect width="${w}" height="${h}" rx="4" fill="#fff"/></clipPath>
  <g clip-path="url(#r)">
    <rect width="${lw}" height="${h}" fill="#1f2630"/>
    <rect x="${lw}" width="${vw}" height="${h}" fill="${color}"/>
    <rect width="${w}" height="${h}" fill="url(#s)"/>
  </g>
  <g fill="#fff" text-anchor="middle" font-family="ui-monospace,SFMono-Regular,Menlo,monospace" font-size="11">
    <text x="${lw / 2}" y="14">${label}</text>
    <text x="${lw + vw / 2}" y="14">${esc(value)}</text>
  </g>
</svg>`;
}

export async function GET(_req: Request, { params }: { params: Promise<{ addr: string }> }) {
  const { addr } = await params;
  const headers = { "content-type": "image/svg+xml", "cache-control": "public, max-age=300, s-maxage=300" };
  if (!isAddress(addr)) {
    return new Response(svg("invalid address", "#9aa4b0"), { headers });
  }
  try {
    const a = await client.readContract({ address: ATTESTATION_ADDRESS, abi: ATT_ABI, functionName: "getAttestation", args: [addr as `0x${string}`] });
    if (!a.exists) {
      return new Response(svg("unverified", "#9aa4b0"), { headers });
    }
    const score = Number(a.sharpeMilli) / 1000;
    const color = score >= 0 ? "#0e9f6e" : "#dc2626";
    return new Response(svg(`score ${score.toFixed(2)} ✓`, color), { headers });
  } catch {
    return new Response(svg("offline", "#9aa4b0"), { headers: { ...headers, "cache-control": "no-store" } });
  }
}
