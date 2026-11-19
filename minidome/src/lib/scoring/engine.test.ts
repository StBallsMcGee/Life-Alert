import { describe, expect, it } from "vitest";
import { HALF_PPR, parseRules, pointsAllowedTier, scoreDst, scoreOffense, sumPoints } from "./engine";

describe("Half PPR offense", () => {
  it("matches the brief's Josh Allen example (19.5)", () => {
    const r = scoreOffense({ passYds: 250, passTd: 2, rushYds: 35, passInt: 1 });
    expect(r.points).toBe(19.5);
    expect(r.breakdown.map((b) => [b.key, b.points])).toEqual([["passYds", 10], ["passTd", 8], ["passInt", -2], ["rushYds", 3.5]]);
  });

  it("scores a receiver with half-point receptions and fractional yards exactly", () => {
    // 7 rec (3.5) + 93 yds (9.3) + 1 TD (6) + 2-pt (2) + lost fumble (-2) = 18.8
    expect(scoreOffense({ rec: 7, recYds: 93, recTd: 1, rec2pt: 1, fumLost: 1 }).points).toBe(18.8);
  });

  it("handles odd passing yards without floating-point drift", () => {
    expect(scoreOffense({ passYds: 333 }).points).toBe(13.32);
    expect(scoreOffense({ passYds: 1 }).points).toBe(0.04);
  });

  it("supports negative totals", () => {
    expect(scoreOffense({ passInt: 3, passYds: 20, fumLost: 1 }).points).toBe(-7.2);
  });

  it("scores kickers by distance", () => {
    // 3 + 4 + 5 + 2 XP - 1 missed FG - 1 missed XP = 12
    expect(scoreOffense({ fgMade0_39: 1, fgMade40_49: 1, fgMade50p: 1, xpMade: 2, fgMissed: 1, xpMissed: 1 }).points).toBe(12);
  });

  it("treats missing statistics as zero", () => {
    expect(scoreOffense({}).points).toBe(0);
    expect(scoreOffense({}).breakdown).toEqual([]);
  });
});

describe("D/ST", () => {
  it.each([
    [0, 10], [1, 7], [6, 7], [7, 4], [13, 4], [14, 1], [20, 1], [21, 0], [27, 0], [28, -1], [34, -1], [35, -4], [52, -4],
  ])("points allowed %i -> %i", (pa, pts) => {
    expect(pointsAllowedTier(pa, HALF_PPR.pointsAllowed).points).toBe(pts);
    expect(scoreDst({ pointsAllowed: pa }).points).toBe(pts);
  });

  it("adds every defensive category", () => {
    // 4 sacks + 2 INT(4) + fum rec(2) + def TD(6) + ST TD(6) + safety(2) + block(2) + XP return(2) + 2pt return(2) + PA 10 (4) = 34
    const r = scoreDst({ sacks: 4, ints: 2, fumRec: 1, defTd: 1, stTd: 1, safeties: 1, blockedKicks: 1, xpReturns: 1, twoPtReturns: 1, pointsAllowed: 10 });
    expect(r.points).toBe(34);
    expect(r.breakdown.at(-1)).toMatchObject({ key: "pointsAllowed", label: "Points allowed (7–13)", points: 4 });
  });
});

describe("configuration", () => {
  it("is configurable per league (e.g. full PPR)", () => {
    const fullPpr = parseRules({ ...HALF_PPR, rec: 1 });
    expect(scoreOffense({ rec: 10, recYds: 100 }, fullPpr).points).toBe(20);
    expect(scoreOffense({ rec: 10, recYds: 100 }).points).toBe(15);
  });
  it("ignores unknown or invalid keys", () => {
    expect(parseRules({ passTd: "6", bogus: 3 }).passTd).toBe(4);
    expect(parseRules(null)).toEqual(HALF_PPR);
  });
  it("sums exactly", () => {
    expect(sumPoints([0.1, 0.2, 0.04, null])).toBe(0.34);
  });
});
