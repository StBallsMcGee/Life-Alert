/**
 * The launch acceptance tests from the product brief (Part 17), plus the security rules
 * (Part 13), run against a real PostgreSQL database with the real migrations and sync service.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type pg from "pg";
import { scoreOffense } from "@/lib/scoring/engine";
import { correctStats } from "@/lib/sync/run";
import { DAY, addUser, asUser, createTestDb, makeLeague, pick, playerId, providerAt, roundScores, syncAt, teamId } from "./helpers";
import { MOCK_TEAMS } from "@/lib/nfl/mock/data";

let db: Awaited<ReturnType<typeof createTestDb>>;
let c: pg.Client;
const u: Record<string, string> = {};

beforeAll(async () => {
  db = await createTestDb();
  c = db.client;
  for (const n of ["commish", "f1", "f2", "f3", "f4", "f5", "outsider", "late"]) u[n] = await addUser(c, n);
  await syncAt(c, -DAY); // the day before Wild Card: schedule and players imported, nothing started
});
afterAll(async () => db?.drop());

describe("Test 1: league creation and invitations", () => {
  it("a commissioner creates a private league and five friends join", async () => {
    const { leagueId } = await makeLeague(c, u.commish!, [u.f1!, u.f2!, u.f3!, u.f4!, u.f5!], "Six Pack");
    const members = await asUser(c, u.commish!, async () => (await c.query(`select user_id, role from league_members where league_id = $1 and status = 'active'`, [leagueId])).rows);
    expect(members).toHaveLength(6);
    expect(members.filter((m) => m.role === "commissioner")).toHaveLength(1);
  });

  it("refuses a seventh member when the league is full (default size 6)", async () => {
    const { token } = await makeLeague(c, u.commish!, [u.f1!, u.f2!, u.f3!, u.f4!, u.f5!], "Full House");
    await expect(asUser(c, u.late!, () => c.query(`select join_league($1)`, [token]))).rejects.toThrow("full");
  });

  it("enforces expiry, revocation, maximum uses, and email-only invitations", async () => {
    const { leagueId } = await makeLeague(c, u.commish!, [], "Invites");
    const once = await asUser(c, u.commish!, async () => (await c.query(`select create_invitation($1, 'code', null, 24, 1) as t`, [leagueId])).rows[0].t as string);
    expect(once).toMatch(/^[A-Z2-9]{8}$/);
    await asUser(c, u.f1!, () => c.query(`select join_league($1)`, [once.toLowerCase()])); // codes aren't case-sensitive
    await expect(asUser(c, u.f2!, () => c.query(`select join_league($1)`, [once]))).rejects.toThrow("already been used");

    const revoked = await asUser(c, u.commish!, async () => (await c.query(`select create_invitation($1, 'link') as t`, [leagueId])).rows[0].t as string);
    await asUser(c, u.commish!, () => c.query(`select revoke_invitation(id) from league_invitations where league_id = $1 and kind = 'link'`, [leagueId]));
    await expect(asUser(c, u.f2!, () => c.query(`select join_league($1)`, [revoked]))).rejects.toThrow("cancelled");

    const expired = await asUser(c, u.commish!, async () => (await c.query(`select create_invitation($1, 'link') as t`, [leagueId])).rows[0].t as string);
    await c.query(`update league_invitations set expires_at = now() - interval '1 minute' where token_hash = hash_token($1)`, [expired]);
    await expect(asUser(c, u.f2!, () => c.query(`select join_league($1)`, [expired]))).rejects.toThrow("expired");

    const email = await asUser(c, u.commish!, async () => (await c.query(`select create_invitation($1, 'email', 'f3@example.test') as t`, [leagueId])).rows[0].t as string);
    await expect(asUser(c, u.f2!, () => c.query(`select join_league($1)`, [email]))).rejects.toThrow("different email");
    await asUser(c, u.f3!, () => c.query(`select join_league($1)`, [email]));

    // Only a hash is stored, never the secret.
    const stored = await c.query(`select token_hash from league_invitations where league_id = $1`, [leagueId]);
    expect(stored.rows.every((r) => r.token_hash.length === 64 && r.token_hash !== once)).toBe(true);
    await expect(asUser(c, u.f1!, () => c.query(`select create_invitation($1, 'link')`, [leagueId]))).rejects.toThrow("Only the commissioner");
  });
});

describe("One-and-Done core rules", () => {
  let league: string;
  let league2: string;
  let allen: string;
  let kcQb: string;
  /** A team that will win its Wild Card game (known in advance from the deterministic mock). */
  let winner: (typeof MOCK_TEAMS)[number];

  beforeAll(async () => {
    const wc = (await providerAt(4 * DAY).getPlayoffSchedule()).filter((g) => g.round === 1);
    const w = wc.map((g) => (g.homeScore! > g.awayScore! ? g.homeTeamExternalId : g.awayTeamExternalId).replace("mock-team-", "")).find((a) => a !== "BUF")!;
    winner = MOCK_TEAMS.find((t) => t.abbr === w)!;
    league = (await makeLeague(c, u.commish!, [u.f1!, u.f2!], "Core")).leagueId;
    league2 = (await makeLeague(c, u.f2!, [u.f1!], "Second")).leagueId;
    allen = await playerId(c, "Josh Allen");
    kcQb = await playerId(c, "Patrick Mahomes");
  });

  it("Test 2: two participants can both pick Josh Allen in Wild Card", async () => {
    await pick(c, u.f1!, league, 1, "QB", { player: allen });
    await pick(c, u.f2!, league, 1, "QB", { player: allen });
    // Also used later for the Divisional reuse checks.
    await pick(c, u.f1!, league, 1, "RB1", { player: await playerId(c, winner.roster[1]!) });
    await pick(c, u.f2!, league, 1, "DST", { dst: await teamId(c, winner.abbr) });
    const n = await c.query(`select count(*)::int as n from lineup_selections where league_id = $1 and player_id = $2`, [league, allen]);
    expect(n.rows[0].n).toBe(2);
  });

  it("Test 4: usage in one league does not affect another league", async () => {
    await pick(c, u.f1!, league2, 1, "QB", { player: allen });
    const n = await c.query(`select count(*)::int as n from lineup_selections where user_id = $1 and player_id = $2`, [u.f1, allen]);
    expect(n.rows[0].n).toBe(2);
  });

  it("Test 9: a team on a Wild Card bye can't be picked for Wild Card", async () => {
    await expect(pick(c, u.f1!, league, 1, "FLEX", { player: await playerId(c, "Travis Kelce") })).rejects.toThrow("bye week or eliminated");
    await expect(pick(c, u.f1!, league, 1, "DST", { dst: await teamId(c, "KC") })).rejects.toThrow("bye week");
    await expect(pick(c, u.f1!, league, 2, "QB", { player: kcQb })).rejects.toThrow("not set yet");
  });

  it("checks positions, injuries and spots on the server (frontend manipulation can't bypass)", async () => {
    await expect(pick(c, u.f1!, league, 1, "RB1", { player: await playerId(c, "Lamar Jackson") })).rejects.toThrow("can't play the RB1 spot");
    await expect(pick(c, u.f1!, league, 1, "FLEX", { player: await playerId(c, "Lamar Jackson") })).rejects.toThrow("can't play");
    await expect(pick(c, u.f1!, league, 1, "WR1", { player: await playerId(c, "Tank Dell") })).rejects.toThrow("ruled out (IR)");
    await expect(pick(c, u.f1!, league, 1, "QB2", { player: allen })).rejects.toThrow("Unknown lineup spot");
    await expect(pick(c, u.f1!, league, 1, "WR1", { dst: await teamId(c, "BUF") })).rejects.toThrow("D/ST spot");
    await expect(pick(c, u.outsider!, league, 1, "QB", { player: allen })).rejects.toThrow("not a member");
    // Direct writes are refused outright.
    await expect(asUser(c, u.f1!, () => c.query(`insert into lineup_selections (lineup_id, league_id, user_id, season_id, round, slot, player_id, game_id)
      select lineup_id, league_id, user_id, season_id, 2, 'QB', player_id, game_id from lineup_selections where user_id = $1 limit 1`, [u.f1]))).rejects.toThrow("permission denied");
    await expect(asUser(c, u.f1!, () => c.query(`update lineup_selections set round = 2 where user_id = $1`, [u.f1]))).rejects.toThrow("permission denied");
    await expect(asUser(c, u.f1!, () => c.query(`select lineup_for($1, $2, 1)`, [league, u.f2]))).rejects.toThrow("permission denied");
  });

  it("a player can't fill two spots in one lineup, even with simultaneous requests", async () => {
    const barkley = await playerId(c, "Saquon Barkley");
    const { Client } = await import("pg");
    const other = new Client({ connectionString: db.url });
    await other.connect();
    try {
      const results = await Promise.allSettled([
        pick(c, u.f2!, league, 1, "RB1", { player: barkley }),
        pick(other, u.f2!, league, 1, "FLEX", { player: barkley }),
      ]);
      expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      expect(String((results.find((r) => r.status === "rejected") as PromiseRejectedResult).reason)).toMatch(/already in this lineup/);
    } finally {
      await other.end();
    }
  });

  it("hides other people's unlocked picks; shows submission status", async () => {
    const seen = await asUser(c, u.f2!, async () => (await c.query(`select user_id from lineup_selections where league_id = $1`, [league])).rows);
    expect(seen.every((r) => r.user_id === u.f2)).toBe(true);
    const commish = await asUser(c, u.commish!, async () => (await c.query(`select user_id from lineup_selections where league_id = $1`, [league])).rows);
    expect(new Set(commish.map((r) => r.user_id)).size).toBe(2);
    const status = await asUser(c, u.f2!, async () => (await c.query(`select * from league_lineup_status($1, 1)`, [league])).rows);
    expect(status.find((s) => s.user_id === u.f1)).toMatchObject({ filled: 2, locked: 0, slots: 9, status: "draft" });
  });

  it("requires a full lineup to submit (unless the commissioner allows incomplete)", async () => {
    await expect(asUser(c, u.f1!, () => c.query(`select submit_lineup($1, 1)`, [league]))).rejects.toThrow("Fill all 9 spots");
    await asUser(c, u.commish!, () => c.query(`select update_league_settings($1, '{"allow_incomplete": true}')`, [league]));
    await asUser(c, u.f1!, () => c.query(`select submit_lineup($1, 1)`, [league]));
    await asUser(c, u.commish!, () => c.query(`select update_league_settings($1, '{"allow_incomplete": false}')`, [league]));
  });

  it("Test 5: a pick can change until its own game kicks off, then never", async () => {
    // Swap before kickoff: allowed (Allen -> Stroud and back).
    await pick(c, u.f1!, league, 1, "QB", { player: await playerId(c, "C.J. Stroud") });
    await pick(c, u.f1!, league, 1, "QB", { player: allen });
    const events = await asUser(c, u.f1!, async () => (await c.query(`select action from selection_events where user_id = $1 and league_id = $2 order by id`, [u.f1, league])).rows.map((r) => r.action));
    expect(events).toContain("replaced");

    // Wild Card game 1 kicks off (HOU v PIT). The schedule's later games remain editable.
    const pickens = await playerId(c, "George Pickens");
    const nico = await playerId(c, "Nico Collins");
    await pick(c, u.f1!, league, 1, "WR1", { player: pickens });
    await pick(c, u.f1!, league, 1, "WR2", { player: await playerId(c, "A.J. Brown") });
    await syncAt(c, 10);
    await expect(pick(c, u.f1!, league, 1, "WR1", { player: await playerId(c, "Mike Evans") })).rejects.toThrow("locked");
    await expect(asUser(c, u.f1!, () => c.query(`select clear_selection($1, 1, 'WR1')`, [league]))).rejects.toThrow("locked");
    await expect(pick(c, u.f1!, league, 1, "FLEX", { player: nico })).rejects.toThrow("already kicked off");
    await pick(c, u.f1!, league, 1, "WR2", { player: await playerId(c, "Mike Evans") }); // a later game: still editable
    const stamped = await c.query(`select locked_at from lineup_selections where user_id = $1 and league_id = $2 and slot = 'WR1'`, [u.f1, league]);
    expect(stamped.rows[0].locked_at).not.toBeNull();

    // Locks follow the authoritative kickoff time even if the feed hasn't said "live" yet.
    const g = (await c.query(`select game_id from lineup_selections where user_id = $1 and league_id = $2 and slot = 'WR2'`, [u.f1, league])).rows[0].game_id;
    await c.query(`update nfl_games set kickoff_at = now() - interval '1 minute' where id = $1`, [g]);
    await expect(pick(c, u.f1!, league, 1, "WR2", { player: await playerId(c, "Terry McLaurin") })).rejects.toThrow("locked");
    await c.query(`update nfl_games set kickoff_at = now() + interval '1 day' where id = $1`, [g]);

    // A locked pick is now visible to the rest of the league.
    const seen = await asUser(c, u.f2!, async () => (await c.query(`select slot from lineup_selections where user_id = $1 and league_id = $2`, [u.f1, league])).rows.map((r) => r.slot));
    expect(seen).toContain("WR1");
    expect(seen).not.toContain("QB"); // Allen's game hasn't started: still hidden
  });

  it("commissioners cannot alter locked picks; settings and membership freeze at kickoff", async () => {
    await expect(asUser(c, u.commish!, () => c.query(`update lineup_selections set player_id = $2 where user_id = $1`, [u.f1, allen]))).rejects.toThrow("permission denied");
    await expect(asUser(c, u.commish!, () => c.query(`delete from lineup_selections where user_id = $1`, [u.f1]))).rejects.toThrow("permission denied");
    await expect(asUser(c, u.commish!, () => c.query(`select admin_void_selection(id, 'because') from lineup_selections where user_id = $1 limit 1`, [u.f1]))).rejects.toThrow("Administrators only");
    await expect(asUser(c, u.commish!, () => c.query(`select update_league_settings($1, '{"roster_config": {"QB": 2}}')`, [league]))).rejects.toThrow("frozen");
    await expect(asUser(c, u.commish!, () => c.query(`select remove_member($1, $2)`, [league, u.f2]))).rejects.toThrow("once the playoffs begin");
    await asUser(c, u.commish!, () => c.query(`select update_league_settings($1, '{"name": "Core League"}')`, [league])); // cosmetic changes still fine
    const audit = await asUser(c, u.commish!, async () => (await c.query(`select action from audit_log where league_id = $1`, [league])).rows.map((r) => r.action));
    expect(audit).toContain("league.settings");
  });

  it("Test 7: live statistics update fantasy points and the leaderboard", async () => {
    const before = (await roundScores(c, u.f1!, league)).find((r) => r.user_id === u.f1)!.points;
    await syncAt(c, 120);
    const mid = (await roundScores(c, u.f1!, league)).find((r) => r.user_id === u.f1)!.points;
    const status = (await c.query(`select fp.status from fantasy_points fp join lineup_selections s on s.player_id = fp.player_id and s.game_id = fp.game_id where s.user_id = $1 and s.slot = 'WR1' and s.league_id = $2`, [u.f1, league])).rows[0].status;
    expect(status).toBe("provisional");
    await syncAt(c, 300);
    const after = (await roundScores(c, u.f1!, league)).find((r) => r.user_id === u.f1)!.points;
    expect(mid).toBeGreaterThanOrEqual(before);
    expect(after).not.toBe(before);
  });

  it("Test 2 (scoring): everyone who picked Allen gets the same points; Test 3: he can't be reused", async () => {
    await syncAt(c, 4 * DAY); // Wild Card weekend finished; Divisional matchups now set
    const pts = await asUser(c, u.f1!, async () => (await c.query(`select user_id, points from v_selection_points where league_id = $1 and player_id = $2`, [league, allen])).rows);
    expect(pts).toHaveLength(2);
    expect(pts[0].points).toBe(pts[1].points);
    expect(pts[0].points).not.toBeNull();

    // Players and D/STs used in Wild Card whose teams advanced are refused for the Divisional Round.
    const rb = await playerId(c, winner.roster[1]!);
    expect((await c.query(`select team_round_game(team_id, $2, 2) as g from nfl_players where id = $1`, [rb, (await c.query(`select id from seasons`)).rows[0].id])).rows[0].g).not.toBeNull();
    await expect(pick(c, u.f1!, league, 2, "RB1", { player: rb })).rejects.toThrow(`You already used ${winner.roster[1]} in the Wild Card Weekend. Each player can only be used once.`);
    await expect(pick(c, u.f1!, league, 2, "FLEX", { player: rb })).rejects.toThrow("already used");
    await expect(pick(c, u.f2!, league, 2, "DST", { dst: await teamId(c, winner.abbr) })).rejects.toThrow("already used");
    // ...while f2 (who didn't use that RB) can pick him, and a Wild Card bye team is now available.
    await pick(c, u.f2!, league, 2, "RB1", { player: rb });
    await pick(c, u.f1!, league, 2, "QB", { player: kcQb });
    await pick(c, u.f2!, league, 2, "DST", { dst: await teamId(c, "KC") });
  });

  it("Test 8: a stat correction recalculates points and standings, keeping history", async () => {
    const sel = (await c.query(`select game_id from lineup_selections where user_id = $1 and league_id = $2 and player_id = $3`, [u.f1, league, allen])).rows[0];
    const before = (await roundScores(c, u.f1!, league)).find((r) => r.user_id === u.f1 && r.round === 1)!.points;
    const old = (await c.query(`select stats from player_game_stats where player_id = $1 and game_id = $2`, [allen, sel.game_id])).rows[0].stats;
    await correctStats(c, { kind: "player", subjectId: allen, gameId: sel.game_id, stats: { ...old, passTd: (old.passTd ?? 0) + 1 }, reason: "Provider corrected a TD", actor: u.commish! });
    const after = (await roundScores(c, u.f1!, league)).find((r) => r.user_id === u.f1 && r.round === 1)!.points;
    expect(Math.round((after - before) * 100) / 100).toBe(4);
    const fp = (await c.query(`select status from fantasy_points where player_id = $1 and game_id = $2`, [allen, sel.game_id])).rows[0];
    expect(fp.status).toBe("updated");
    const hist = await c.query(`select count(*)::int as n from fantasy_points_history where player_id = $1 and game_id = $2`, [allen, sel.game_id]);
    expect(hist.rows[0].n).toBeGreaterThan(0);
    const rev = await c.query(`select reason, source from stat_revisions where subject_id = $1 and source = 'admin'`, [allen]);
    expect(rev.rows[0]).toEqual({ reason: "Provider corrected a TD", source: "admin" });
    const note = await asUser(c, u.f2!, async () => (await c.query(`select type from notifications where type = 'scoring_correction'`)).rows);
    expect(note.length).toBeGreaterThan(0);
  });

  it("administrator exceptions (e.g. cancelled game) are audited and release the player", async () => {
    await c.query(`update profiles set is_site_admin = true where id = $1`, [u.commish]);
    const s = (await c.query(`select id from lineup_selections where user_id = $1 and league_id = $2 and slot = 'WR1'`, [u.f1, league])).rows[0];
    await expect(asUser(c, u.commish!, () => c.query(`select admin_void_selection($1, '')`, [s.id]))).rejects.toThrow("reason");
    await asUser(c, u.commish!, () => c.query(`select admin_void_selection($1, 'Game cancelled by the NFL')`, [s.id]));
    const audit = await c.query(`select reason from audit_log where action = 'selection.void'`);
    expect(audit.rows[0].reason).toBe("Game cancelled by the NFL");
    await c.query(`update profiles set is_site_admin = false where id = $1`, [u.commish]);
  });
});

