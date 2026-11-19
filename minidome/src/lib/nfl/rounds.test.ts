import { describe, expect, it } from "vitest";
import { currentRound, gameIsLocked, roundStatusOf } from "./rounds";

const now = new Date("2027-01-10T18:00:00Z");
const at = (m: number) => new Date(now.getTime() + m * 60_000).toISOString();

describe("locking", () => {
  it("locks at kickoff", () => {
    expect(gameIsLocked({ status: "scheduled", kickoff_at: at(1) }, now)).toBe(false);
    expect(gameIsLocked({ status: "scheduled", kickoff_at: at(0) }, now)).toBe(true);
    expect(gameIsLocked({ status: "live", kickoff_at: at(30) }, now)).toBe(true); // started early per the feed
  });
  it("keeps a postponed game open until it is rescheduled", () => {
    expect(gameIsLocked({ status: "postponed", kickoff_at: at(-60) }, now)).toBe(false);
  });
  it("holds cancelled and suspended games locked (admin exception required)", () => {
    expect(gameIsLocked({ status: "cancelled", kickoff_at: at(600) }, now)).toBe(true);
    expect(gameIsLocked({ status: "suspended", kickoff_at: at(600) }, now)).toBe(true);
  });
});

describe("rounds", () => {
  it("derives round status from its games", () => {
    expect(roundStatusOf([], now)).toBe("pending");
    expect(roundStatusOf([{ status: "scheduled", kickoff_at: at(10) }], now)).toBe("open");
    expect(roundStatusOf([{ status: "final", kickoff_at: at(-500) }, { status: "scheduled", kickoff_at: at(10) }], now)).toBe("in_progress");
    expect(roundStatusOf([{ status: "final", kickoff_at: at(-500) }, { status: "cancelled", kickoff_at: at(10) }], now)).toBe("complete");
  });
  it("finds the current round", () => {
    expect(currentRound(new Map([[1, "complete"], [2, "open"]]), [1, 2, 3, 4])).toEqual({ round: 2, nextPending: false });
    expect(currentRound(new Map([[1, "complete"]]), [1, 2, 3, 4])).toEqual({ round: 1, nextPending: true });
    expect(currentRound(new Map([[1, "complete"], [2, "complete"], [3, "complete"], [4, "complete"]]), [1, 2, 3, 4])).toEqual({ round: 4, nextPending: false });
    expect(currentRound(new Map(), [1, 2, 3, 4])).toEqual({ round: 1, nextPending: false });
  });
});
