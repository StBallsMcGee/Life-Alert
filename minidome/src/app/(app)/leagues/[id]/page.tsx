import Link from "next/link";
import { notFound } from "next/navigation";
import { getContext, getSeasonView, roundOf } from "@/lib/data/context";
import { getPlayers, getSelections, getStandings } from "@/lib/data/queries";
import { gameIsLocked } from "@/lib/nfl/rounds";
import { RoundSteps } from "@/components/round-tracker";
import { StandingsTable } from "@/components/standings-table";
import { LeaveLeagueButton } from "@/components/league-forms";
import { RememberLeague } from "@/components/league-switcher";
import { LiveRefresh } from "@/components/live-refresh";
import { LocalTime } from "@/components/local-time";
import { TeamChip } from "@/components/team-chip";
import { Avatar, Badge, Card, Empty, GameStatus, Notice } from "@/components/ui";
import { teamLike } from "@/lib/data/pool";

export default async function LeagueDashboard({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ joined?: string }> }) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const ctx = await getContext();
  const league = ctx.leagues.find((l) => l.id === id);
  if (!league) notFound();
  const sb = ctx.supabase;
  const season = await getSeasonView(league.season_id);
  const round = season ? roundOf(season, season.current) : undefined;
  const rounds = season?.rounds.map((r) => r.round) ?? [];
  const [{ rows, members }, status, visiblePicks, { data: started }] = await Promise.all([
    getStandings(sb, league.id, rounds),
    round ? sb.rpc("league_lineup_status", { p_league: league.id, p_round: round.round }) : Promise.resolve({ data: [] }),
    getSelections(sb, league.id),
    sb.rpc("league_competition_started", { p_league: league.id }),
  ]);
  const names = new Map(members.map((m) => [m.user_id, m.display_name]));
  const commissioner = members.find((m) => m.role === "commissioner");
  const st = new Map(((status.data ?? []) as Array<{ user_id: string; status: string; filled: number; locked: number; slots: number }>).map((s) => [s.user_id, s]));

  // League activity: members joining and picks locking in (others' picks are only visible once locked).
  const lockedPicks = visiblePicks.filter((s) => s.locked);
  const players = await getPlayers(sb, lockedPicks.flatMap((s) => (s.player_id ? [s.player_id] : [])));
  type Item = { at: string; text: React.ReactNode; key: string };
  const activity: Item[] = [
    ...members.map((m) => ({ at: m.joined_at, key: `j${m.user_id}`, text: <><b>{m.display_name}</b> joined the league</> })),
    ...lockedPicks.map((s) => {
      const p = s.player_id ? players.get(s.player_id) : undefined;
      const t = season?.teams.get(p?.team_id ?? s.dst_team_id ?? "");
      return { at: s.kickoff_at, key: s.id, text: <><b>{names.get(s.user_id) ?? "Someone"}</b> locked in {p?.full_name ?? `${t?.name} D/ST`} <span className="text-gray-500">({s.slot.replace("DST", "D/ST")}, {season?.rounds.find((r) => r.round === s.round)?.short_name})</span></> };
    }),
  ].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 12);
  const now = new Date();
  const roundGames = round?.games ?? [];
  const live = roundGames.some((g) => g.status === "live" || g.status === "halftime");

  return (
    <>
      <RememberLeague id={league.id} />
      <div className="flex flex-wrap items-end justify-between gap-2 px-4 pt-4 sm:px-0">
        <div className="min-w-0">
          <p className="text-[11px] font-extrabold uppercase tracking-wide text-gold-300">{season?.label}</p>
          <h1 className="truncate text-2xl font-black tracking-tight">{league.name}</h1>
          <p className="text-sm text-gray-500">Commissioner: {commissioner?.display_name ?? "—"} · {members.length}/{league.max_members} members</p>
          {league.description ? <p className="mt-1 max-w-xl text-sm text-gray-700">{league.description}</p> : null}
        </div>
        <div className="flex gap-2">
          <Link href={`/lineup?league=${league.id}`} className="btn-primary">My lineup</Link>
          {league.role === "commissioner" ? <Link href={`/leagues/${league.id}/manage`} className="btn-secondary">Manage</Link> : null}
        </div>
      </div>
      <LiveRefresh active={live} everyMs={30_000} />
      <div className="mt-3 space-y-3">
        {sp.joined ? <Notice tone="mint">🎉 You&apos;re in! Head to <Link href={`/lineup?league=${league.id}`} className="font-bold underline">your lineup</Link> to make your picks.</Notice> : null}
        {season ? <RoundSteps rounds={season.rounds} current={season.current} hrefFor={(n) => `/standings?league=${league.id}&view=round&round=${n}`} /> : null}

        <div className="grid gap-3 lg:grid-cols-[1.4fr_1fr]">
          <Card flush title="Leaderboard" action={<Link href={`/standings?league=${league.id}`} className="link text-xs">Round by round</Link>}>
            {rows.length ? <StandingsTable rows={rows} names={names} me={ctx.user.id} roundLabel={round?.short_name} roundOf={(r) => r.byRound[round?.round ?? 0] ?? 0} /> : <Empty>No members yet.</Empty>}
          </Card>

          <Card flush title={round ? `Lineups · ${round.short_name}` : "Lineups"}>
            <ul className="divide-y divide-gray-100">
              {members.map((m) => {
                const s = st.get(m.user_id);
                return (
                  <li key={m.user_id} className="flex items-center gap-3 px-4 py-2.5">
                    <Avatar name={m.display_name} size={32} ring={m.user_id === ctx.user.id ? "#f9c22e" : undefined} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-bold">{m.display_name}{m.role === "commissioner" ? <span className="ml-1.5 text-[10px] font-extrabold text-gold-300">COMMISH</span> : null}</span>
                      <span className="block text-[11px] text-gray-500">{s ? `${s.filled}/${s.slots} picked · ${s.locked} locked` : "—"}</span>
                    </span>
                    {s?.status === "submitted" ? <Badge tone="mint">Submitted</Badge> : s && s.filled > 0 ? <Badge tone="amber">In progress</Badge> : <Badge>Not started</Badge>}
                  </li>
                );
              })}
            </ul>
          </Card>
        </div>

        <div className="grid gap-3 lg:grid-cols-2">
          <Card flush title={round ? `${round.name} schedule` : "Schedule"} action={<Link href="/games" className="link text-xs">NFL games</Link>}>
            {roundGames.length === 0 ? <Empty>Matchups are set once the previous round ends.</Empty> : (
              <ul className="divide-y divide-gray-100">
                {roundGames.map((g) => (
                  <li key={g.id}>
                    <Link href={`/games/${g.id}`} className="flex items-center gap-2 px-4 py-2.5 active:bg-gray-50">
                      <TeamChip team={teamLike(season?.teams.get(g.away_team_id))} size="sm" />
                      <span className="w-6 text-center text-sm font-black tabular-nums">{g.away_score ?? ""}</span>
                      <span className="text-xs text-gray-500">@</span>
                      <span className="w-6 text-center text-sm font-black tabular-nums">{g.home_score ?? ""}</span>
                      <TeamChip team={teamLike(season?.teams.get(g.home_team_id))} size="sm" />
                      <span className="ml-auto text-right text-xs">{gameIsLocked(g, now) ? <GameStatus status={g.status} kickoff={g.kickoff_at} period={g.period} clock={g.clock} /> : <LocalTime iso={g.kickoff_at} mode="kickoff" />}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card flush title="Recent activity">
            {activity.length === 0 ? <Empty>Nothing yet.</Empty> : (
              <ul className="divide-y divide-gray-100">
                {activity.map((a) => (
                  <li key={a.key} className="flex items-start gap-3 px-4 py-2.5 text-sm">
                    <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-gold-400" />
                    <span className="min-w-0 flex-1">{a.text}<span className="block text-[11px] text-gray-500"><LocalTime iso={a.at} /></span></span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
        {league.role !== "commissioner" && !started ? <div className="px-4 sm:px-0"><LeaveLeagueButton leagueId={league.id} /></div> : null}
      </div>
    </>
  );
}
