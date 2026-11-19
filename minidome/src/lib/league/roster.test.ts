import { describe, expect, it } from "vitest";
import { DEFAULT_ROSTER, fitsSlot, slotsFor } from "./roster";

describe("roster", () => {
  it("builds the nine default spots in order", () => {
    expect(slotsFor(DEFAULT_ROSTER)).toEqual(["QB", "RB1", "RB2", "WR1", "WR2", "TE", "FLEX", "DST", "K"]);
  });
  it("FLEX accepts RB, WR and TE only", () => {
    expect(["RB", "WR", "TE"].every((p) => fitsSlot(p as "RB", "FLEX"))).toBe(true);
    expect(fitsSlot("QB", "FLEX")).toBe(false);
    expect(fitsSlot("K", "FLEX")).toBe(false);
    expect(fitsSlot("DST", "FLEX")).toBe(false);
  });
  it("numbered spots take their base position", () => {
    expect(fitsSlot("RB", "RB2")).toBe(true);
    expect(fitsSlot("WR", "RB2")).toBe(false);
    expect(fitsSlot("DST", "DST")).toBe(true);
  });
});
