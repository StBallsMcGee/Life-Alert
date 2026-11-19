/**
 * Database test helpers: every test file gets a brand-new database with the real migrations,
 * filled by the real sync service from the mock provider. Test data lives ONLY here.
 */
import fs from "node:fs";
import path from "node:path";
import pg from "pg";
import { MockProvider } from "@/lib/nfl/mock/provider";
import { runSync } from "@/lib/sync/run";

const ADMIN_URL = process.env.TEST_PG_ADMIN_URL ?? "postgresql://postgres@localhost:54329/postgres";

export async function createTestDb() {
  const name = `minidome_test_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
  const admin = new pg.Client({ connectionString: ADMIN_URL });
  await admin.connect();
  await admin.query(`create database ${name}`);
  await admin.end();
  const url = ADMIN_URL.replace(/\/postgres(\?|$)/, `/${name}$1`);
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  const root = path.resolve(__dirname, "../..");
  await client.query(fs.readFileSync(path.join(root, "tests/db/supabase-auth-stub.sql"), "utf8"));
  for (const f of fs.readdirSync(path.join(root, "supabase/migrations")).sort()) {
    await client.query(fs.readFileSync(path.join(root, "supabase/migrations", f), "utf8"));
  }
  return {
    client,
    url,
    drop: async () => {
      await client.end();
      const a = new pg.Client({ connectionString: ADMIN_URL });
      await a.connect();
      await a.query(`drop database if exists ${name} with (force)`);
      await a.end();
    },
  };
}

/** Runs fn as a signed-in user (or anonymous visitor): role authenticated/anon, Row Level Security on. */
export async function asUser<T>(client: pg.Client, userId: string | null, fn: () => Promise<T>): Promise<T> {
  await client.query("begin");
  try {
    await client.query(`set local role ${userId ? "authenticated" : "anon"}`);
    await client.query(`select set_config('request.jwt.claim.sub', $1, true)`, [userId ?? ""]);
    const r = await fn();
    await client.query("commit");
    return r;
  } catch (e) {
    await client.query("rollback");
    throw e;
  }
}

export async function addUser(client: pg.Client, name: string): Promise<string> {
  const r = await client.query(`insert into auth.users (email, raw_user_meta_data) values ($1, $2) returning id`, [`${name}@example.test`, JSON.stringify({ display_name: name })]);
  return r.rows[0].id;
}

/** Wild Card kicks off one day from the real clock, so nothing is locked by time alone. */
export const ANCHOR = new Date(Math.ceil((Date.now() + 86400_000) / 3600_000) * 3600_000);
/** The mock provider as seen at `minutes` after Wild Card kickoff (negative = before). */
export function providerAt(minutes: number) {
  return new MockProvider({ anchor: ANCHOR, now: () => new Date(ANCHOR.getTime() + minutes * 60_000) });
}
export const DAY = 24 * 60;

export async function syncAt(client: pg.Client, minutes: number, full = false) {
  const r = await runSync(client, providerAt(minutes), { now: new Date(ANCHOR.getTime() + minutes * 60_000), full });
  if (!r.ok) throw new Error(r.detail);
  return r;
}

export async function playerId(client: pg.Client, name: string): Promise<string> {
  return (await client.query(`select id from nfl_players where full_name = $1`, [name])).rows[0].id;
}
export async function teamId(client: pg.Client, abbr: string): Promise<string> {
  return (await client.query(`select id from nfl_teams where abbreviation = $1`, [abbr])).rows[0].id;
}

/** A league with a commissioner and members (joined through a real invitation link). */
export async function makeLeague(client: pg.Client, commissioner: string, members: string[], name = "Test League") {
  const leagueId = await asUser(client, commissioner, async () => (await client.query(`select create_league($1, '', 6) as id`, [name])).rows[0].id as string);
  const token = await asUser(client, commissioner, async () => (await client.query(`select create_invitation($1, 'link', null, 24, null) as t`, [leagueId])).rows[0].t as string);
  for (const m of members) await asUser(client, m, () => client.query(`select join_league($1)`, [token]));
  return { leagueId, token };
}

export async function pick(client: pg.Client, user: string, league: string, round: number, slot: string, sel: { player?: string; dst?: string }) {
  return asUser(client, user, async () => (await client.query(`select set_selection($1, $2, $3, $4, $5) as id`, [league, round, slot, sel.player ?? null, sel.dst ?? null])).rows[0].id as string);
}

export async function roundScores(client: pg.Client, user: string, league: string) {
  return asUser(client, user, async () => (await client.query(`select user_id, round, points from v_round_scores where league_id = $1 order by round, user_id`, [league])).rows);
}
