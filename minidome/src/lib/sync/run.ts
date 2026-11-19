/**
 * NFL data sync: provider -> database -> fantasy points -> locks.
 *
 * Runs server-side only (cron endpoint, worker script, admin "Sync now"), connected as the
 * database owner. One sync is one transaction: either everything it imported is saved, or
 * nothing is. Every statistic change keeps the previous value (stat_revisions) and every points
 * change keeps the previous calculation (fantasy_points_history).
 */
import type pg from "pg";
import type { NflDataProvider, ProviderGame } from "@/lib/nfl/provider";
import { ENGINE_VERSION, parseRules, scoreDst, scoreOffense, type DstStats, type OffenseStats } from "@/lib/scoring/engine";
import { syncPlan, withRetry, type SyncMode } from "./plan";

export interface SyncResult {
  ok: boolean;
  skipped?: boolean;
  mode: SyncMode;
  intervalSeconds: number;
  counts: Record<string, number>;
  unmatched: string[];
  detail: string;
}

type Db = pg.ClientBase;

async function resolve(db: Db, entity: string, provider: string, ext: string): Promise<string | null> {
  const r = await db.query(`select internal_id from external_ids where entity = $1 and provider = $2 and external_id = $3`, [entity, provider, ext]);
  return r.rows[0]?.internal_id ?? null;
}

async function link(db: Db, entity: string, provider: string, ext: string, id: string) {
  await db.query(`insert into external_ids (entity, provider, external_id, internal_id) values ($1, $2, $3, $4) on conflict do nothing`, [entity, provider, ext, id]);
}

const sameJson = (a: unknown, b: unknown) => JSON.stringify(sortKeys(a)) === JSON.stringify(sortKeys(b));
function sortKeys(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(sortKeys);
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v as Record<string, unknown>).filter(([, x]) => x !== 0 && x !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([k, x]) => [k, sortKeys(x)]));
  return v;
}

