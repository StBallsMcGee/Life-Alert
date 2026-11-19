import Link from "next/link";
import type { Round } from "@/lib/data/context";
import { Countdown } from "@/components/local-time";

const STAGE: Record<number, string> = { 1: "tile-teal", 2: "tile-violet", 3: "tile-orange", 4: "tile-gold" };
const ICON: Record<number, string> = { 1: "🎟️", 2: "🛡️", 3: "👑", 4: "🏆" };

/**
 * Playoff-round indicator (Sideout's playoff banner, football rounds): where the postseason is,
 * what's at stake in the round, and a countdown to the next kickoff.
 */
export function RoundBanner({ round, nextKickoff, nextPending, href }: { round: Round; nextKickoff: string | null; nextPending: boolean; href?: string }) {
  const stake = nextPending
    ? "Next round's matchups are set when this round's games finish."
    : round.status === "complete" ? "Round complete. Final points are in."
      : round.status === "in_progress" ? "Picks lock one by one at each player's kickoff."
        : "Set your nine before the first kickoff — or before each player's game.";
  const body = (
    <div className={`relative mx-3 flex items-center gap-3 overflow-hidden rounded-3xl p-4 shadow-xl shadow-black/30 sm:mx-0 ${STAGE[round.round] ?? "tile-blue"}`}>
      <span aria-hidden className="pointer-events-none absolute -right-3 -top-6 text-[96px] leading-none opacity-15">{ICON[round.round] ?? "🏈"}</span>
      <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-white/40 text-2xl shadow-inner" aria-hidden>{ICON[round.round] ?? "🏈"}</span>
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-extrabold uppercase tracking-[0.18em] opacity-70">Playoffs · Round {round.round} of 4</p>
        <p className="text-lg font-black leading-tight">{round.name}</p>
        <p className="text-[12px] font-semibold opacity-80">{stake}</p>
      </div>
      {nextKickoff ? (
        <div className="shrink-0 rounded-2xl bg-charcoal/85 px-3 py-2 text-center text-white">
          <div className="text-[9px] font-extrabold uppercase tracking-wide text-gold-300">Next kickoff</div>
          <div className="text-sm font-black"><Countdown to={nextKickoff} /></div>
        </div>
      ) : null}
    </div>
  );
  return href ? <Link href={href} className="block active:opacity-95">{body}</Link> : body;
}

/** Four steps: Wild Card -> Divisional -> Conference -> Super Bowl. */
export function RoundSteps({ rounds, current, hrefFor }: { rounds: Round[]; current: number | null; hrefFor?: (r: number) => string }) {
  return (
    <ol className="mx-3 grid grid-cols-4 gap-1.5 sm:mx-0">
      {rounds.map((r) => {
        const on = r.round === current;
        const tone = r.status === "complete" ? "bg-surface-3 text-gray-500" : on ? "bg-gold-400 text-charcoal shadow-lg shadow-orange-500/20" : r.status === "pending" ? "bg-surface-2 text-gray-400" : "bg-surface-2 text-gray-800";
        const inner = (
          <span className={`flex flex-col items-center rounded-xl px-1 py-2 text-center transition-colors ${tone}`}>
            <span className="text-[10px] font-black uppercase tracking-wide">{r.short_name}</span>
            <span className="text-[9px] font-bold opacity-75">{r.status === "complete" ? "✓ Done" : r.status === "in_progress" ? "● Live" : r.status === "open" ? "Open" : "TBD"}</span>
          </span>
        );
        return <li key={r.round}>{hrefFor ? <Link href={hrefFor(r.round)}>{inner}</Link> : inner}</li>;
      })}
    </ol>
  );
}
