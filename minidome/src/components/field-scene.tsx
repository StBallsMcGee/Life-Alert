import Link from "next/link";
import { SubjectAvatar, type TeamLike } from "@/components/team-chip";
import { slotLabel } from "@/lib/league/roster";

export interface FieldPlayer { slot: string; name: string; team?: TeamLike | null; dst?: boolean; points: number | null; locked: boolean }

// Formation (x, y in % of the field; offense drives toward the goalposts on the right).
// Spaced so 34px avatars never overlap on a 390px-wide phone (field is 16:9 there).
const SPOT: Record<string, [number, number]> = {
  K: [9, 50], RB1: [19, 32], RB2: [19, 68], RB: [19, 50], QB: [29, 50], FLEX: [36, 28], TE: [40, 75],
  WR1: [47, 10], WR2: [47, 90], WR: [47, 10], DST: [68, 50],
};

/** The turf: stripes, yard lines, end zones and a goalpost. Pure SVG, scales with the card. */
export function FieldLines({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 200 100" preserveAspectRatio="none" className={className} aria-hidden>
      <defs>
        <pattern id="turf-stripes" width="20" height="100" patternUnits="userSpaceOnUse">
          <rect width="10" height="100" fill="#1f6b3f" /><rect x="10" width="10" height="100" fill="#237645" />
        </pattern>
      </defs>
      <rect width="200" height="100" fill="url(#turf-stripes)" />
      <rect width="14" height="100" fill="#173c85" opacity=".85" />
      <rect x="186" width="14" height="100" fill="#b45309" opacity=".85" />
      <g stroke="rgba(255,255,255,.75)" strokeWidth=".6">
        {Array.from({ length: 9 }, (_, i) => <line key={i} x1={14 + (i + 1) * 17.2} y1="2" x2={14 + (i + 1) * 17.2} y2="98" />)}
        <rect x="0.5" y="0.5" width="199" height="99" fill="none" strokeWidth="1" />
      </g>
      <g stroke="rgba(255,255,255,.55)" strokeWidth=".5">
        {Array.from({ length: 49 }, (_, i) => <line key={i} x1={14 + (i + 1) * 3.44} y1="34" x2={14 + (i + 1) * 3.44} y2="36" />)}
        {Array.from({ length: 49 }, (_, i) => <line key={`b${i}`} x1={14 + (i + 1) * 3.44} y1="64" x2={14 + (i + 1) * 3.44} y2="66" />)}
      </g>
      <text x="7" y="50" fill="rgba(255,255,255,.5)" fontSize="5.5" fontWeight="900" textAnchor="middle" transform="rotate(-90 7 50)" letterSpacing="1">MINIDOME</text>
      <text x="193" y="50" fill="rgba(255,255,255,.5)" fontSize="5.5" fontWeight="900" textAnchor="middle" transform="rotate(90 193 50)" letterSpacing="1">MINIDOME</text>
      <g stroke="#facc15" strokeWidth="1.4" strokeLinecap="round" fill="none">
        <path d="M197 50 H192" /><path d="M192 38 V62" /><path d="M192 38 H189 M192 62 H189" />
      </g>
    </svg>
  );
}

/**
 * Your lineup for the round, lined up in formation on a football field. Players drift as if the
 * play is live and a football spirals between them. Tapping opens the lineup.
 */
export function FieldScene({ href, roundName, points, rank, members, players, status }: {
  href: string; roundName: string; points: number; rank: number | null; members: number; players: FieldPlayer[]; status: string;
}) {
  const used = new Map<string, number>();
  return (
    <Link href={href} className="group relative mx-3 block overflow-hidden rounded-3xl bg-gradient-to-br from-[#7fe0a6] via-[#3fb6e8] to-[#8f7bff] p-3 shadow-xl shadow-black/40 active:opacity-95 sm:mx-0" aria-label="Open your lineup">
      <div className="relative z-10 mb-2 flex items-center gap-3 rounded-2xl bg-charcoal/75 px-3 py-2 backdrop-blur">
        <div className="min-w-0 flex-1">
          <div className="truncate text-[11px] font-extrabold uppercase tracking-wide text-gold-300">{roundName}</div>
          <div className="text-2xl font-black leading-none tabular-nums text-white">{points.toFixed(1)}<span className="ml-1 text-xs font-bold text-gray-500">pts</span></div>
        </div>
        <span className="shrink-0 rounded-full bg-white/10 px-2 py-0.5 text-[9px] font-extrabold uppercase tracking-wide text-gold-300">{status}</span>
        <div className="min-w-0 flex-1 text-right">
          <div className="text-[11px] font-extrabold uppercase tracking-wide text-gray-500">League rank</div>
          <div className="text-2xl font-black leading-none tabular-nums text-white">{rank ? `#${rank}` : "–"}<span className="ml-1 text-xs font-bold text-gray-500">of {members}</span></div>
        </div>
      </div>
      <div className="relative aspect-video w-full overflow-hidden rounded-2xl ring-1 ring-white/30 sm:aspect-[2/1]">
        <FieldLines className="absolute inset-0 h-full w-full" />
        {players.length === 0 ? (
          <div className="absolute inset-0 grid place-items-center">
            <span className="rounded-full bg-charcoal/80 px-4 py-2 text-sm font-extrabold text-white shadow-lg">Tap to pick your players →</span>
          </div>
        ) : null}
        {players.map((p, k) => {
          const base = p.slot.replace(/\d+$/, "");
          const n = (used.get(base) ?? 0) + 1;
          used.set(base, n);
          const [x, y] = SPOT[p.slot] ?? SPOT[base] ?? [20 + k * 6, 50];
          return (
            <div
              key={p.slot}
              className="fb-player absolute -translate-x-1/2 -translate-y-1/2"
              style={{ left: `${x}%`, top: `${y}%`, animationName: `fb-drift-${(k % 3) + 1}`, animationDuration: `${3.8 + ((k * 7) % 10) / 6}s`, animationDelay: `-${(k * 0.37) % 2}s` }}
              title={`${p.name} · ${slotLabel(p.slot)}${p.points !== null ? ` · ${p.points.toFixed(1)} pts` : ""}`}
            >
              <span className={`block rounded-full ring-2 shadow-md shadow-black/40 ${p.locked ? "ring-gold-300" : "ring-white"}`}>
                <SubjectAvatar name={p.name} team={p.team} dst={p.dst} size={34} />
              </span>
              <span className="absolute -bottom-2 left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-charcoal/85 px-1 text-[8px] font-extrabold leading-tight text-white">
                {p.points !== null ? p.points.toFixed(1) : slotLabel(p.slot)}
              </span>
            </div>
          );
        })}
        <span className="fb-ball absolute z-10 h-3 w-5 rounded-[50%] bg-gradient-to-br from-[#c9773f] to-[#6e3a1b] shadow-[0_0_10px_rgba(0,0,0,0.5)] ring-1 ring-[#2a1405]" aria-hidden>
          <span className="absolute inset-x-1 top-1/2 h-px -translate-y-1/2 bg-white/90" />
        </span>
      </div>
    </Link>
  );
}
