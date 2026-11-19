/**
 * Mock NFL data provider: plays out a complete SAMPLE postseason in real time, starting at an
 * anchor moment (Wild Card kickoff). Games go scheduled -> live -> halftime -> final on the clock,
 * statistics build up during each game, winners advance with real NFL reseeding, and later
 * rounds appear only once their teams are known. Byes, D/ST scoring, kickers, two-point
 * conversions, turnovers and injuries are all represented.
 *
 * Everything is deterministic (same anchor, same results), so tests can rely on it.
 */
import type { DstStats, OffenseStats } from "@/lib/scoring/engine";
import type { GameStatus } from "@/lib/nfl/rounds";
import { ROUND_NAMES } from "@/lib/nfl/rounds";
import type { NflDataProvider, ProviderGame, ProviderGameStats, ProviderPlayer, ProviderSeason, ProviderTeam } from "@/lib/nfl/provider";
import { GAME_MINUTES, MOCK_INJURIES, MOCK_TEAMS, ROSTER_POSITIONS, ROUND_KICKOFFS, type MockTeam } from "./data";
import { rng } from "./random";

const HOUR = 3600_000;
const DAY = 24 * HOUR;

interface Slot { round: number; conf: "AFC" | "NFC" | "SB"; index: number; home: MockTeam; away: MockTeam; kickoff: Date }

type Event =
  | { kind: "td"; via: "pass" | "rush" | "def" | "st"; scorer: number; t: number; tryKind: "xp" | "xpMiss" | "2pt" | "2ptFail"; tryVia: "pass" | "rush"; tryScorer: number }
  | { kind: "fg"; dist: number; made: boolean; t: number }
  | { kind: "safety"; t: number }
  | { kind: "int"; t: number }
  | { kind: "fumble"; player: number; t: number }
  | { kind: "sack"; t: number }
  | { kind: "block"; t: number };

interface TeamGame { events: Event[]; passYds: number; rushYds: [number, number, number]; recShare: number[]; ypr: number[] }

const teamExt = (t: MockTeam) => `mock-team-${t.abbr}`;
const playerExt = (t: MockTeam, i: number) => `mock-player-${t.abbr}-${i}`;

export class MockProvider implements NflDataProvider {
  readonly id = "mock";
  readonly isSample = true;
  private readonly anchor: Date;
  private readonly now: () => Date;
  private readonly year: number;

  constructor(opts: { anchor: Date; now?: () => Date; year?: number }) {
    this.anchor = opts.anchor;
    this.now = opts.now ?? (() => new Date());
    this.year = opts.year ?? opts.anchor.getUTCFullYear() - (opts.anchor.getUTCMonth() < 6 ? 1 : 0);
  }

  get seasonExternalId() {
    return `mock-season-${this.year}`;
  }

  async getCurrentSeason(): Promise<ProviderSeason> {
    return {
      externalId: this.seasonExternalId,
      year: this.year,
      label: `${this.year} Sample Postseason`,
      rounds: [1, 2, 3, 4].map((r) => ({ round: r, name: ROUND_NAMES[r]!.name, short: ROUND_NAMES[r]!.short })),
    };
  }

  async getPlayoffTeams(): Promise<ProviderTeam[]> {
    return MOCK_TEAMS.map((t) => ({ externalId: teamExt(t), abbreviation: t.abbr, city: t.city, name: t.name, conference: t.conf, primaryColor: t.primary, secondaryColor: t.secondary, seed: t.seed }));
  }

  async getPlayers(): Promise<ProviderPlayer[]> {
    return MOCK_TEAMS.flatMap((t) =>
      t.roster.map((fullName, i) => {
        const [firstName, ...rest] = fullName.split(" ");
        const inj = MOCK_INJURIES[fullName];
        return {
          externalId: playerExt(t, i),
          fullName,
          firstName: firstName ?? fullName,
          lastName: rest.join(" "),
          teamExternalId: teamExt(t),
          position: ROSTER_POSITIONS[i]!,
          jersey: (rng(fullName).int(1, 89)),
          headshotUrl: null,
          injuryStatus: inj?.status ?? null,
          injuryNote: inj?.note ?? null,
          active: true,
        };
      }));
  }

  async getPlayoffSchedule(): Promise<ProviderGame[]> {
    return this.bracket().map((s) => this.toGame(s));
  }

