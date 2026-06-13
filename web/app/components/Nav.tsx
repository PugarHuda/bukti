"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function Nav() {
  const path = usePathname();
  return (
    <nav className="nav">
      <Link href="/" className="nav-brand">
        Bukti<span className="zk">zk</span>
      </Link>
      <div className="nav-links">
        <Link href="/" className={path === "/" ? "active" : ""}>
          Home
        </Link>
        <Link href="/dashboard" className={path?.startsWith("/dashboard") ? "active" : ""}>
          Dashboard
        </Link>
        <a href="https://github.com/PugarHuda/bukti" target="_blank" rel="noreferrer">
          GitHub ↗
        </a>
        <Link href="/dashboard" className="nav-cta">
          Open app →
        </Link>
      </div>
    </nav>
  );
}
