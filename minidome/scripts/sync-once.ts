/** One NFL data sync against DATABASE_URL.  Usage: npm run sync:once [-- --full] */
import pg from "pg";
import { runSync } from "../src/lib/sync/run";
import { providerFromEnv } from "../src/lib/sync/provider-factory";

async function main() {
  const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();
  try {
    const r = await runSync(db, await providerFromEnv(db), { full: process.argv.includes("--full") });
    console.log(JSON.stringify(r, null, 2));
    process.exitCode = r.ok ? 0 : 1;
  } finally {
    await db.end();
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
