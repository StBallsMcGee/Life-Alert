import type pg from "pg";
import { MockProvider } from "@/lib/nfl/mock/provider";
import type { NflDataProvider } from "@/lib/nfl/provider";

/**
 * Which provider the sync uses. NFL_DATA_PROVIDER=mock (default) runs the sample postseason;
 * a licensed provider adapter is added in Phase 3 (see docs/DATA_PROVIDER.md).
 * The mock's Wild Card kickoff ("anchor") is stored in sync_state so the admin can restart it.
 */
export async function providerFromEnv(db: pg.ClientBase, now: () => Date = () => new Date()): Promise<NflDataProvider> {
  const name = process.env.NFL_DATA_PROVIDER ?? "mock";
  if (name === "mock") return new MockProvider({ anchor: await mockAnchor(db, now()), now });
  throw new Error(`NFL_DATA_PROVIDER "${name}" is not available yet. Use "mock" until a licensed provider adapter is configured.`);
}

export async function mockAnchor(db: pg.ClientBase, now: Date): Promise<Date> {
  const r = await db.query(`select value from sync_state where key = 'mock_anchor'`);
  if (r.rows[0]) return new Date(r.rows[0].value.at as string);
  // First run: Wild Card kicks off two days from now, on the hour.
  const at = new Date(Math.ceil((now.getTime() + 2 * 86400_000) / 3600_000) * 3600_000);
  await setMockAnchor(db, at);
  return at;
}

export async function setMockAnchor(db: pg.ClientBase, at: Date) {
  await db.query(
    `insert into sync_state (key, value) values ('mock_anchor', $1) on conflict (key) do update set value = excluded.value, updated_at = now()`,
    [JSON.stringify({ at: at.toISOString() })]);
}
