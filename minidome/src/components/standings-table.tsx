import type { StandingRow } from "@/lib/standings/standings";
import { Avatar } from "@/components/ui";

const BADGE: Record<number, string> = {
  1: "tile-gold",
  2: "bg-gradient-to-br from-[#eef1f5] to-[#a8b0bd] text-charcoal",
  3: "bg-gradient-to-br from-[#f5c49c] to-[#c47a48] text-charcoal",
};

function Movement({ n }: { n: number | null }) {
  if (n === null || n === 0) return <span className="text-[10px] font-bold text-gray-400">–</span>;
  return n > 0 ? <span className="text-[10px] font-black text-emerald-700">▲{n}</span> : <span className="text-[10px] font-black text-red-600">▼{-n}</span>;
}

/**
 * Leaderboard that fits a phone without sideways scrolling (Sideout's standings table):
 * medal rank badges, rank movement, the selected round's points, total with a bar, points behind.
 */
export function StandingsTable({ rows, names, me, roundLabel, roundOf, showTotal = true }: {
  rows: StandingRow[];
  names: ReadonlyMap<string, string>;
  me: string;
  /** Column showing one round's points (e.g. "WC"). */
  roundLabel?: string;
  roundOf?: (r: StandingRow) => number;
  showTotal?: boolean;
}) {
  const cols = roundLabel && showTotal ? "grid-cols-[1.75rem_minmax(0,1fr)_3.2rem_4.2rem]" : "grid-cols-[1.75rem_minmax(0,1fr)_4.2rem]";
  const value = (r: StandingRow) => (showTotal ? r.total : roundOf ? roundOf(r) : r.total);
  const max = Math.max(1, ...rows.map(value));
  return (
    <div>
      <div className={`grid ${cols} items-center gap-2 border-b border-gray-100 px-3 py-2 text-[10px] font-extrabold uppercase tracking-wider text-gray-500`}>
        <span className="text-center">#</span>
        <span>Participant</span>
        {roundLabel && showTotal ? <span className="text-right">{roundLabel}</span> : null}
        <span className="text-right">{showTotal ? "Total" : roundLabel ?? "Pts"}</span>
      </div>
      <ol>
        {rows.map((r) => {
          const mine = r.userId === me;
          const name = names.get(r.userId) ?? "Member";
          return (
            <li key={r.userId} className={`grid ${cols} items-center gap-2 border-b border-gray-100 px-3 py-2.5 last:border-0 ${mine ? "bg-gold-400/10" : ""}`}>
              <span className={`mx-auto grid h-7 w-7 place-items-center rounded-full text-[12px] font-black shadow ${BADGE[r.rank] ?? "bg-surface-3 text-gray-600"}`} title={r.tied ? "Tied" : undefined}>{r.tied ? `T${r.rank}` : r.rank}</span>
              <span className="flex min-w-0 items-center gap-2.5">
                <Avatar name={name} size={32} ring={mine ? "#f9c22e" : undefined} />
                <span className="min-w-0">
                  <span className={`block truncate text-[14px] font-extrabold ${mine ? "text-gold-300" : "text-gray-900"}`}>{name}{mine ? " (you)" : ""}</span>
                  <span className="flex items-center gap-1.5 text-[11px] text-gray-500">
                    {showTotal ? <Movement n={r.movement} /> : null}
                    {r.behind > 0 ? <span>{r.behind.toFixed(1)} behind</span> : <span className="font-bold text-gold-300">Leader</span>}
                  </span>
                </span>
              </span>
              {roundLabel && showTotal ? <span className="text-right text-[13px] font-bold tabular-nums text-gray-700">{(roundOf?.(r) ?? 0).toFixed(1)}</span> : null}
              <span className="text-right">
                <span className="block text-[14px] font-extrabold tabular-nums text-gray-900">{value(r).toFixed(1)}</span>
                <span className="mt-1 block h-1 overflow-hidden rounded-full bg-surface-3">
                  <span className="block h-full rounded-full bg-gradient-to-r from-gold-300 to-orange-400" style={{ width: `${Math.max(0, (value(r) / max) * 100)}%` }} />
                </span>
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
