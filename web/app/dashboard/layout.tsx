"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, useBoard } from "./lib";

const NAV = [
  { href: "/dashboard", label: "Overview", icon: "grid" },
  { href: "/dashboard/authenticity", label: "Catch a cheater", icon: "alert" },
  { href: "/dashboard/leaderboard", label: "Leaderboard", icon: "ranking" },
  { href: "/dashboard/verify", label: "Verify wallet", icon: "search" },
  { href: "/dashboard/agent", label: "Agent copilot", icon: "bot" },
  { href: "/dashboard/proof", label: "Proof layer", icon: "shield" },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const { live } = useBoard();
  return (
    <div className="ds-shell">
      <aside className="ds-rail">
        <Link href="/" className="ds-logo">Bukti<span className="zk">zk</span></Link>
        <nav className="ds-rail-nav">
          {NAV.map((n) => {
            const on = n.href === "/dashboard" ? path === n.href : path?.startsWith(n.href);
            return (
              <Link key={n.href} href={n.href} className={`ds-rail-item ${on ? "on" : ""}`}>
                <Icon name={n.icon} /> {n.label}
              </Link>
            );
          })}
        </nav>
        <div className="ds-rail-foot">
          <span className={`ds-live ${live}`}><span className="dot" /> {live === "live" ? "live · Mantle" : live === "cache" ? "witness cache" : "connecting"}</span>
          <a href="https://github.com/PugarHuda/bukti" target="_blank" rel="noreferrer">GitHub</a>
          <Link href="/">← Home</Link>
        </div>
      </aside>
      <main className="ds-content">{children}</main>
    </div>
  );
}