describe("Test 6: scoring a known stat line", () => {
  it("matches an independent calculation", async () => {
    const game = (await c.query(`select id from nfl_games where round = 1 limit 1`)).rows[0].id;
    const p = await playerId(c, "Justin Herbert");
    const line = { passYds: 287, passTd: 3, passInt: 1, rushYds: 19, fumLost: 1 };
    await correctStats(c, { kind: "player", subjectId: p, gameId: game, stats: line, reason: "Known stat line test", actor: u.commish! });
    // Independent: 287*0.04=11.48, 3*4=12, -2, 19*0.1=1.9, -2  => 21.38
    const fp = (await c.query(`select points::float8 as points from fantasy_points where player_id = $1 and game_id = $2`, [p, game])).rows[0];
    expect(fp.points).toBe(21.38);
    expect(scoreOffense(line).points).toBe(21.38);
  });
});

describe("Test 11: private league security", () => {
  it("anonymous visitors and non-members can't see leagues, lineups or standings", async () => {
    const lg = (await c.query(`select id from leagues limit 1`)).rows[0].id;
    for (const t of ["leagues", "league_members", "lineups", "lineup_selections", "v_round_scores"]) {
      await expect(asUser(c, null, () => c.query(`select * from ${t}`))).rejects.toThrow("permission denied");
      const rows = await asUser(c, u.outsider!, async () => (await c.query(`select * from ${t} where league_id = $1`.replace("league_id", t === "leagues" ? "id" : "league_id"), [lg])).rows);
      expect(rows).toHaveLength(0);
    }
    await expect(asUser(c, u.outsider!, () => c.query(`select * from league_lineup_status($1, 1)`, [lg]))).rejects.toThrow("Not a member");
    await expect(asUser(c, null, () => c.query(`select set_selection($1, 1, 'QB', null, null)`, [lg]))).rejects.toThrow("permission denied");
  });
});