export async function runSync(db: Db, provider: NflDataProvider, opts: { now?: Date; full?: boolean } = {}): Promise<SyncResult> {
  const now = opts.now ?? new Date();
  const counts: Record<string, number> = { teams: 0, players: 0, games: 0, gamesChanged: 0, statLines: 0, statChanges: 0, points: 0, locked: 0 };
  const unmatched: string[] = [];
  const run = await db.query(`insert into sync_runs (provider, kind, started_at) values ($1, $2, $3) returning id`, [provider.id, opts.full ? "full" : "incremental", now]);
  const runId = run.rows[0].id as number;

  try {
    await db.query("begin");
    const got = await db.query(`select pg_try_advisory_xact_lock(4242) as ok`);
    if (!got.rows[0].ok) {
      await db.query("rollback");
      await db.query(`update sync_runs set finished_at = now(), ok = true, detail = 'Skipped: another sync was running.' where id = $1`, [runId]);
      return { ok: true, skipped: true, mode: "live", intervalSeconds: 20, counts, unmatched, detail: "Another sync was running." };
    }

    // Season and rounds
    const season = await withRetry(() => provider.getCurrentSeason());
    let seasonId = await resolve(db, "season", provider.id, season.externalId);
    if (!seasonId) {
      const s = await db.query(
        `insert into seasons (nfl_season, label, is_sample) values ($1, $2, $3)
         on conflict (nfl_season, is_sample) do update set label = excluded.label returning id`,
        [season.year, season.label, provider.isSample]);
      seasonId = s.rows[0].id as string;
      await link(db, "season", provider.id, season.externalId, seasonId);
    }
    for (const r of season.rounds) {
      await db.query(`insert into playoff_rounds (season_id, round, name, short_name) values ($1, $2, $3, $4)
                      on conflict (season_id, round) do update set name = excluded.name, short_name = excluded.short_name`, [seasonId, r.round, r.name, r.short]);
    }

    // Teams
    const teamIds = new Map<string, string>();
    for (const t of await withRetry(() => provider.getPlayoffTeams(season.externalId))) {
      const r = await db.query(
        `insert into nfl_teams (abbreviation, city, name, conference, primary_color, secondary_color) values ($1, $2, $3, $4, $5, $6)
         on conflict (abbreviation) do update set city = excluded.city, name = excluded.name, conference = excluded.conference,
           primary_color = excluded.primary_color, secondary_color = excluded.secondary_color
         returning id`, [t.abbreviation, t.city, t.name, t.conference, t.primaryColor, t.secondaryColor]);
      teamIds.set(t.externalId, r.rows[0].id);
      await link(db, "team", provider.id, t.externalId, r.rows[0].id);
      await db.query(`insert into season_teams (season_id, team_id, seed) values ($1, $2, $3) on conflict (season_id, team_id) do update set seed = excluded.seed`, [seasonId, r.rows[0].id, t.seed]);
      counts.teams!++;
    }

    // Players (full sync, or the first time)
    const havePlayers = (await db.query(`select count(*)::int as n from external_ids where entity = 'player' and provider = $1`, [provider.id])).rows[0].n > 0;
    if (opts.full || !havePlayers) {
      for (const p of await withRetry(() => provider.getPlayers(season.externalId))) {
        const team = p.teamExternalId ? teamIds.get(p.teamExternalId) ?? (await resolve(db, "team", provider.id, p.teamExternalId)) : null;
        let id = await resolve(db, "player", provider.id, p.externalId);
        const vals = [p.fullName, p.firstName, p.lastName, team, p.position, p.jersey, p.headshotUrl, p.injuryStatus, p.injuryNote, p.active];
        if (id) {
          await db.query(`update nfl_players set full_name = $2, first_name = $3, last_name = $4, team_id = $5, position = $6, jersey_number = $7,
                            headshot_url = $8, injury_status = $9, injury_note = $10, active = $11, updated_at = now() where id = $1`, [id, ...vals]);
        } else {
          id = (await db.query(`insert into nfl_players (full_name, first_name, last_name, team_id, position, jersey_number, headshot_url, injury_status, injury_note, active)
                                values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) returning id`, vals)).rows[0].id as string;
          await link(db, "player", provider.id, p.externalId, id);
        }
        counts.players!++;
      }
    }

    // Schedule, status and scores
    const games = await withRetry(() => provider.getPlayoffSchedule(season.externalId));
    const gameIds = new Map<string, string>();
    const toFetch: Array<{ ext: string; id: string }> = [];
    for (const g of games) {
      const id = await upsertGame(db, provider, seasonId, g, teamIds, counts);
      gameIds.set(g.externalId, id);
      const row = (await db.query(`select status, final_at, (select count(*) from player_game_stats where game_id = $1)::int as lines from nfl_games where id = $1`, [id])).rows[0];
      const recentlyFinal = row.status === "final" && row.final_at && now.getTime() - new Date(row.final_at).getTime() < 3 * 3600_000;
      if (["live", "halftime", "suspended"].includes(row.status) || recentlyFinal || (row.status === "final" && (opts.full || row.lines === 0))) {
        toFetch.push({ ext: g.externalId, id });
      }
    }

    // Statistics
    const changedGames = new Set<string>();
    for (const { ext, id } of toFetch) {
      const st = await withRetry(() => provider.getGameStats(ext));
      for (const line of st.players) {
        const playerId = await resolve(db, "player", provider.id, line.playerExternalId);
        if (!playerId) { unmatched.push(`player ${line.playerExternalId}`); continue; }
        const teamId = teamIds.get(line.teamExternalId) ?? null;
        if (await upsertStats(db, "player", playerId, id, teamId, line.stats, line.raw, provider.id, now)) { changedGames.add(id); counts.statChanges!++; }
        counts.statLines!++;
      }
      for (const line of st.dst) {
        const teamId = teamIds.get(line.teamExternalId) ?? (await resolve(db, "team", provider.id, line.teamExternalId));
        if (!teamId) { unmatched.push(`team ${line.teamExternalId}`); continue; }
        if (await upsertStats(db, "dst", teamId, id, teamId, line.stats, line.raw, provider.id, now)) { changedGames.add(id); counts.statChanges!++; }
        counts.statLines!++;
      }
    }

    // Fantasy points for every game whose statistics or status changed
    const needPoints = await db.query(
      `select distinct g.id from nfl_games g
       where g.season_id = $1 and (g.id = any($2::uuid[]) or exists (
         select 1 from player_game_stats s where s.game_id = g.id and not exists (
           select 1 from fantasy_points fp where fp.game_id = g.id and fp.player_id = s.player_id)))`,
      [seasonId, [...changedGames]]);
    for (const r of needPoints.rows) counts.points! += await recomputeGame(db, r.id);

    counts.locked = (await db.query(`select lock_due_selections() as n`)).rows[0].n;
    await updateSeasonStatus(db, seasonId);
    await notifyRoundResults(db, seasonId);

    const planRows = (await db.query(`select status, kickoff_at, final_at from nfl_games where season_id = $1`, [seasonId])).rows;
    const plan = syncPlan(planRows.map((g) => ({ status: g.status, kickoff_at: new Date(g.kickoff_at).toISOString(), final_at: g.final_at ? new Date(g.final_at).toISOString() : null })), now);
    await db.query(`insert into sync_state (key, value) values ('last_sync', $1) on conflict (key) do update set value = excluded.value, updated_at = now()`,
      [JSON.stringify({ at: now.toISOString(), provider: provider.id, mode: plan.mode })]);
    await db.query("commit");
    const detail = `${counts.games} games, ${counts.statLines} stat lines (${counts.statChanges} changed), ${counts.points} points rows, ${counts.locked} picks locked${unmatched.length ? `, ${unmatched.length} unmatched` : ""}.`;
    await db.query(`update sync_runs set finished_at = now(), ok = true, detail = $2, counts = $3, next_interval_seconds = $4 where id = $1`,
      [runId, detail + (unmatched.length ? ` Unmatched: ${unmatched.slice(0, 20).join(", ")}` : ""), JSON.stringify(counts), plan.intervalSeconds]);
    return { ok: true, mode: plan.mode, intervalSeconds: plan.intervalSeconds, counts, unmatched, detail };
  } catch (e) {
    await db.query("rollback").catch(() => undefined);
    const msg = e instanceof Error ? e.message : String(e);
    await db.query(`update sync_runs set finished_at = now(), ok = false, detail = $2 where id = $1`, [runId, msg]).catch(() => undefined);
    return { ok: false, mode: "live", intervalSeconds: 60, counts, unmatched, detail: msg };
  }
}