  async getGameStats(gameExternalId: string): Promise<ProviderGameStats> {
    const slot = this.bracket().find((s) => this.gameId(s) === gameExternalId);
    if (!slot) throw new Error(`Unknown game ${gameExternalId}`);
    const game = this.toGame(slot);
    const p = this.progress(slot);
    if (p <= 0) return { game, players: [], dst: [] };
    const plans = this.plans(slot);
    const players = [slot.home, slot.away].flatMap((team, side) => {
      const own = plans[side]!;
      return team.roster.map((_, i) => ({ playerExternalId: playerExt(team, i), teamExternalId: teamExt(team), stats: offenseLine(own, i, p), raw: { source: "mock", progress: p } }))
        .filter((r) => Object.keys(r.stats).length > 0);
    });
    const dst = [slot.home, slot.away].map((team, side) => ({
      teamExternalId: teamExt(team),
      stats: dstLine(plans[side]!, plans[1 - side]!, p),
      raw: { source: "mock", progress: p },
    }));
    return { game, players, dst };
  }

  // ---------------------------------------------------------------- simulation

  private gameId(s: Slot) {
    return `mock-game-${this.year}-R${s.round}-${s.conf}-${s.index}`;
  }

  /** 0 before kickoff, 0..1 while live, 1 when final. */
  private progress(s: Slot): number {
    const ms = this.now().getTime() - s.kickoff.getTime();
    if (ms < 0) return 0;
    return Math.min(1, ms / (GAME_MINUTES * 60_000));
  }

  private status(s: Slot): GameStatus {
    const ms = this.now().getTime() - s.kickoff.getTime();
    if (ms < -60 * 60_000) return "scheduled";
    if (ms < 0) return "pregame";
    const p = this.progress(s);
    if (p >= 1) return "final";
    if (p >= 0.47 && p < 0.55) return "halftime";
    return "live";
  }

  private toGame(s: Slot): ProviderGame {
    const status = this.status(s);
    const p = this.progress(s);
    const [home, away] = this.plans(s);
    const started = p > 0;
    const quarter = Math.min(4, Math.floor(p / 0.25) + 1);
    const left = Math.max(0, Math.round((0.25 - (p % 0.25)) * 4 * 15 * 60));
    return {
      externalId: this.gameId(s),
      round: s.round,
      homeTeamExternalId: teamExt(s.home),
      awayTeamExternalId: teamExt(s.away),
      kickoffAt: s.kickoff.toISOString(),
      status,
      homeScore: started ? teamPoints(home!, p) : null,
      awayScore: started ? teamPoints(away!, p) : null,
      period: status === "final" ? "F" : status === "halftime" ? "Half" : started ? `Q${quarter}` : null,
      clock: status === "live" ? `${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}` : null,
      updatedAt: this.now().toISOString(),
    };
  }

  private winner(s: Slot): MockTeam | null {
    if (this.progress(s) < 1) return null;
    const [h, a] = this.plans(s);
    return teamPoints(h!, 1) > teamPoints(a!, 1) ? s.home : s.away;
  }

  private kickoff(round: number, i: number): Date {
    const k = ROUND_KICKOFFS[round]!;
    return new Date(this.anchor.getTime() + k.dayOffset * DAY + (k.hours[i] ?? 0) * HOUR);
  }

  /** Every game whose two teams are known at this moment. */
  private bracket(): Slot[] {
    const slots: Slot[] = [];
    const bySeed = (conf: "AFC" | "NFC", seed: number) => MOCK_TEAMS.find((t) => t.conf === conf && t.seed === seed)!;
    const wc: Record<string, Slot[]> = { AFC: [], NFC: [] };
    // Wild Card: 2v7, 3v6, 4v5 in each conference; the 1 seeds have a bye.
    const order: Array<["AFC" | "NFC", number]> = [["AFC", 4], ["NFC", 3], ["AFC", 3], ["NFC", 4], ["AFC", 2], ["NFC", 2]];
    order.forEach(([conf, hi], i) => {
      const s: Slot = { round: 1, conf, index: hi, home: bySeed(conf, hi), away: bySeed(conf, 9 - hi), kickoff: this.kickoff(1, i) };
      wc[conf]!.push(s);
      slots.push(s);
    });
    const champs: Partial<Record<"AFC" | "NFC", MockTeam>> = {};
    const confFinals: Slot[] = [];
    (["AFC", "NFC"] as const).forEach((conf, ci) => {
      const winners = wc[conf]!.map((s) => this.winner(s));
      if (winners.some((w) => !w)) return;
      // Divisional: the 1 seed hosts the lowest remaining seed; the other two meet.
      const remaining = [bySeed(conf, 1), ...(winners as MockTeam[])].sort((a, b) => a.seed - b.seed);
      const div: Slot[] = [
        { round: 2, conf, index: 1, home: remaining[0]!, away: remaining[3]!, kickoff: this.kickoff(2, ci) },
        { round: 2, conf, index: 2, home: remaining[1]!, away: remaining[2]!, kickoff: this.kickoff(2, ci + 2) },
      ];
      slots.push(...div);
      const dw = div.map((s) => this.winner(s));
      if (dw.some((w) => !w)) return;
      const [x, y] = (dw as MockTeam[]).sort((a, b) => a.seed - b.seed);
      const cf: Slot = { round: 3, conf, index: 1, home: x!, away: y!, kickoff: this.kickoff(3, ci) };
      slots.push(cf);
      confFinals.push(cf);
      const w = this.winner(cf);
      if (w) champs[conf] = w;
    });
    if (champs.AFC && champs.NFC) {
      const afcHome = this.year % 2 === 0;
      slots.push({ round: 4, conf: "SB", index: 1, home: afcHome ? champs.AFC : champs.NFC, away: afcHome ? champs.NFC : champs.AFC, kickoff: this.kickoff(4, 0) });
    }
    return slots;
  }

