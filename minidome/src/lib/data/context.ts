import "server-only";
import { cache } from "react";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { currentRound, roundStatusOf, type RoundStatus } from "@/lib/nfl/rounds";
import type { TeamLike } from "@/components/team-chip";

export const LEAGUE_COOKIE = "md_league";

export interface Profile { id: string; email: string | null; username: string; display_name: string; is_site_admin: boolean; notification_prefs: Record<string, boolean>; created_at: string }
export interface League {
  id: string; season_id: string; name: string; description: string; commissioner_id: string; max_members: number;
  scoring_config_id: string; roster_config: Record<string, number>; allow_incomplete: boolean; status: string; created_at: string;
  role: "commissioner" | "member";
}
export interface Team extends TeamLike { id: string; city: string; name: string; conference: string | null }
export interface Game {
  id: string; season_id: string; round: number; home_team_id: string; away_team_id: string; kickoff_at: string; status: string;
  home_score: number | null; away_score: number | null; period: string | null; clock: string | null; winner_team_id: string | null;
}
export interface Round { round: number; name: string; short_name: string; status: RoundStatus; games: Game[] }
export interface SeasonView {
  id: string; label: string; status: string; isSample: boolean;
  rounds: Round[]; teams: Map<string, Team>; games: Game[];
  /** Teams in this postseason (including bye teams), with seeds. */
  playoffTeams: Map<string, number | null>;
  current: number | null; nextPending: boolean; lastSync: string | null;
}

function verifiedUser(raw: string | null): { id: string; email: string | null } | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(decodeURIComponent(raw)) as { id?: unknown; email?: unknown };
    return typeof v.id === "string" ? { id: v.id, email: typeof v.email === "string" ? v.email : null } : null;
  } catch {
    return null;
  }
}

/** Everything most pages need, loaded once per request. */
export const getContext = cache(async () => {
  const [supabase, h, jar] = await Promise.all([supabaseServer(), headers(), cookies()]);
  const user = verifiedUser(h.get("x-minidome-verified-user")) ?? (await supabase.auth.getUser()).data.user;
  if (!user) redirect("/login");
  const [{ data: profile }, { data: memberships }, { count: unread }] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", user.id).maybeSingle(),
    supabase.from("league_members").select("role, joined_at, leagues(*)").eq("user_id", user.id).eq("status", "active").order("joined_at", { ascending: false }),
    supabase.from("notifications").select("id", { count: "exact", head: true }).eq("user_id", user.id).is("read_at", null),
  ]);
  const leagues: League[] = (memberships ?? []).flatMap((m) => {
    const l = (Array.isArray(m.leagues) ? m.leagues[0] : m.leagues) as Omit<League, "role"> | null;
    return l ? [{ ...l, role: m.role as League["role"] }] : [];
  });
  const remembered = jar.get(LEAGUE_COOKIE)?.value;
  return { supabase, user, profile: profile as Profile | null, leagues, rememberedLeague: remembered ?? null, unread: unread ?? 0 };
});

export type Ctx = Awaited<ReturnType<typeof getContext>>;

/** The league a page is about: ?league=, else the one last viewed, else the newest. */
export function pickLeague(ctx: Ctx, param: string | string[] | undefined): League | null {
  const id = Array.isArray(param) ? param[0] : param;
  return ctx.leagues.find((l) => l.id === id) ?? ctx.leagues.find((l) => l.id === ctx.rememberedLeague) ?? ctx.leagues[0] ?? null;
}

/** Season, rounds, games and teams, with each round's status worked out from its games. */
export const getSeasonView = cache(async (seasonId?: string | null): Promise<SeasonView | null> => {
  const { supabase: sb } = await getContext();
  let id = seasonId ?? null;
  if (!id) {
    const { data } = await sb.from("seasons").select("id, status, nfl_season, is_sample").in("status", ["active", "upcoming", "complete"]).order("nfl_season", { ascending: false }).order("is_sample", { ascending: true });
    const pick = (data ?? []).find((s) => s.status !== "complete") ?? data?.[0];
    id = pick?.id ?? null;
  }
  if (!id) return null;
  const [{ data: season }, { data: rounds }, { data: games }, { data: teams }, { data: last }, { data: st }] = await Promise.all([
    sb.from("seasons").select("*").eq("id", id).maybeSingle(),
    sb.from("playoff_rounds").select("round, name, short_name").eq("season_id", id).order("round"),
    sb.from("nfl_games").select("id, season_id, round, home_team_id, away_team_id, kickoff_at, status, home_score, away_score, period, clock, winner_team_id").eq("season_id", id).order("kickoff_at"),
    sb.from("nfl_teams").select("id, abbreviation, city, name, conference, primary_color, secondary_color"),
    sb.from("sync_state").select("value, updated_at").eq("key", "last_sync").maybeSingle(),
    sb.from("season_teams").select("team_id, seed").eq("season_id", id),
  ]);
  if (!season) return null;
  const now = new Date();
  const rs: Round[] = (rounds ?? []).map((r) => {
    const g = (games ?? []).filter((x) => x.round === r.round) as Game[];
    return { ...r, status: roundStatusOf(g, now), games: g };
  });
  const cur = currentRound(new Map(rs.map((r) => [r.round, r.status])), rs.map((r) => r.round));
  return {
    id: season.id, label: season.label, status: season.status, isSample: season.is_sample,
    rounds: rs, teams: new Map((teams ?? []).map((t) => [t.id, t as Team])), games: (games ?? []) as Game[],
    playoffTeams: new Map((st ?? []).map((t) => [t.team_id, t.seed])),
    current: cur.round, nextPending: cur.nextPending, lastSync: (last?.value as { at?: string } | undefined)?.at ?? null,
  };
});

export function roundOf(season: SeasonView, round: number | null | undefined): Round | undefined {
  return season.rounds.find((r) => r.round === round);
}

export function parseRound(v: string | string[] | undefined, season: SeasonView): number | null {
  const n = Number(Array.isArray(v) ? v[0] : v);
  return season.rounds.some((r) => r.round === n) ? n : season.current;
}
