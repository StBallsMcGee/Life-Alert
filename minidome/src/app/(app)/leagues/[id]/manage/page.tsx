import Link from "next/link";
import { notFound } from "next/navigation";
import { getContext, getSeasonView, parseRound } from "@/lib/data/context";
import { getMembers, getPlayers, getSelections } from "@/lib/data/queries";
import { slotsFor } from "@/lib/league/roster";
import { InvitePanel, RemoveMemberButton, SettingsForm, type InvitationRow } from "@/components/league-forms";
import { RoundSteps } from "@/components/round-tracker";
import { PositionTile } from "@/components/position";
import { LocalTime } from "@/components/local-time";
import { Avatar, Badge, Card, Empty, Notice, PageHeader } from "@/components/ui";

export const metadata = { title: "Manage league" };

export default async function ManageLeague({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ round?: string; created?: string }> }) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const ctx = await getContext();
  const league = ctx.leagues.find((l) => l.id === id);
  if (!league) notFound();
  if (league.role !== "commissioner" && !ctx.profile?.is_site_admin) {
    return <><PageHeader title="Manage league" /><Notice tone="red">Only the commissioner can manage this league.</Notice></>;
  }
  const sb = ctx.supabase;
  const season = await getSeasonView(league.season_id);
  const round = season ? parseRound(sp.round, season) ?? 1 : 1;
  const [members, { data: invitations }, { data: started }, picks, { data: audit }, { data: lineups }] = await Promise.all([
    getMembers(sb, league.id),
    sb.from("league_invitations").select("id, kind, hint, email, expires_at, max_uses, current_uses, revoked_at, created_at").eq("league_id", league.id).order("created_at", { ascending: false }),
    sb.rpc("league_competition_started", { p_league: league.id }),
    getSelections(sb, league.id, { round }),
    sb.from("audit_log").select("id, actor, action, entity, entity_id, reason, at").eq("league_id", league.id).order("at", { ascending: false }).limit(30),
    sb.from("lineups").select("user_id, status, submitted_at").eq("league_id", league.id).eq("round", round),
  ]);
  const players = await getPlayers(sb, picks.flatMap((p) => (p.player_id ? [p.player_id] : [])));
  const names = new Map(members.map((m) => [m.user_id, m.display_name]));
  const slots = slotsFor(league.roster_config);
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "";

  return (
    <>
      <PageHeader title="Manage league" subtitle={<Link href={`/leagues/${league.id}`} className="link">← {league.name}</Link>} />
      <div className="space-y-3">
        {sp.created ? <Notice tone="mint">🏟️ League created. Invite your friends below: share a link, a code, or an email invitation.</Notice> : null}
        <div className="grid gap-3 lg:grid-cols-2">
          <Card title="Invite members"><InvitePanel leagueId={league.id} invitations={(invitations ?? []) as InvitationRow[]} siteUrl={siteUrl} /></Card>
          <Card title="Settings">
            <SettingsForm leagueId={league.id} frozen={!!started} memberCount={members.length}
              initial={{ name: league.name, description: league.description, max_members: league.max_members, allow_incomplete: league.allow_incomplete, roster_config: league.roster_config }} />
          </Card>
        </div>

        <Card flush title={`Members · ${members.length}/${league.max_members}`}>
          <ul className="divide-y divide-gray-100">
            {members.map((m) => (
              <li key={m.user_id} className="flex items-center gap-3 px-4 py-2.5">
                <Avatar name={m.display_name} size={32} />
                <span className="min-w-0 flex-1"><span className="block truncate text-sm font-bold">{m.display_name}</span><span className="block text-[11px] text-gray-500">@{m.username} · joined <LocalTime iso={m.joined_at} mode="date" /></span></span>
                {m.role === "commissioner" ? <Badge tone="gold">Commissioner</Badge> : !started ? <RemoveMemberButton leagueId={league.id} userId={m.user_id} name={m.display_name} /> : null}
              </li>
            ))}
          </ul>
          {started ? <p className="border-t border-gray-100 px-4 py-2.5 text-xs text-gray-500">Members can&apos;t be removed once the playoffs have begun.</p> : null}
        </Card>

        <Card flush title="Submitted lineups">
          {season ? <div className="pt-3"><RoundSteps rounds={season.rounds} current={round} hrefFor={(n) => `/leagues/${league.id}/manage?round=${n}`} /></div> : null}
          <p className="px-4 pt-3 text-xs text-gray-500">Read-only. Nobody, including the commissioner, can change someone else&apos;s picks.</p>
          <div className="overflow-x-auto">
            <table className="table mt-2 min-w-[640px]">
              <thead><tr><th>Member</th>{slots.map((s) => <th key={s}><PositionTile label={s} size="sm" /></th>)}<th>Status</th></tr></thead>
              <tbody>
                {members.map((m) => {
                  const lu = (lineups ?? []).find((l) => l.user_id === m.user_id);
                  return (
                    <tr key={m.user_id}>
                      <td className="font-bold">{m.display_name}</td>
                      {slots.map((s) => {
                        const p = picks.find((x) => x.user_id === m.user_id && x.slot === s);
                        const pl = p?.player_id ? players.get(p.player_id) : undefined;
                        const t = season?.teams.get(p?.dst_team_id ?? "");
                        return <td key={s} className="text-xs">{p ? <>{p.locked ? "🔒 " : ""}{pl ? pl.full_name.split(" ").slice(-1)[0] : `${t?.abbreviation} D/ST`}</> : <span className="text-gray-400">—</span>}</td>;
                      })}
                      <td>{lu?.status === "submitted" ? <Badge tone="mint">Submitted</Badge> : <Badge>Draft</Badge>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>

        <Card flush title="Audit history">
          {(audit ?? []).length === 0 ? <Empty>No changes recorded yet.</Empty> : (
            <ul className="divide-y divide-gray-100">
              {(audit ?? []).map((a) => (
                <li key={a.id} className="px-4 py-2.5 text-sm">
                  <span className="font-mono text-xs font-bold text-gold-300">{a.action}</span> by <b>{names.get(a.actor ?? "") ?? "system"}</b>{a.reason ? <> · “{a.reason}”</> : null}
                  <span className="block text-[11px] text-gray-500"><LocalTime iso={a.at} /></span>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Notice>Scoring issue? Stat corrections are handled by the site administrator through an audited workflow, and every change is shown here and to affected members.</Notice>
      </div>
    </>
  );
}
