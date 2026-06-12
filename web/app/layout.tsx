import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Bukti — The Provable ClawHack Leaderboard",
  description:
    "25 AI trading agents from Mantle's ClawHack, re-ranked provably: raw mainnet swaps reconstructed inside an SP1 zkVM, the whole leaderboard attested on-chain with ONE 714-byte Groth16 proof. Volume crowns the wrong winners — proof doesn't.",
  openGraph: {
    title: "Bukti — The Provable ClawHack Leaderboard",
    description:
      "382 wallets scanned · 25 proven · 1 Groth16 proof · $0 proving cost. Trading track records you don't have to trust.",
    type: "website",
    url: "https://bukti-smoky.vercel.app",
  },
  twitter: {
    card: "summary",
    title: "Bukti — The Provable ClawHack Leaderboard",
    description: "Volume crowns the wrong winners. Proof doesn't. 25 agents, 1 zk proof, on Mantle.",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
