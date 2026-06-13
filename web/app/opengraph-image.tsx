import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "Bukti — The Provable ClawHack Leaderboard";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OG() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          background: "linear-gradient(135deg, #0a0e12 0%, #14202c 100%)",
          color: "#e8eef5",
          padding: "64px 72px",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <div style={{ fontSize: 72, fontWeight: 800, letterSpacing: -2 }}>Bukti</div>
          <div
            style={{
              fontSize: 22,
              fontWeight: 700,
              color: "#3ddc97",
              border: "2px solid #3ddc97",
              borderRadius: 999,
              padding: "6px 18px",
            }}
          >
            zk-verified
          </div>
        </div>

        <div style={{ fontSize: 44, fontWeight: 700, marginTop: 28, lineHeight: 1.2, maxWidth: 980 }}>
          The Provable ClawHack Leaderboard
        </div>
        <div style={{ fontSize: 28, color: "#8da2b8", marginTop: 16, lineHeight: 1.4, maxWidth: 1000 }}>
          105 AI trading agents across 49 Agni + FusionX pools, re-ranked from 1,818 raw Mantle
          swaps inside an SP1 zkVM — every score attested on-chain with Groth16 proofs.
        </div>

        <div style={{ display: "flex", gap: 40, marginTop: "auto" }}>
          {[
            ["382", "scanned"],
            ["105", "proven"],
            ["1,818", "swaps"],
            ["714B", "proof"],
            ["$0", "cost"],
          ].map(([v, k]) => (
            <div key={k} style={{ display: "flex", flexDirection: "column" }}>
              <div style={{ fontSize: 48, fontWeight: 800, color: "#3ddc97" }}>{v}</div>
              <div style={{ fontSize: 20, color: "#8da2b8", textTransform: "uppercase" }}>{k}</div>
            </div>
          ))}
          <div style={{ display: "flex", flexDirection: "column", marginLeft: "auto", justifyContent: "flex-end" }}>
            <div style={{ fontSize: 22, color: "#8da2b8" }}>Volume crowns the wrong winners.</div>
            <div style={{ fontSize: 26, fontWeight: 700, color: "#4aa8ff" }}>Proof doesn&apos;t. · on Mantle</div>
          </div>
        </div>
      </div>
    ),
    size,
  );
}
