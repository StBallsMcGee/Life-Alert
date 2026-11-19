/**
 * THE MINIDOME mark: a gold stadium dome (ribbed, Sideout's gold) sheltering a football, on a
 * strip of turf. Original artwork.
 */
export function MinidomeLogo({ size = 36, className = "" }: { size?: number; className?: string }) {
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} className={className} role="img" aria-label="THE MINIDOME">
      <defs>
        <linearGradient id="md-dome" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#fff3b0" />
          <stop offset="50%" stopColor="#fcd34d" />
          <stop offset="100%" stopColor="#eab308" />
        </linearGradient>
        <linearGradient id="md-ball" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#b8683a" />
          <stop offset="100%" stopColor="#6e3a1b" />
        </linearGradient>
      </defs>
      <path d="M6 46 A26 26 0 0 1 58 46 Z" fill="url(#md-dome)" stroke="#173c85" strokeWidth="3" strokeLinejoin="round" />
      <g fill="none" stroke="#1f5bcc" strokeWidth="2" strokeLinecap="round" opacity=".85">
        <path d="M32 20.5 V46" />
        <path d="M32 20.5 C 22 24, 17 34, 17 46" />
        <path d="M32 20.5 C 42 24, 47 34, 47 46" />
        <path d="M10.5 36 H53.5" />
      </g>
      <ellipse cx="22" cy="28" rx="6" ry="3" fill="#fff" opacity=".35" transform="rotate(-30 22 28)" />
      <rect x="3" y="45" width="58" height="7" rx="3.5" fill="#1f5f39" stroke="#0b2416" strokeWidth="1.5" />
      <g transform="rotate(-24 32 44)">
        <ellipse cx="32" cy="44" rx="13" ry="7.6" fill="url(#md-ball)" stroke="#2a1405" strokeWidth="1.8" />
        <path d="M22.5 44 h19" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" />
        <path d="M27 41.6 v4.8 M30 41.4 v5.2 M33 41.4 v5.2 M36 41.6 v4.8" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" />
        <path d="M21.5 40 q-1.8 4 0 8 M42.5 40 q1.8 4 0 8" stroke="#fff" strokeWidth="1.4" fill="none" strokeLinecap="round" />
      </g>
    </svg>
  );
}

/** Wordmark: small "THE" stacked over a heavy, tracked "MINIDOME". */
export function Wordmark({ className = "", small = false }: { className?: string; small?: boolean }) {
  return (
    <span className={`inline-flex flex-col leading-none ${className}`}>
      <span className={`font-extrabold tracking-[0.35em] text-gold-300 ${small ? "text-[8px]" : "text-[10px]"}`}>THE</span>
      <span className={`font-black italic tracking-tight ${small ? "text-[16px]" : "text-[26px]"}`}>MINIDOME</span>
    </span>
  );
}
