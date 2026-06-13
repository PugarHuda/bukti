import Link from "next/link";

export default function Nav() {
  return (
    <nav className="nav">
      <Link href="/" className="nav-brand">
        Bukti<span className="zk">zk</span>
      </Link>
      <div className="nav-links">
        <a href="https://github.com/PugarHuda/bukti" target="_blank" rel="noreferrer">
          GitHub ↗
        </a>
      </div>
    </nav>
  );
}