async function upsertGame(db: Db, provider: NflDataProvider, seasonId: string, g: ProviderGame, teamIds: Map<string, string>, counts: Record<string, number>): Promise<string> {
  const home = teamIds.get(g.homeTeamExternalId) ?? (await resolve(db, "team", provider.id, g.homeTeamExternalId));
  const away = teamIds.get(g.awayTeamExternalId) ?? (await resolve(db, "team", provider.id, g.awayTeamExternalId));
  if (!home || !away) throw new Error(`Game ${g.externalId}: unknown team`);
  const winner = g.status === "final" && g.homeScore !== null && g.awayScore !== null && g.homeScore !== g.awayScore ? (g.homeScore > g.awayScore ? home : away) : null;
  const id = await resolve(db, "game", provider.id, g.externalId);
  counts.games!++;
  if (!id) {
    const r = await db.query(
      `insert into nfl_games (season_id, round, home_team_id, away_team_id, kickoff_at, status, home_score, away_score, period, clock, winner_team_id, final_at, provider, provider_updated_at)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, case when $6 = 'final' then now() end, $12, $13) returning id`,
      [seasonId, g.round, home, away, g.kickoffAt, g.status, g.homeScore, g.awayScore, g.period, g.clock, winner, provider.id, g.updatedAt]);
    await link(db, "game", provider.id, g.externalId, r.rows[0].id);
    counts.gamesChanged!++;
    return r.rows[0].id;
  }
  const cur = (await db.query(`select * from nfl_games where id = $1`, [id])).rows[0];
  const changed = cur.status !== g.status || cur.home_score !== g.homeScore || cur.away_score !== g.awayScore || new Date(cur.kickoff_at).toISOString() !== new Date(g.kickoffAt).toISOString()
    || cur.period !== g.period || cur.clock !== g.clock || cur.home_team_id !== home || cur.away_team_id !== away;
  if (!changed) return id;
  if (cur.status === "final" && (cur.home_score !== g.homeScore || cur.away_score !== g.awayScore)) {
    await db.query(`insert into stat_revisions (kind, subject_id, game_id, previous, new) values ('game', $1, $1, $2, $3)`,
      [id, JSON.stringify({ home: cur.home_score, away: cur.away_score }), JSON.stringify({ home: g.homeScore, away: g.awayScore })]);
  }
  await db.query(
    `update nfl_games set status = $2, home_score = $3, away_score = $4, kickoff_at = $5, period = $6, clock = $7, winner_team_id = $8,
       home_team_id = $9, away_team_id = $10, final_at = case when $2 = 'final' then coalesce(final_at, now()) else null end,
       provider_updated_at = $11, imported_at = now(), revision = revision + 1 where id = $1`,
    [id, g.status, g.homeScore, g.awayScore, g.kickoffAt, g.period, g.clock, winner, home, away, g.updatedAt]);
  counts.gamesChanged!++;
  return id;
}

