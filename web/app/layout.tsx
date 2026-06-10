import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Bukti — Verifiable On-Chain Track Record",
  description:
    "Zero-knowledge proven, risk-adjusted trading track records on Mantle. Nansen tells you a wallet's PnL; Bukti proves its Sharpe ratio on-chain.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
