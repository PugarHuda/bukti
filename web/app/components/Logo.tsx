/** Bukti mark — a magnifier (investigation) whose lens has found proof (a check).
 *  Evidence + scrutiny: the detective metaphor for proof-of-real-PnL. */
export default function Logo({ size = 22, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <circle cx="10" cy="10" r="6.5" stroke="currentColor" strokeWidth="2" />
      <path d="M14.8 14.8 L21 21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M6.9 10.3 L9.1 12.5 L13.2 8" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
