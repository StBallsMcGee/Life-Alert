import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { standings, type RoundScore, type StandingRow } from "@/lib/standings/standings";
import type { BreakdownLine } from "@/lib/scoring/engine";

export interface Member { user_id: string; role: string; joined_at: string; display_name: string; username: string }

export async function getMembers(sb: SupabaseClient, leagueId: string): Promise<Member[]> {
  const { data: members } = await sb.from("league_members").select("user_id, role, joined_at").eq("league_id", leagueId).eq("status", "active").order("joined_at");
  const ids = (members ?? []).map((m) => m.user_id);
  const { data: profiles } = ids.length ? await sb.from("profiles").select("id, display_name, username").in("id", ids) : { data: [] };
  const p = new Map((profiles ?? []).map((x) => [x.id, x]));
  return (members ?? []).map((m) => ({ ...m, display_name: p.get(m.user_id)?.display_name || p.get(m.user_id)?.username || "Member", username: p.get(m.user_id)?.username ?? "" }));
}

export async function getRoundScores(sb: SupabaseClient, leagueId: string): Promise<RoundScore[]> {
  const { data } = await sb.from("v_round_scores").select("user_id, round, points").eq("league_id", leagueId);
  return (data ?? []).map((r) => ({ userId: r.user_id, round: r.round, points: Number(r.points) }));
}

export async function getStandings(sb: SupabaseClient, leagueId: string, rounds: number[], upto?: number): Promise<{ rows: StandingRow[]; members: Member[]; scores: RoundScore[] }> {
  const [members, scores] = await Promise.all([getMembers(sb, leagueId), getRoundScores(sb, leagueId)]);
  return { rows: standings(members.map((m) => m.user_id), scores, rounds, upto), members, scores };
}

export interface SelectionRow {
  id: string; league_id: string; user_id: string; round: number; slot: string; player_id: string | null; dst_team_id: string | null; game_id: string;
  locked: boolean; kickoff_at: string; game_status: string; points: number | null; score_status: string | null; breakdown: BreakdownLine[] | null;
}

export async function getSelections(sb: SupabaseClient, leagueId: string, filter: { userId?: string; round?: number } = {}): Promise<SelectionRow[]> {
  let q = sb.from("v_selection_points").select("id, league_id, user_id, round, slot, player_id, dst_team_id, game_id, locked, kickoff_at, game_status, points, score_status, breakdown").eq("league_id", leagueId);
  if (filter.userId) q = q.eq("user_id", filter.userId);
  if (filter.round) q = q.eq("round", filter.round);
  const { data } = await q;
  return (data ?? []).map((r) => ({ ...r, points: r.points === null ? null : Number(r.points) })) as SelectionRow[];
}

export interface PlayerRow { id: string; full_name: string; team_id: string | null; position: string; jersey_number: number | null; injury_status: string | null; injury_note: string | null; active: boolean }

export async function getPlayers(sb: SupabaseClient, ids?: string[]): Promise<Map<string, PlayerRow>> {
  let q = sb.from("nfl_players").select("id, full_name, team_id, position, jersey_number, injury_status, injury_note, active");
  if (ids) {
    if (ids.length === 0) return new Map();
    q = q.in("id", ids);
  }
  const { data } = await q.order("full_name").limit(5000);
  return new Map((data ?? []).map((p) => [p.id, p as PlayerRow]));
}

export interface PointsRow { game_id: string; player_id: string | null; dst_team_id: string | null; points: number; status: string; breakdown: BreakdownLine[] }

/** Fantasy points under one scoring configuration for the given games. */
export async function getPoints(sb: SupabaseClient, scoringConfigId: string, gameIds: string[]): Promise<PointsRow[]> {
  if (gameIds.length === 0) return [];
  const out: PointsRow[] = [];
  for (let from = 0; ; from += 1000) {
    const { data } = await sb.from("fantasy_points").select("game_id, player_id, dst_team_id, points, status, breakdown")
      .eq("scoring_config_id", scoringConfigId).in("game_id", gameIds).range(from, from + 999);
    out.push(...((data ?? []).map((r) => ({ ...r, points: Number(r.points) })) as PointsRow[]));
    if (!data || data.length < 1000) break;
  }
  return out;
}

export async function defaultScoringConfigId(sb: SupabaseClient): Promise<string | null> {
  const { data } = await sb.from("scoring_configs").select("id").eq("name", "Half PPR").order("version", { ascending: false }).limit(1);
  return data?.[0]?.id ?? null;
}

export const subjectKey = (s: { player_id: string | null; dst_team_id: string | null }) => s.player_id ?? `dst:${s.dst_team_id}`;
