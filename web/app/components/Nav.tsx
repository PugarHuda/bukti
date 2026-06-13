import Link from "next/link";
import Logo from "./Logo";

export default function Nav() {
  return (
    <nav className="nav">
      <Link href="/" className="nav-brand">
        <Logo size={20} className="brand-mark" />
        Bukti<span className="zk">zk</span>
      </Link>
      <div className="nav-links">
        <Link href="/doc">Docs</Link>
        <Link href="/dashboard">Dashboard</Link>
        <a href="https://github.com/PugarHuda/bukti" target="_blank" rel="noreferrer">
          GitHub ↗
        </a>
      </div>
    </nav>
  );
}
