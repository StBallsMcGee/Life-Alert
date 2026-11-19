import { describe, expect, it } from "vitest";
import { ProviderError, syncPlan, withRetry } from "./plan";

const now = new Date("2027-01-10T18:00:00Z");
const at = (h: number) => new Date(now.getTime() + h * 3600_000).toISOString();

describe("adaptive sync", () => {
  it.each([
    [[{ status: "live", kickoff_at: at(-1) }], "live", 20],
    [[{ status: "final", kickoff_at: at(-4), final_at: at(-0.5) }], "recent", 90],
    [[{ status: "scheduled", kickoff_at: at(2) }], "gameday", 300],
    [[{ status: "scheduled", kickoff_at: at(48) }], "approaching", 1800],
    [[{ status: "scheduled", kickoff_at: at(24 * 6) }], "planning", 21600],
    [[{ status: "final", kickoff_at: at(-100), final_at: at(-96) }], "offseason", 86400],
    [[{ status: "scheduled", kickoff_at: at(-0.1) }], "live", 20],
  ] as const)("%j -> %s", (games, mode, s) => {
    expect(syncPlan(games, now)).toEqual({ mode, intervalSeconds: s });
  });
});

describe("retry", () => {
  it("backs off exponentially and succeeds", async () => {
    const waits: number[] = [];
    let n = 0;
    const r = await withRetry(async () => { if (n++ < 2) throw new Error("x"); return "ok"; }, { sleep: async (ms) => { waits.push(ms); } });
    expect(r).toBe("ok");
    expect(waits).toEqual([500, 1000]);
  });
  it("respects Retry-After and stops on permanent errors", async () => {
    const waits: number[] = [];
    let n = 0;
    await withRetry(async () => { if (n++ < 1) throw new ProviderError("429", true, 7000); return 1; }, { sleep: async (ms) => { waits.push(ms); } });
    expect(waits).toEqual([7000]);
    await expect(withRetry(async () => { throw new ProviderError("401", false); }, { sleep: async () => undefined })).rejects.toThrow("401");
  });
});
