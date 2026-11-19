import { describe, expect, it } from "vitest";
import { roundStandings, standings } from "./standings";

const R = [1, 2, 3, 4];
const s = (userId: string, round: number, points: number) => ({ userId, round, points });

describe("standings", () => {
  it("ranks by cumulative points with points behind first", () => {
    const rows = standings(["a", "b", "c"], [s("a", 1, 82.5), s("b", 1, 76), s("c", 1, 91), s("a", 2, 50), s("b", 2, 60.5), s("c", 2, 30)], R);
    expect(rows).toHaveLength(3);
    expect(rows[0]).toMatchObject({ userId: "b", rank: 1, total: 136.5, behind: 0 });
    expect(rows[1]).toMatchObject({ userId: "a", rank: 2, total: 132.5, behind: 4 });
    expect(rows[2]).toMatchObject({ userId: "c", rank: 3, total: 121, behind: 15.5 });
  });

  it("breaks ties with the Super Bowl score, then earlier rounds", () => {
    const rows = standings(["a", "b"], [s("a", 1, 50), s("a", 4, 30), s("b", 1, 60), s("b", 4, 20)], R);
    expect(rows.map((r) => r.userId)).toEqual(["a", "b"]);
    expect(rows[0]!.tied).toBe(false);
  });

  it("falls back to Conference, Divisional, Wild Card in order", () => {
    const rows = standings(["a", "b"], [s("a", 1, 40), s("a", 2, 10), s("a", 3, 30), s("b", 1, 20), s("b", 2, 30), s("b", 3, 30)], R);
    // Equal totals (80), equal SB (0) and Conference (30): Divisional decides -> b.
    expect(rows.map((r) => r.userId)).toEqual(["b", "a"]);
  });

  it("shares the position when still tied", () => {
    const rows = standings(["a", "b", "c"], [s("a", 1, 10), s("b", 1, 10), s("c", 1, 5)], R);
    expect(rows.map((r) => [r.rank, r.tied])).toEqual([[1, true], [1, true], [3, false]]);
  });

  it("includes members who have not scored", () => {
    const rows = standings(["a", "z"], [s("a", 1, 10)], R);
    expect(rows[1]).toMatchObject({ userId: "z", total: 0, rank: 2 });
  });

  it("reports rank movement since the previous round", () => {
    const rows = standings(["a", "b"], [s("a", 1, 50), s("b", 1, 40), s("b", 2, 30), s("a", 2, 5)], [1, 2]);
    expect(rows.find((r) => r.userId === "b")!.movement).toBe(1);
    expect(rows.find((r) => r.userId === "a")!.movement).toBe(-1);
  });

  it("ranks a single round", () => {
    expect(roundStandings(["a", "b"], [s("a", 1, 50), s("b", 1, 40), s("b", 2, 300)], 1).map((r) => r.userId)).toEqual(["a", "b"]);
  });
});
