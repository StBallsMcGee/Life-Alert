export interface TeamLike { id: string; abbreviation: string; city?: string; name?: string; primary_color: string; secondary_color: string }

/** Team colours used selectively: a small two-tone badge with the abbreviation (no NFL logos). */
export function TeamChip({ team, size = "md" }: { team: TeamLike | undefined | null; size?: "sm" | "md" | "lg" }) {
  if (!team) return <span className="text-gray-400">–</span>;
  const s = size === "lg" ? "h-12 min-w-12 px-2 text-base rounded-2xl" : size === "sm" ? "h-5 min-w-8 px-1 text-[9px] rounded" : "h-7 min-w-10 px-1.5 text-[11px] rounded-lg";
  return (
    <span className={`inline-grid shrink-0 place-items-center font-black tracking-tight text-white shadow-sm ${s}`}
      style={{ background: `linear-gradient(135deg, ${team.primary_color} 0%, ${team.primary_color} 62%, ${team.secondary_color} 62%)` }}
      title={team.city && team.name ? `${team.city} ${team.name}` : team.abbreviation}>
      <span className="drop-shadow-[0_1px_1px_rgba(0,0,0,0.6)]">{team.abbreviation}</span>
    </span>
  );
}

/** Player or D/ST avatar: initials ringed in team colour, or a team badge for a D/ST. */
export function SubjectAvatar({ name, team, dst, size = 40 }: { name: string; team?: TeamLike | null; dst?: boolean; size?: number }) {
  if (dst && team) {
    return (
      <span className="grid shrink-0 place-items-center rounded-full font-black text-white shadow" style={{ width: size, height: size, fontSize: size * 0.3, background: `radial-gradient(circle at 35% 30%, ${team.secondary_color}, ${team.primary_color} 70%)` }} aria-hidden>
        <span className="drop-shadow-[0_1px_1px_rgba(0,0,0,0.7)]">{team.abbreviation}</span>
      </span>
    );
  }
  const parts = name.trim().split(/\s+/);
  const initials = ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1]![0] ?? "" : "")).toUpperCase();
  return (
    <span className="grid shrink-0 place-items-center rounded-full bg-surface-3 font-extrabold text-gray-900" style={{ width: size, height: size, fontSize: size * 0.34, boxShadow: team ? `inset 0 0 0 2.5px ${team.primary_color}, 0 0 0 1.5px ${team.secondary_color}` : undefined }} aria-hidden>
      {initials}
    </span>
  );
}
