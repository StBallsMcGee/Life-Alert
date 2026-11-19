import { sumPoints } from "@/lib/scoring/engine";

export interface RoundScore { userId: string; round: number; points: number }

export interface StandingRow {
  userId: string;
  rank: number;
  /** True when the rank is shared after every tie-breaker. */
  tied: boolean;
  total: number;
  byRound: Record<number, number>;
  behind: number;
  /** Change in rank since the end of the previous round (positive = moved up). */
  movement: number | null;
}

/**
 * Cumulative standings. Ties are broken by the highest score in the latest round, then the one
 * before it, and so on (Super Bowl, Conference Championship, Divisional, Wild Card). Anyone
 * still level shares the position.
 */
export function standings(userIds: readonly string[], scores: readonly RoundScore[], rounds: readonly number[], uptoRound?: number): StandingRow[] {
  const considered = [...rounds].filter((r) => uptoRound === undefined || r <= uptoRound).sort((a, b) => a - b);
  const rows = userIds.map((userId) => {
    const byRound: Record<number, number> = {};
    for (const r of considered) byRound[r] = sumPoints(scores.filter((s) => s.userId === userId && s.round === r).map((s) => s.points));
    return { userId, byRound, total: sumPoints(Object.values(byRound)) };
  });
  const latestFirst = [...considered].reverse();
  const cmp = (a: (typeof rows)[number], b: (typeof rows)[number]) => {
    if (b.total !== a.total) return b.total - a.total;
    for (const r of latestFirst) if ((b.byRound[r] ?? 0) !== (a.byRound[r] ?? 0)) return (b.byRound[r] ?? 0) - (a.byRound[r] ?? 0);
    return 0;
  };
  const sorted = [...rows].sort((a, b) => cmp(a, b) || a.userId.localeCompare(b.userId));
  const leader = sorted[0]?.total ?? 0;
  const result: StandingRow[] = [];
  sorted.forEach((r, i) => {
    const prev = sorted[i - 1];
    const sameAsPrev = prev && cmp(prev, r) === 0;
    const rank = sameAsPrev ? result[i - 1]!.rank : i + 1;
    const next = sorted[i + 1];
    result.push({ userId: r.userId, rank, tied: !!sameAsPrev || (!!next && cmp(r, next) === 0), total: r.total, byRound: r.byRound, behind: sumPoints([leader, -r.total]), movement: null });
  });
  // Movement versus the standings before the most recent round.
  if (considered.length > 1) {
    const before = standings(userIds, scores, considered.slice(0, -1));
    const prevRank = new Map(before.map((b) => [b.userId, b.rank]));
    for (const r of result) r.movement = (prevRank.get(r.userId) ?? r.rank) - r.rank;
  }
  return result;
}

/** One round on its own (ties share the rank). */
export function roundStandings(userIds: readonly string[], scores: readonly RoundScore[], round: number): StandingRow[] {
  return standings(userIds, scores, [round]).map((r) => ({ ...r, movement: null }));
}
