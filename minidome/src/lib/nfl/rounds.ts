/** NFL postseason rounds. The schedule itself always comes from the data provider. */
export const ROUND_NAMES: Record<number, { name: string; short: string }> = {
  1: { name: "Wild Card Weekend", short: "Wild Card" },
  2: { name: "Divisional Round", short: "Divisional" },
  3: { name: "Conference Championships", short: "Conference" },
  4: { name: "Super Bowl", short: "Super Bowl" },
};

export type RoundStatus = "pending" | "open" | "in_progress" | "complete";
export type GameStatus = "scheduled" | "pregame" | "live" | "halftime" | "final" | "postponed" | "suspended" | "cancelled";

/** Same rule as the database function game_is_locked (the database is authoritative). */
export function gameIsLocked(g: { status: string; kickoff_at: string }, now: Date = new Date()): boolean {
  if (["live", "halftime", "final", "suspended", "cancelled"].includes(g.status)) return true;
  if (g.status === "postponed") return false;
  return new Date(g.kickoff_at).getTime() <= now.getTime();
}

export function roundStatusOf(games: Array<{ status: string; kickoff_at: string }>, now: Date = new Date()): RoundStatus {
  if (games.length === 0) return "pending";
  if (games.every((g) => g.status === "final" || g.status === "cancelled")) return "complete";
  if (games.some((g) => gameIsLocked(g, now))) return "in_progress";
  return "open";
}

/**
 * The round people should be looking at: the first one not yet complete that has games; if the
 * next round's matchups aren't set yet, the last completed round (with nextPending = true).
 */
export function currentRound(statusByRound: Map<number, RoundStatus>, rounds: number[]): { round: number | null; nextPending: boolean } {
  const sorted = [...rounds].sort((a, b) => a - b);
  for (const r of sorted) {
    const s = statusByRound.get(r) ?? "pending";
    if (s === "open" || s === "in_progress") return { round: r, nextPending: false };
    if (s === "pending") {
      const prev = sorted.filter((x) => x < r).pop();
      return { round: prev ?? r, nextPending: prev !== undefined };
    }
  }
  return { round: sorted[sorted.length - 1] ?? null, nextPending: false };
}

export const LIVE_STATUSES = new Set(["live", "halftime"]);