/** Saves one stat line; returns true if it is new or different. Keeps the previous version. */
async function upsertStats(db: Db, kind: "player" | "dst", subjectId: string, gameId: string, teamId: string | null, stats: OffenseStats | DstStats, raw: unknown, provider: string, now: Date): Promise<boolean> {
  const table = kind === "player" ? "player_game_stats" : "dst_game_stats";
  const key = kind === "player" ? "player_id" : "team_id";
  const cur = (await db.query(`select stats from ${table} where ${key} = $1 and game_id = $2`, [subjectId, gameId])).rows[0];
  if (cur && sameJson(cur.stats, stats)) return false;
  if (cur) {
    await db.query(`insert into stat_revisions (kind, subject_id, game_id, previous, new, source) values ($1, $2, $3, $4, $5, 'provider')`, [kind, subjectId, gameId, cur.stats, JSON.stringify(stats)]);
    await db.query(`update ${table} set stats = $3, raw = $4, provider_updated_at = $5, imported_at = now(), revision = revision + 1 where ${key} = $1 and game_id = $2`,
      [subjectId, gameId, JSON.stringify(stats), JSON.stringify(raw ?? null), now]);
  } else if (kind === "player") {
    await db.query(`insert into player_game_stats (player_id, game_id, team_id, stats, raw, provider, provider_updated_at) values ($1, $2, $3, $4, $5, $6, $7)`,
      [subjectId, gameId, teamId, JSON.stringify(stats), JSON.stringify(raw ?? null), provider, now]);
  } else {
    await db.query(`insert into dst_game_stats (team_id, game_id, stats, raw, provider, provider_updated_at) values ($1, $2, $3, $4, $5, $6)`,
      [subjectId, gameId, JSON.stringify(stats), JSON.stringify(raw ?? null), provider, now]);
  }
  return true;
}

/**
 * Recalculates fantasy points for one game under every scoring configuration in use for its
 * season. Status: provisional while the game is on; final when it ends; updated if a final
 * score later changes (stat correction). Returns the number of rows written or changed.
 */
