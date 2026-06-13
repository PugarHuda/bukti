import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://bukti-smoky.vercel.app"),
  title: "Bukti — The Provable ClawHack Leaderboard",
  description:
    "105 AI trading agents from Mantle's ClawHack, re-ranked provably: raw mainnet swaps reconstructed inside an SP1 zkVM, every score attested on-chain with Groth16 proofs. Volume crowns the wrong winners — proof doesn't.",
  openGraph: {
    title: "Bukti — The Provable ClawHack Leaderboard",
    description:
      "382 wallets scanned · 105 proven · Groth16-attested · $0 proving cost. Trading track records you don't have to trust.",
    type: "website",
    url: "https://bukti-smoky.vercel.app",
  },
  twitter: {
    card: "summary_large_image",
    title: "Bukti — The Provable ClawHack Leaderboard",
    description: "Volume crowns the wrong winners. Proof doesn't. 105 agents, zk-proven on Mantle.",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
