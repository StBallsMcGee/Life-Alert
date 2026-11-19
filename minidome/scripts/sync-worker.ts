/**
 * Always-on sync worker (for live games: every 15-30 s). Runs a sync, then sleeps for as long as
 * the adaptive plan says (20 s live ... 24 h offseason), forever. Deploy on any small Node host.
 *   DATABASE_URL=... NFL_DATA_PROVIDER=... npx tsx scripts/sync-worker.ts
 */
import pg from "pg";
import { runSync } from "../src/lib/sync/run";
import { providerFromEnv } from "../src/lib/sync/provider-factory";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
  let failures = 0;
  for (;;) {
    const db = await pool.connect();
    let wait = 60;
    try {
      const r = await runSync(db, await providerFromEnv(db));
      failures = r.ok ? 0 : failures + 1;
      // Back off exponentially on repeated failures (max 15 minutes).
      wait = r.ok ? r.intervalSeconds : Math.min(900, 30 * 2 ** Math.min(failures, 5));
      console.log(new Date().toISOString(), r.ok ? "ok" : "FAILED", r.mode, r.detail, `next in ${wait}s`);
    } catch (e) {
      failures++;
      console.error(new Date().toISOString(), e);
    } finally {
      db.release();
    }
    await sleep(wait * 1000);
  }
}
main();