export async function recomputeGame(db: Db, gameId: string): Promise<number> {
  const game = (await db.query(`select id, season_id, status from nfl_games where id = $1`, [gameId])).rows[0];
  if (!game) return 0;
  const configs = (await db.query(
    `select id, rules from scoring_configs where id in (select scoring_config_id from leagues where season_id = $1) or id = default_scoring_config()`, [game.season_id])).rows;
  const players = (await db.query(`select player_id, stats, revision from player_game_stats where game_id = $1`, [gameId])).rows;
  const dsts = (await db.query(`select team_id, stats, revision from dst_game_stats where game_id = $1`, [gameId])).rows;
  let n = 0;
  for (const cfg of configs) {
    const rules = parseRules(cfg.rules);
    const write = async (subjectCol: "player_id" | "dst_team_id", subjectId: string, res: { points: number; breakdown: unknown }, revision: number) => {
      const cur = (await db.query(`select points, status, breakdown from fantasy_points where scoring_config_id = $1 and game_id = $2 and ${subjectCol} = $3`, [cfg.id, gameId, subjectId])).rows[0];
      const final = game.status === "final";
      const status = !final ? "provisional" : cur && (cur.status === "final" || cur.status === "updated") && Number(cur.points) !== res.points ? "updated" : cur?.status === "updated" ? "updated" : "final";
      if (cur && Number(cur.points) === res.points && cur.status === status && sameJson(cur.breakdown, res.breakdown)) return;
      await db.query(
        `insert into fantasy_points (scoring_config_id, game_id, ${subjectCol}, points, breakdown, status, stats_revision, engine_version)
         values ($1, $2, $3, $4, $5, $6, $7, $8)
         on conflict (scoring_config_id, game_id, ${subjectCol}) where ${subjectCol} is not null
         do update set points = excluded.points, breakdown = excluded.breakdown, status = excluded.status,
           stats_revision = excluded.stats_revision, engine_version = excluded.engine_version, calculated_at = now()`,
        [cfg.id, gameId, subjectId, res.points, JSON.stringify(res.breakdown), status, revision, ENGINE_VERSION]);
      n++;
    };
    for (const p of players) await write("player_id", p.player_id, scoreOffense(p.stats, rules), p.revision);
    for (const d of dsts) await write("dst_team_id", d.team_id, scoreDst(d.stats, rules), d.revision);
  }
  return n;
}

/**
 * Administrator stat correction (controlled workflow): requires a reason, keeps the previous
 * value, writes the audit log, recalculates points. Standings follow automatically.
 */
export async function correctStats(db: Db, input: { kind: "player" | "dst"; subjectId: string; gameId: string; stats: OffenseStats | DstStats; reason: string; actor: string }) {
  if (input.reason.trim().length < 5) throw new Error("Give a reason for the correction.");
  const table = input.kind === "player" ? "player_game_stats" : "dst_game_stats";
  const key = input.kind === "player" ? "player_id" : "team_id";
  await db.query("begin");
  try {
    const cur = (await db.query(`select stats from ${table} where ${key} = $1 and game_id = $2 for update`, [input.subjectId, input.gameId])).rows[0];
    if (cur) {
      await db.query(`update ${table} set stats = $3, revision = revision + 1, imported_at = now() where ${key} = $1 and game_id = $2`, [input.subjectId, input.gameId, JSON.stringify(input.stats)]);
    } else if (input.kind === "player") {
      await db.query(`insert into player_game_stats (player_id, game_id, stats, provider) values ($1, $2, $3, 'admin')`, [input.subjectId, input.gameId, JSON.stringify(input.stats)]);
    } else {
      await db.query(`insert into dst_game_stats (team_id, game_id, stats, provider) values ($1, $2, $3, 'admin')`, [input.subjectId, input.gameId, JSON.stringify(input.stats)]);
    }
    await db.query(`insert into stat_revisions (kind, subject_id, game_id, previous, new, source, actor, reason) values ($1, $2, $3, $4, $5, 'admin', $6, $7)`,
      [input.kind, input.subjectId, input.gameId, cur ? cur.stats : null, JSON.stringify(input.stats), input.actor, input.reason]);
    await db.query(`insert into audit_log (actor, action, entity, entity_id, before, after, reason) values ($1, 'stats.correct', $2, $3, $4, $5, $6)`,
      [input.actor, input.kind, `${input.subjectId}:${input.gameId}`, cur ? cur.stats : null, JSON.stringify(input.stats), input.reason]);
    await recomputeGame(db, input.gameId);
    // Tell everyone who has this pick that their score changed.
    await db.query(
      `insert into notifications (user_id, type, message, link)
       select distinct s.user_id, 'scoring_correction', 'A stat correction changed ' || subject_label(s.player_id, s.dst_team_id) || '''s points.', '/leagues/' || s.league_id
       from lineup_selections s where s.game_id = $1 and s.status = 'active' and (s.player_id = $2 or s.dst_team_id = $2)`,
      [input.gameId, input.subjectId]);
    await db.query("commit");
  } catch (e) {
    await db.query("rollback");
    throw e;
  }
}

