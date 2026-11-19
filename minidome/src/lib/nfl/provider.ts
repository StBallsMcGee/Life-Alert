/**
 * The one interface every NFL data provider adapter implements. Each adapter translates its
 * provider's data into these shapes; the sync service, scoring engine and screens only ever
 * see these, so a provider can be replaced without touching them.
 */
import type { DstStats, OffenseStats } from "@/lib/scoring/engine";
import type { GameStatus } from "@/lib/nfl/rounds";

export interface ProviderSeason {
  externalId: string;
  year: number;
  label: string;
  rounds: Array<{ round: number; name: string; short: string }>;
}

export interface ProviderTeam {
  externalId: string;
  abbreviation: string;
  city: string;
  name: string;
  conference: "AFC" | "NFC" | null;
  primaryColor: string;
  secondaryColor: string;
  /** Playoff seed within the conference, if known. */
  seed: number | null;
}

export interface ProviderPlayer {
  externalId: string;
  fullName: string;
  firstName: string;
  lastName: string;
  teamExternalId: string | null;
  position: "QB" | "RB" | "WR" | "TE" | "K";
  jersey: number | null;
  headshotUrl: string | null;
  injuryStatus: string | null;
  injuryNote: string | null;
  active: boolean;
}

export interface ProviderGame {
  externalId: string;
  round: number;
  homeTeamExternalId: string;
  awayTeamExternalId: string;
  /** ISO 8601, UTC. */
  kickoffAt: string;
  status: GameStatus;
  homeScore: number | null;
  awayScore: number | null;
  period: string | null;
  clock: string | null;
  updatedAt: string;
}

export interface ProviderPlayerStats {
  playerExternalId: string;
  teamExternalId: string;
  stats: OffenseStats;
  raw: unknown;
}

export interface ProviderDstStats {
  teamExternalId: string;
  stats: DstStats;
  raw: unknown;
}

export interface ProviderGameStats {
  game: ProviderGame;
  players: ProviderPlayerStats[];
  dst: ProviderDstStats[];
}

export interface NflDataProvider {
  /** Short id stored with every imported record, e.g. "mock" or "sportsdataio". */
  readonly id: string;
  /** True for test data; kept apart from real seasons. */
  readonly isSample: boolean;
  /** The season to follow (the current or most recent postseason). */
  getCurrentSeason(): Promise<ProviderSeason>;
  getPlayoffTeams(seasonExternalId: string): Promise<ProviderTeam[]>;
  getPlayers(seasonExternalId: string): Promise<ProviderPlayer[]>;
  /** Every scheduled postseason game, with live status and score. Games appear once both teams are known. */
  getPlayoffSchedule(seasonExternalId: string): Promise<ProviderGame[]>;
  /** Player and D/ST statistics for one game (live or final). */
  getGameStats(gameExternalId: string): Promise<ProviderGameStats>;
}