  private planCache = new Map<string, [TeamGame, TeamGame]>();

  /** The full-game script for both teams (home first), adjusted so there is a winner. */
  private plans(s: Slot): [TeamGame, TeamGame] {
    const id = this.gameId(s);
    const hit = this.planCache.get(id);
    if (hit) return hit;
    const home = teamGame(`${id}:${s.home.abbr}`, s.home);
    const away = teamGame(`${id}:${s.away.abbr}`, s.away);
    const homeShouldWin = rng(id).chance(0.5 + (s.away.seed - s.home.seed) * 0.04);
    const [w, l] = homeShouldWin ? [home, away] : [away, home];
    let guard = 0;
    while (teamPoints(w, 1) <= teamPoints(l, 1) && guard++ < 20) w.events.push({ kind: "fg", dist: 30 + guard, made: true, t: 0.97 + guard * 0.001 });
    const out: [TeamGame, TeamGame] = [home, away];
    this.planCache.set(id, out);
    return out;
  }
}

// ---------------------------------------------------------------- one team's game script

function teamGame(seed: string, team: MockTeam): TeamGame {
  const r = rng(seed);
  const events: Event[] = [];
  const tds = r.pick<number>([[1, 2], [2, 4], [3, 5], [4, 3], [5, 1]]);
  for (let i = 0; i < tds; i++) {
    const via = r.pick<"pass" | "rush" | "def" | "st">([["pass", 60], ["rush", 34], ["def", 4], ["st", 2]]);
    const scorer = via === "pass" ? r.pick<number>([[3, 38], [4, 20], [6, 20], [5, 8], [1, 10], [2, 4]])
      : via === "rush" ? r.pick<number>([[1, 58], [2, 24], [0, team.mobileQb ? 30 : 8]]) : -1;
    const tryKind = r.pick<"xp" | "xpMiss" | "2pt" | "2ptFail">([["xp", 90], ["xpMiss", 3], ["2pt", 4], ["2ptFail", 3]]);
    const tryVia = r.chance(0.6) ? "pass" : "rush";
    const tryScorer = tryVia === "pass" ? r.pick<number>([[3, 4], [6, 3], [4, 2]]) : r.pick<number>([[1, 3], [0, 1]]);
    events.push({ kind: "td", via, scorer, t: r.next(), tryKind, tryVia, tryScorer });
  }
  const fgs = r.pick<number>([[0, 2], [1, 4], [2, 4], [3, 2], [4, 1]]);
  for (let i = 0; i < fgs; i++) {
    const dist = r.pick<number>([[r.int(19, 39), 55], [r.int(40, 49), 30], [r.int(50, 58), 15]]);
    events.push({ kind: "fg", dist, made: r.chance(dist >= 50 ? 0.7 : dist >= 40 ? 0.84 : 0.94), t: r.next() });
  }
  if (r.chance(0.04)) events.push({ kind: "safety", t: r.next() });
  if (r.chance(0.05)) events.push({ kind: "block", t: r.next() });
  const ints = r.pick<number>([[0, 5], [1, 4], [2, 2], [3, 0.4]]);
  for (let i = 0; i < ints; i++) events.push({ kind: "int", t: r.next() });
  if (r.chance(0.35)) events.push({ kind: "fumble", player: r.pick<number>([[0, 3], [1, 4], [3, 2], [6, 1]]), t: r.next() });
  const sacks = r.int(0, 5);
  for (let i = 0; i < sacks; i++) events.push({ kind: "sack", t: r.next() });
  const passTds = events.filter((e) => e.kind === "td" && e.via === "pass").length;
  const weights = [0, 0.09, 0.04, 0.3, 0.2, 0.1, 0.18].map((w) => w * (0.7 + r.next() * 0.6));
  const sum = weights.reduce((a, b) => a + b, 0);
  return {
    events,
    passYds: r.int(165, 320) + passTds * 22,
    rushYds: [team.mobileQb ? r.int(22, 78) : r.int(0, 14), r.int(42, 125), r.int(8, 46)],
    recShare: weights.map((w) => w / sum),
    ypr: [0, 7.5, 7, 13, 12.5, 11, 10.5].map((y) => y * (0.85 + r.next() * 0.3)),
  };
}