describe("Test 10: historical seasons", () => {
  it("archives a completed season and starts a new one without touching old records", async () => {
    await syncAt(c, 40 * DAY);
    const old = (await c.query(`select id, status from seasons`)).rows[0];
    expect(old.status).toBe("complete");
    const champ = await c.query(`select count(*)::int as n from notifications where type = 'champion'`);
    expect(champ.rows[0].n).toBeGreaterThan(0);
    const before = await c.query(`select count(*)::int as sel, (select count(*)::int from fantasy_points) as pts from lineup_selections`);
    await c.query(`update seasons set status = 'archived' where id = $1`, [old.id]);
    await c.query(`insert into seasons (nfl_season, label, status, is_sample) values (2099, '2099 Sample Postseason', 'upcoming', true)`);
    const after = await c.query(`select count(*)::int as sel, (select count(*)::int from fantasy_points) as pts from lineup_selections`);
    expect(after.rows[0]).toEqual(before.rows[0]);
    const lg = await asUser(c, u.f1!, async () => (await c.query(`select create_league('Next Year') as id`)).rows[0].id);
    expect((await c.query(`select s.nfl_season from leagues l join seasons s on s.id = l.season_id where l.id = $1`, [lg])).rows[0].nfl_season).toBe(2099);
  });
});
