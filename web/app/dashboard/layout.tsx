"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, useBoard } from "./lib";

const SECTIONS = [
  {
    title: "Explore the cohort",
    items: [
      { href: "/dashboard", label: "Overview", icon: "grid" },
      { href: "/dashboard/leaderboard", label: "Leaderboard", icon: "ranking" },
      { href: "/dashboard/verify", label: "Verify wallet", icon: "search" },
    ],
  },
  {
    title: "Verify the proof",
    items: [
      { href: "/dashboard/authenticity", label: "Catch a cheater", icon: "alert" },
      { href: "/dashboard/proof", label: "Proof layer", icon: "shield" },
      { href: "/dashboard/trust", label: "Trust boundary", icon: "check" },
    ],
  },
  {
    title: "Act on proof",
    items: [
      { href: "/dashboard/allocate", label: "Capital by proof", icon: "coins" },
      { href: "/dashboard/agent", label: "Agent copilot", icon: "bot" },
    ],
  },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const { live } = useBoard();
  return (
    <div className="ds-shell">
      <aside className="ds-rail">
        <Link href="/" className="ds-logo">Bukti<span className="zk">zk</span></Link>
        <nav className="ds-rail-nav">
          {SECTIONS.map((sec) => (
            <div key={sec.title} className="ds-rail-group">
              <span className="ds-rail-section">{sec.title}</span>
              {sec.items.map((n) => {
                const on = n.href === "/dashboard" ? path === n.href : path?.startsWith(n.href);
                return (
                  <Link key={n.href} href={n.href} className={`ds-rail-item ${on ? "on" : ""}`}>
                    <Icon name={n.icon} /> {n.label}
                  </Link>
                );
              })}
            </div>
          ))}
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
