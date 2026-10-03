import type { ReactNode } from "react";

/**
 * Inline SVG art for the African theme: a sun with rays, a savanna horizon
 * with an acacia, a kente-ribbon divider and a petal mandala. Decorative only
 * (aria-hidden); colours match the --afro-* variables in globals.css.
 */

/** A sun disc: concentric rings and 24 rays, drawn to be rotated slowly. */
export function SunDisc({ className = "" }: { className?: string }) {
  const rays = Array.from({ length: 24 }, (_, i) => i * 15);
  return (
    <svg viewBox="-200 -200 400 400" className={className} aria-hidden fill="none">
      <defs>
        <radialGradient id="sun-core" cx="0" cy="0" r="1">
          <stop offset="0" stopColor="#ffe08a" />
          <stop offset="0.55" stopColor="#f5a623" />
          <stop offset="1" stopColor="#d2562b" />
        </radialGradient>
      </defs>
      {rays.map((a) => (
        <path
          key={a}
          d={a % 30 === 0 ? "M0 -128 L9 -176 L-9 -176 Z" : "M0 -128 L5 -156 L-5 -156 Z"}
          transform={`rotate(${a})`}
          fill={a % 30 === 0 ? "#f5a623" : "#e8693a"}
          opacity={a % 30 === 0 ? 0.9 : 0.7}
        />
      ))}
      <circle r="118" stroke="#f5a623" strokeOpacity="0.5" strokeDasharray="3 9" strokeWidth="2" />
      <circle r="104" fill="url(#sun-core)" opacity="0.92" />
      <circle r="84" stroke="#0f0805" strokeOpacity="0.25" strokeWidth="2" />
      <circle r="62" stroke="#0f0805" strokeOpacity="0.2" strokeWidth="2" strokeDasharray="10 8" />
    </svg>
  );
}

/** Savanna horizon: rolling hills and a lone acacia, ending in the page background so it merges into the next section. */
export function Savanna({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 1440 260" preserveAspectRatio="none" className={className} aria-hidden>
      <path d="M0 150 C 180 90 320 170 520 130 C 720 90 860 170 1060 120 C 1220 82 1340 120 1440 100 L1440 260 L0 260 Z" fill="#2a130a" opacity="0.75" />
      <path d="M0 190 C 240 140 420 215 700 170 C 940 132 1160 200 1440 160 L1440 260 L0 260 Z" fill="#1a0d07" />
      <g className="sway" style={{ transformBox: "fill-box" }} transform="translate(1090 62)">
        <path d="M60 126 C60 100 58 86 52 70 M52 70 C40 62 18 64 4 70 M52 70 C44 52 62 40 88 38 M52 70 C62 60 84 56 108 62" stroke="#0f0805" strokeWidth="5" strokeLinecap="round" fill="none" />
        <path d="M-14 66 C -4 48 40 40 70 50 C 96 38 124 44 136 60 C 118 66 88 62 70 66 C 44 74 6 74 -14 66 Z" fill="#0f0805" />
      </g>
      <path d="M0 232 C 300 205 560 250 860 222 C 1100 200 1280 236 1440 214 L1440 260 L0 260 Z" fill="#0f0805" />
    </svg>
  );
}

/** A thin woven ribbon with a diamond in the middle, for dividing sections. */
export function KenteDivider({ children }: { children?: ReactNode }) {
  return (
    <div className="mx-auto flex max-w-[1400px] items-center gap-4 px-4 sm:px-6" aria-hidden>
      <div className="kente-band kente-band-thin flex-1 rounded-full" />
      {children ?? <div className="h-3 w-3 rotate-45 bg-primary" />}
      <div className="kente-band kente-band-thin flex-1 rounded-full" />
    </div>
  );
}

/** Turning petal geometry used behind headings. */
export function Mandala({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="-100 -100 200 200" className={className} aria-hidden fill="none" stroke="currentColor" strokeWidth="1">
      {Array.from({ length: 12 }, (_, i) => (
        <ellipse key={i} rx="46" ry="14" transform={`rotate(${i * 15})`} />
      ))}
      <circle r="96" strokeDasharray="2 6" />
      <circle r="30" />
      <circle r="8" fill="currentColor" />
    </svg>
  );
}
