import Link from "next/link";
import { getContext, getSeasonView, pickLeague } from "@/lib/data/context";
import { getPlayers, getPoints, getSelections } from "@/lib/data/queries";
import { buildPool, teamLike } from "@/lib/data/pool";
import { LeagueSwitcher } from "@/components/league-switcher";
import { PointsButton } from "@/components/points-breakdown";
import { PositionTile, positionText } from "@/components/position";
import { SubjectAvatar, TeamChip } from "@/components/team-chip";
import { Badge, Card, Empty, PageHeader } from "@/components/ui";

export const metadata = { title: "My Players" };

export default async function MyPlayers({ searchParams }: { searchParams: Promise<{ league?: string }> }) {
  const sp = await searchParams;
  const ctx = await getContext();
  const league = pickLeague(ctx, sp.league);
  if (!league) return <><PageHeader title="My Players" /><Empty>Join a league first. <Link href="/leagues" className="link">My Leagues →</Link></Empty></>;
  const season = await getSeasonView(league.season_id);
  if (!season) return <Empty>No season loaded yet.</Empty>;
  const sb = ctx.supabase;
  const [mine, players] = await Promise.all([getSelections(sb, league.id, { userId: ctx.user.id }), getPlayers(sb)]);
  const points = await getPoints(sb, league.scoring_config_id, season.games.map((g) => g.id));
  const nextRound = season.rounds.find((r) => r.status === "open" || r.status === "in_progress") ?? season.rounds.find((r) => r.status === "pending");
  const pool = buildPool({ season, round: nextRound?.round ?? season.current ?? 1, players, mySelections: mine, points });
  const remaining = pool.filter((p) => p.state === "available" || p.state === "selected");
  const total = mine.reduce((t, s) => t + (s.points ?? 0), 0);
  const byPos = ["QB", "RB", "WR", "TE", "K", "DST"].map((pos) => ({ pos, n: remaining.filter((p) => p.position === pos).length }));
  const name = (s: (typeof mine)[number]) => (s.player_id ? players.get(s.player_id)?.full_name : `${season.teams.get(s.dst_team_id ?? "")?.name} D/ST`) ?? "";
  const teamOf = (s: (typeof mine)[number]) => season.teams.get(s.player_id ? players.get(s.player_id)?.team_id ?? "" : s.dst_team_id ?? "");

  return (
    <>
      <PageHeader title="My Players" subtitle={`${league.name} · ${mine.length} used · ${total.toFixed(1)} points earned`} />
      <LeagueSwitcher leagues={ctx.leagues} current={league.id} />
      <div className="space-y-3">
        {season.rounds.map((r) => {
          const picks = mine.filter((s) => s.round === r.round).sort((a, b) => a.slot.localeCompare(b.slot));
          const sum = picks.reduce((t, s) => t + (s.points ?? 0), 0);
          return (
            <Card key={r.round} flush title={`${r.name}${picks.length ? ` · ${sum.toFixed(1)} pts` : ""}`} action={r.status !== "complete" && r.status !== "pending" ? <Link href={`/lineup?league=${league.id}&round=${r.round}`} className="link text-xs">Edit</Link> : null}>
              {picks.length === 0 ? <Empty>{r.status === "pending" ? "Not started yet." : "No players used this round."}</Empty> : (
                <ul className="divide-y divide-gray-100">
                  {picks.map((s) => (
                    <li key={s.id} className="flex items-center gap-3 px-3 py-2.5">
                      <PositionTile label={s.slot} size="sm" />
                      <SubjectAvatar name={name(s)} team={teamLike(teamOf(s))} dst={!!s.dst_team_id} size={34} />
                      <span className="min-w-0 flex-1">
                        {s.player_id ? <Link href={`/players/${s.player_id}`} className="block truncate text-sm font-bold hover:underline">{name(s)}</Link> : <span className="block truncate text-sm font-bold">{name(s)}</span>}
                        <span className="text-[11px] text-gray-500">{s.locked ? "🔒 Used" : "Reserved (not locked yet)"}</span>
                      </span>
                      {s.points !== null ? <PointsButton value={s.points} name={name(s)} team={teamLike(teamOf(s))} dst={!!s.dst_team_id} subtitle={r.name} lines={s.breakdown ?? []} status={s.score_status} className="font-extrabold" /> : <span className="text-gray-400">–</span>}
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          );
        })}

        <Card flush title={`Still available${nextRound ? ` · for the ${nextRound.short_name} round` : ""}`}>
          <div className="flex flex-wrap gap-2 border-b border-gray-100 px-4 py-3">
            {byPos.map((b) => <span key={b.pos} className="flex items-center gap-1.5 rounded-full bg-surface-2 px-2.5 py-1 text-xs font-bold"><span className={positionText(b.pos)}>{b.pos === "DST" ? "D/ST" : b.pos}</span><span className="tabular-nums">{b.n}</span></span>)}
          </div>
          {remaining.length === 0 ? <Empty>No eligible players remain.</Empty> : (
            <ul className="divide-y divide-gray-100">
              {remaining.slice(0, 40).map((p) => (
                <li key={p.key} className="flex items-center gap-3 px-4 py-2">
                  <SubjectAvatar name={p.name} team={teamLike(season.teams.get(p.teamId ?? ""))} dst={!!p.dstTeamId} size={32} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-bold">{p.name}</span>
                    <span className="flex items-center gap-1.5 text-[11px] text-gray-500"><span className={`font-bold ${positionText(p.position)}`}>{p.position === "DST" ? "D/ST" : p.position}</span><TeamChip team={teamLike(season.teams.get(p.teamId ?? ""))} size="sm" />{p.injury ? <Badge tone="amber">{p.injury}</Badge> : null}{p.state === "selected" ? <Badge tone="gold">In lineup</Badge> : null}</span>
                  </span>
                  <span className="text-right text-sm font-extrabold tabular-nums">{p.seasonPoints.toFixed(1)}<span className="block text-[10px] font-normal text-gray-500">playoff pts</span></span>
                </li>
              ))}
            </ul>
          )}
          {remaining.length > 40 ? <p className="border-t border-gray-100 px-4 py-2.5 text-xs text-gray-500">Showing the top 40 of {remaining.length}. Use the lineup builder to search them all.</p> : null}
        </Card>
        <p className="px-4 text-xs text-gray-500 sm:px-0">Players used here can still be picked in your other leagues: each league tracks its own usage.</p>
      </div>
    </>
  );
}