const upTo = (e: Event[], p: number) => e.filter((x) => x.t <= p);

function teamPoints(g: TeamGame, p: number): number {
  let pts = 0;
  for (const e of upTo(g.events, p)) {
    if (e.kind === "td") pts += 6 + (e.tryKind === "xp" ? 1 : e.tryKind === "2pt" ? 2 : 0);
    else if (e.kind === "fg" && e.made) pts += 3;
    else if (e.kind === "safety") pts += 2;
  }
  return pts;
}

function offenseLine(g: TeamGame, i: number, p: number): OffenseStats {
  const ev = upTo(g.events, p);
  const s: OffenseStats = {};
  const add = (k: keyof OffenseStats, n: number) => { if (n) s[k] = (s[k] ?? 0) + n; };
  const pos = ROSTER_POSITIONS[i]!;
  const passYds = Math.round(g.passYds * p);
  if (pos === "QB") {
    add("passYds", passYds);
    add("passTd", ev.filter((e) => e.kind === "td" && e.via === "pass").length);
    add("passInt", ev.filter((e) => e.kind === "int").length);
    add("pass2pt", ev.filter((e) => e.kind === "td" && e.tryKind === "2pt" && e.tryVia === "pass").length);
    add("rushYds", Math.round(g.rushYds[0] * p));
  }
  if (pos === "RB") add("rushYds", Math.round(g.rushYds[i]! * p));
  if (pos === "RB" || pos === "WR" || pos === "TE") {
    const yds = Math.round(passYds * (g.recShare[i] ?? 0));
    const tdCatches = ev.filter((e) => e.kind === "td" && e.via === "pass" && e.scorer === i).length;
    add("recYds", yds);
    add("rec", Math.max(tdCatches, Math.round(yds / (g.ypr[i] ?? 10))));
    add("recTd", tdCatches);
    add("rec2pt", ev.filter((e) => e.kind === "td" && e.tryKind === "2pt" && e.tryVia === "pass" && e.tryScorer === i).length);
  }
  add("rushTd", ev.filter((e) => e.kind === "td" && e.via === "rush" && e.scorer === i).length);
  add("rush2pt", ev.filter((e) => e.kind === "td" && e.tryKind === "2pt" && e.tryVia === "rush" && e.tryScorer === i).length);
  add("fumLost", ev.filter((e) => e.kind === "fumble" && e.player === i).length);
  if (pos === "K") {
    add("xpMade", ev.filter((e) => e.kind === "td" && e.tryKind === "xp").length);
    add("xpMissed", ev.filter((e) => e.kind === "td" && e.tryKind === "xpMiss").length);
    for (const e of ev) {
      if (e.kind !== "fg") continue;
      if (!e.made) add("fgMissed", 1);
      else add(e.dist >= 50 ? "fgMade50p" : e.dist >= 40 ? "fgMade40_49" : "fgMade0_39", 1);
    }
  }
  return s;
}

function dstLine(own: TeamGame, opp: TeamGame, p: number): DstStats {
  const ev = upTo(own.events, p);
  const oppEv = upTo(opp.events, p);
  const returnTdPoints = oppEv.filter((e) => e.kind === "td" && (e.via === "def" || e.via === "st"))
    .reduce((n, e) => n + 6 + (e.kind === "td" && e.tryKind === "xp" ? 1 : e.kind === "td" && e.tryKind === "2pt" ? 2 : 0), 0);
  const oppSafeties = oppEv.filter((e) => e.kind === "safety").length * 2;
  return {
    sacks: ev.filter((e) => e.kind === "sack").length,
    ints: oppEv.filter((e) => e.kind === "int").length,
    fumRec: oppEv.filter((e) => e.kind === "fumble").length,
    defTd: ev.filter((e) => e.kind === "td" && e.via === "def").length,
    stTd: ev.filter((e) => e.kind === "td" && e.via === "st").length,
    safeties: ev.filter((e) => e.kind === "safety").length,
    blockedKicks: ev.filter((e) => e.kind === "block").length,
    pointsAllowed: Math.max(0, teamPoints(opp, p) - returnTdPoints - oppSafeties),
  };
}