async function updateSeasonStatus(db: Db, seasonId: string) {
  await db.query(
    `update seasons set status = case
       when round_status(id, (select max(round) from playoff_rounds where season_id = $1)) = 'complete' then 'complete'
       when exists (select 1 from nfl_games g where g.season_id = $1 and game_is_locked(g.id)) then 'active'
       else 'upcoming' end
     where id = $1 and status <> 'archived'`, [seasonId]);
}

/** When a round finishes: tell every league member; after the last round, crown the champion. */
async function notifyRoundResults(db: Db, seasonId: string) {
  const rounds = (await db.query(`select round, name from playoff_rounds where season_id = $1 order by round`, [seasonId])).rows;
  const last = rounds[rounds.length - 1]?.round;
  for (const r of rounds) {
    if ((await db.query(`select round_status($1, $2) as s`, [seasonId, r.round])).rows[0].s !== "complete") continue;
    const key = `round_done:${seasonId}:${r.round}`;
    const done = await db.query(`insert into sync_state (key, value) values ($1, '{}') on conflict do nothing returning key`, [key]);
    if (!done.rowCount) continue;
    await db.query(
      `insert into notifications (user_id, type, message, link)
       select m.user_id, 'round_complete', $2 || ' is complete in ' || l.name || '. Check the standings.', '/standings?league=' || l.id
       from leagues l join league_members m on m.league_id = l.id and m.status = 'active' where l.season_id = $1`, [seasonId, r.name]);
    if (r.round === last) {
      await db.query(
        `with totals as (
           select l.id as league_id, l.name, m.user_id, coalesce(sum(fp.points), 0) as total
           from leagues l join league_members m on m.league_id = l.id and m.status = 'active'
           left join lineup_selections s on s.league_id = l.id and s.user_id = m.user_id and s.status = 'active'
           left join fantasy_points fp on fp.game_id = s.game_id and fp.scoring_config_id = l.scoring_config_id and (fp.player_id = s.player_id or fp.dst_team_id = s.dst_team_id)
           where l.season_id = $1 group by l.id, l.name, m.user_id),
         champ as (select distinct on (league_id) league_id, name, user_id from totals order by league_id, total desc)
         insert into notifications (user_id, type, message, link)
         select m.user_id, 'champion', (select display_name from profiles where id = c.user_id) || ' is the ' || c.name || ' champion!', '/standings?league=' || c.league_id
         from champ c join league_members m on m.league_id = c.league_id and m.status = 'active'`, [seasonId]);
      await db.query(`update leagues set status = 'complete' where season_id = $1 and status = 'active'`, [seasonId]);
    }
  }
}

/** Development only: wipes the SAMPLE season's games, stats, points and lineups so it can replay. */
export async function resetSampleSeason(db: Db) {
  await db.query("begin");
  try {
    const seasons = (await db.query(`select id from seasons where is_sample`)).rows.map((r) => r.id);
    if (seasons.length) {
      await db.query(`delete from selection_events where league_id in (select id from leagues where season_id = any($1))`, [seasons]);
      await db.query(`delete from lineups where season_id = any($1)`, [seasons]);
      await db.query(`delete from fantasy_points_history where game_id in (select id from nfl_games where season_id = any($1))`, [seasons]);
      await db.query(`delete from stat_revisions where game_id in (select id from nfl_games where season_id = any($1))`, [seasons]);
      await db.query(`delete from external_ids where entity = 'game' and internal_id in (select id from nfl_games where season_id = any($1))`, [seasons]);
      await db.query(`delete from nfl_games where season_id = any($1)`, [seasons]);
      await db.query(`delete from sync_state where key like 'round_done:%'`);
      await db.query(`update seasons set status = 'upcoming' where id = any($1)`, [seasons]);
      await db.query(`update leagues set status = 'active' where season_id = any($1)`, [seasons]);
    }
    await db.query("commit");
  } catch (e) {
    await db.query("rollback");
    throw e;
  }
}
