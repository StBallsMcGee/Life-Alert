import { describe, expect, it } from "vitest";
import { MockProvider } from "./provider";
import { scoreOffense } from "@/lib/scoring/engine";

const anchor = new Date("2027-01-09T21:30:00Z");
const after = (days: number) => new MockProvider({ anchor, now: () => new Date(anchor.getTime() + days * 86400_000) });

describe("mock provider", () => {
  it("schedules six Wild Card games with two byes", async () => {
    const games = await after(-1).getPlayoffSchedule();
    expect(games).toHaveLength(6);
    expect(games.every((g) => g.round === 1 && g.status === "scheduled")).toBe(true);
    const teams = new Set(games.flatMap((g) => [g.homeTeamExternalId, g.awayTeamExternalId]));
    expect(teams.has("mock-team-KC")).toBe(false);
    expect(teams.has("mock-team-DET")).toBe(false);
  });

  it("plays out the full bracket to a Super Bowl", async () => {
    const games = await after(40).getPlayoffSchedule();
    expect(games.map((g) => g.round).sort()).toEqual([1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 4]);
    expect(games.every((g) => g.status === "final" && g.homeScore !== g.awayScore)).toBe(true);
    // Every team in a later round won its previous game.
    const winners = new Set(games.filter((g) => g.round < 4).map((g) => (g.homeScore! > g.awayScore! ? g.homeTeamExternalId : g.awayTeamExternalId)));
    for (const g of games.filter((x) => x.round >= 3)) {
      expect(winners.has(g.homeTeamExternalId)).toBe(true);
      expect(winners.has(g.awayTeamExternalId)).toBe(true);
    }
  });

  it("is deterministic and builds statistics up during a game", async () => {
    const p = after(0.05); // ~72 minutes into the first game
    const [first] = await p.getPlayoffSchedule();
    expect(first!.status).toBe("live");
    const live = await p.getGameStats(first!.externalId);
    const done = await after(3).getGameStats(first!.externalId);
    const qb = (s: typeof live, team: string) => s.players.find((x) => x.playerExternalId === `mock-player-${team}-0`)!.stats;
    const team = first!.homeTeamExternalId.replace("mock-team-", "");
    expect(qb(live, team).passYds!).toBeLessThan(qb(done, team).passYds!);
    expect(await after(3).getGameStats(first!.externalId)).toEqual(done);
  });

  it("keeps team scores consistent with player and D/ST statistics", async () => {
    const p = after(40);
    for (const g of await p.getPlayoffSchedule()) {
      const st = await p.getGameStats(g.externalId);
      const homeDst = st.dst.find((d) => d.teamExternalId === g.homeTeamExternalId)!.stats;
      const awayDst = st.dst.find((d) => d.teamExternalId === g.awayTeamExternalId)!.stats;
      expect(homeDst.pointsAllowed!).toBeLessThanOrEqual(g.awayScore!);
      expect(awayDst.pointsAllowed!).toBeLessThanOrEqual(g.homeScore!);
      for (const line of st.players) expect(Number.isFinite(scoreOffense(line.stats).points)).toBe(true);
    }
  });

  it("reports injury designations", async () => {
    const players = await after(0).getPlayers();
    expect(players).toHaveLength(14 * 8);
    expect(players.find((x) => x.fullName === "Tank Dell")!.injuryStatus).toBe("IR");
  });
});
