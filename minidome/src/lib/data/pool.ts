import type { BreakdownLine } from "@/lib/scoring/engine";
import { gameIsLocked } from "@/lib/nfl/rounds";
import type { Game, SeasonView, Team } from "./context";
import type { PlayerRow, PointsRow, SelectionRow } from "./queries";
import { subjectKey } from "./queries";

/** The four availability states from the brief. */
export type Availability = "available" | "selected" | "used" | "unavailable";

export interface PoolEntry {
  key: string;
  playerId: string | null;
  dstTeamId: string | null;
  name: string;
  position: "QB" | "RB" | "WR" | "TE" | "K" | "DST";
  teamId: string | null;
  injury: string | null;
  injuryNote: string | null;
  gameId: string | null;
  opponentId: string | null;
  home: boolean;
  kickoff: string | null;
  gameStatus: string | null;
  seasonPoints: number;
  lastPoints: number | null;
  gamesPlayed: number;
  state: Availability;
  /** e.g. "Used · Wild Card", "Bye", "Eliminated", "IR", "Kicked off", "In your lineup (RB1)". */
  note: string | null;
}

export interface SlotEntry {
  slot: string;
  selectionId: string | null;
  key: string | null;
  locked: boolean;
  points: number | null;
  scoreStatus: string | null;
  breakdown: BreakdownLine[];
}

const OUT = new Set(["Out", "IR", "Suspended"]);

/**
 * Works out every player's (and D/ST's) One-and-Done status for one person, league and round.
 * Display only: the database re-checks everything when a pick is saved.
 */
export function buildPool(args: {
  season: SeasonView; round: number; players: Map<string, PlayerRow>; mySelections: SelectionRow[]; points: PointsRow[]; now?: Date;
}): PoolEntry[] {
  const { season, round, players, mySelections, points } = args;
  const now = args.now ?? new Date();
  const roundGames = season.games.filter((g) => g.round === round && g.status !== "cancelled");
  const gameOf = new Map<string, Game>();
  for (const g of roundGames) { gameOf.set(g.home_team_id, g); gameOf.set(g.away_team_id, g); }
  const eliminated = new Set(season.games.filter((g) => g.round < round && g.status === "final" && g.winner_team_id)
    .map((g) => (g.winner_team_id === g.home_team_id ? g.away_team_id : g.home_team_id)));
  const roundName = new Map(season.rounds.map((r) => [r.round, r.short_name]));
  const mine = new Map(mySelections.map((s) => [subjectKey(s), s]));
  const gameOrder = new Map(season.games.map((g, i) => [g.id, i]));
  const pts = new Map<string, PointsRow[]>();
  for (const p of points) {
    const k = subjectKey(p);
    pts.set(k, [...(pts.get(k) ?? []), p]);
  }

  const entry = (base: Omit<PoolEntry, "gameId" | "opponentId" | "home" | "kickoff" | "gameStatus" | "seasonPoints" | "lastPoints" | "gamesPlayed" | "state" | "note">, active: boolean): PoolEntry => {
    const g = base.teamId ? gameOf.get(base.teamId) : undefined;
    const rows = (pts.get(base.key) ?? []).sort((a, b) => (gameOrder.get(a.game_id) ?? 0) - (gameOrder.get(b.game_id) ?? 0));
    const seasonPoints = Math.round(rows.reduce((s, r) => s + r.points, 0) * 100) / 100;
    const sel = mine.get(base.key);
    let state: Availability = "available";
    let note: string | null = null;
    if (sel && sel.round === round) { state = "selected"; note = `In your lineup (${sel.slot.replace("DST", "D/ST")})`; }
    else if (sel) { state = "used"; note = `${sel.locked ? "Used" : "Reserved"} · ${roundName.get(sel.round) ?? `Round ${sel.round}`}`; }
    else if (!active) { state = "unavailable"; note = "Inactive"; }
    else if (base.injury && OUT.has(base.injury)) { state = "unavailable"; note = base.injury; }
    else if (!g) { state = "unavailable"; note = base.teamId && eliminated.has(base.teamId) ? "Eliminated" : round === 1 ? "Bye" : "Not playing"; }
    else if (gameIsLocked(g, now)) { state = "unavailable"; note = "Kicked off"; }
    return {
      ...base,
      gameId: g?.id ?? null,
      opponentId: g ? (g.home_team_id === base.teamId ? g.away_team_id : g.home_team_id) : null,
      home: g ? g.home_team_id === base.teamId : false,
      kickoff: g?.kickoff_at ?? null,
      gameStatus: g?.status ?? null,
      seasonPoints,
      lastPoints: rows.length ? rows[rows.length - 1]!.points : null,
      gamesPlayed: rows.length,
      state,
      note,
    };
  };

  const out: PoolEntry[] = [];
  const inPostseason = (teamId: string | null) => !!teamId && (season.playoffTeams.has(teamId) || gameOf.has(teamId));
  for (const p of players.values()) {
    if (!inPostseason(p.team_id)) continue;
    out.push(entry({ key: p.id, playerId: p.id, dstTeamId: null, name: p.full_name, position: p.position as PoolEntry["position"], teamId: p.team_id, injury: p.injury_status, injuryNote: p.injury_note }, p.active));
  }
  for (const t of season.teams.values()) {
    if (!inPostseason(t.id)) continue;
    out.push(entry({ key: `dst:${t.id}`, playerId: null, dstTeamId: t.id, name: `${t.city} ${t.name} D/ST`, position: "DST", teamId: t.id, injury: null, injuryNote: null }, true));
  }
  const rank: Record<Availability, number> = { selected: 0, available: 1, used: 2, unavailable: 3 };
  return out.sort((a, b) => rank[a.state] - rank[b.state] || b.seasonPoints - a.seasonPoints || a.name.localeCompare(b.name));
}

export function teamLike(t: Team | undefined) {
  return t ? { id: t.id, abbreviation: t.abbreviation, city: t.city, name: t.name, primary_color: t.primary_color, secondary_color: t.secondary_color } : null;
}
