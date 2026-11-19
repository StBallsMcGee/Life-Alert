/**
 * Adaptive refresh: how soon the next sync should run, from the state of the schedule.
 * (Targets from the product brief; always subject to the provider's rate limits.)
 */
export type SyncMode = "live" | "recent" | "gameday" | "approaching" | "planning" | "offseason";

export interface PlanGame { status: string; kickoff_at: string; final_at?: string | null }

export const INTERVALS: Record<SyncMode, number> = {
  live: 20,
  recent: 90,
  gameday: 5 * 60,
  approaching: 30 * 60,
  planning: 6 * 3600,
  offseason: 24 * 3600,
};

export function syncPlan(games: readonly PlanGame[], now: Date = new Date()): { mode: SyncMode; intervalSeconds: number } {
  const t = now.getTime();
  const mode = ((): SyncMode => {
    if (games.some((g) => g.status === "live" || g.status === "halftime")) return "live";
    // A game that should be under way but hasn't been reported live yet: watch it closely.
    if (games.some((g) => (g.status === "scheduled" || g.status === "pregame") && new Date(g.kickoff_at).getTime() <= t)) return "live";
    if (games.some((g) => g.status === "final" && g.final_at && t - new Date(g.final_at).getTime() < 2 * 3600_000)) return "recent";
    const upcoming = games.filter((g) => ["scheduled", "pregame", "postponed"].includes(g.status)).map((g) => new Date(g.kickoff_at).getTime() - t);
    if (upcoming.some((ms) => ms <= 3 * 3600_000)) return "gameday";
    if (upcoming.some((ms) => ms <= 72 * 3600_000)) return "approaching";
    if (upcoming.length > 0) return "planning";
    return "offseason";
  })();
  return { mode, intervalSeconds: INTERVALS[mode] };
}

/** Retries a provider call with exponential backoff (respecting Retry-After when given). */
export async function withRetry<T>(fn: () => Promise<T>, opts: { tries?: number; baseMs?: number; sleep?: (ms: number) => Promise<void> } = {}): Promise<T> {
  const tries = opts.tries ?? 4;
  const base = opts.baseMs ?? 500;
  const sleep = opts.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
  let last: unknown;
  for (let i = 0; i < tries; i++) {
    try {
      return await fn();
    } catch (e) {
      last = e;
      if (e instanceof ProviderError && !e.retryable) throw e;
      if (i < tries - 1) await sleep(e instanceof ProviderError && e.retryAfterMs ? e.retryAfterMs : base * 2 ** i);
    }
  }
  throw last;
}

export class ProviderError extends Error {
  constructor(message: string, readonly retryable = true, readonly retryAfterMs: number | null = null) {
    super(message);
  }
}
