import Link from "next/link";
import { getContext, getSeasonView, pickLeague, roundOf } from "@/lib/data/context";
import { getPlayers, getPoints, getSelections, getStandings, subjectKey } from "@/lib/data/queries";
import { teamLike } from "@/lib/data/pool";
import { slotsFor } from "@/lib/league/roster";
import { gameIsLocked } from "@/lib/nfl/rounds";
import { FieldScene, type FieldPlayer } from "@/components/field-scene";
import { RoundBanner, RoundSteps } from "@/components/round-tracker";
import { StandingsTable } from "@/components/standings-table";
import { LiveRefresh } from "@/components/live-refresh";
import { LocalTime } from "@/components/local-time";
import { MinidomeLogo } from "@/components/logo";
import { RememberLeague } from "@/components/league-switcher";
import { SubjectAvatar, TeamChip } from "@/components/team-chip";
import { Avatar, Card, Empty, Notice, SectionHeading } from "@/components/ui";

const TILES = ["tile-violet", "tile-green", "tile-orange", "tile-blue", "tile-pink", "tile-teal"];
const GAME_TILES = ["tile-teal", "tile-violet", "tile-orange", "tile-green", "tile-blue"];

export default async function Home() {
  const ctx = await getContext();
  const first = (ctx.profile?.display_name || "there").split(" ")[0] ?? "there";
  const league = pickLeague(ctx, undefined);
  const season = await getSeasonView(league?.season_id ?? null);

  if (!league) {
    return (
      <>
        <Greeting name={first} sub={season ? season.label : "NFL Playoff One-and-Done"} />
        <div className="space-y-3">
          <section className="relative mx-3 overflow-hidden rounded-3xl bg-gradient-to-br from-turf-700 via-turf-800 to-charcoal p-6 shadow-xl shadow-black/40 sm:mx-0">
            <div aria-hidden className="pointer-events-none absolute inset-0 opacity-20 [background:repeating-linear-gradient(90deg,transparent_0,transparent_38px,rgba(255,255,255,.6)_38px,rgba(255,255,255,.6)_40px)]" />
            <div className="relative">
              <MinidomeLogo size={64} className="mb-3 drop-shadow-[0_6px_24px_rgba(249,194,46,0.35)]" />
              <h2 className="text-2xl font-black leading-tight">Welcome to THE MINIDOME</h2>
              <p className="mt-1 max-w-md text-sm text-gray-700">Pick nine NFL players each playoff round. Use each player only once. Most points after the Super Bowl wins.</p>
              <div className="mt-4 flex flex-wrap gap-2">
                <Link href="/leagues/new" className="btn-primary">Create a league</Link>
                <Link href="/leagues#join" className="btn-secondary">Join with a code</Link>
              </div>
            </div>
          </section>
          {season ? <RoundSteps rounds={season.rounds} current={season.current} /> : null}
          {season ? <UpcomingGames season={season} /> : null}
        </div>
      </>
    );
  }

  const sb = ctx.supabase;
  const round = season ? roundOf(season, season.current) : undefined;
  const rounds = season?.rounds.map((r) => r.round) ?? [];
  const [{ rows, members }, mine, lineupRow] = await Promise.all([
    getStandings(sb, league.id, rounds),
    round ? getSelections(sb, league.id, { userId: ctx.user.id, round: round.round }) : Promise.resolve([]),
    round ? sb.from("lineups").select("status").eq("league_id", league.id).eq("user_id", ctx.user.id).eq("round", round.round).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const myRow = rows.find((r) => r.userId === ctx.user.id);
  const names = new Map(members.map((m) => [m.user_id, m.display_name]));
  const players = await getPlayers(sb, mine.flatMap((s) => (s.player_id ? [s.player_id] : [])));
  const slots = slotsFor(league.roster_config);
  const fieldPlayers: FieldPlayer[] = mine.map((s) => {
    const p = s.player_id ? players.get(s.player_id) : undefined;
    const team = season?.teams.get(p?.team_id ?? s.dst_team_id ?? "");
    return { slot: s.slot, name: p?.full_name ?? (team ? `${team.name} D/ST` : "D/ST"), team: teamLike(team), dst: !!s.dst_team_id, points: s.locked ? s.points ?? 0 : null, locked: s.locked };
  });
  const roundPts = mine.reduce((t, s) => t + (s.points ?? 0), 0);
  const now = new Date();
  const nextKickoff = season?.games.filter((g) => !gameIsLocked(g, now)).map((g) => g.kickoff_at).sort()[0] ?? null;
  const live = season?.games.some((g) => g.status === "live" || g.status === "halftime") ?? false;

  // Live highlights: the best fantasy performances of the current round (league scoring).
  const roundGameIds = round?.games.map((g) => g.id) ?? [];
  const pts = season ? (await getPoints(sb, league.scoring_config_id, roundGameIds)).sort((a, b) => b.points - a.points).slice(0, 5) : [];
  const topPlayers = await getPlayers(sb, pts.flatMap((p) => (p.player_id ? [p.player_id] : [])));
  const myKeys = new Set(mine.map(subjectKey));

  return (
    <>
      <RememberLeague id={league.id} />
      <Greeting name={first} sub={`${round?.name ?? season?.label ?? ""} · ${league.name}`} />
      <LiveRefresh active={live} everyMs={30_000} />
      <div className="space-y-3">
        {season?.isSample ? <Notice tone="amber"><b>Sample postseason</b> for testing: games, results and stats are simulated.</Notice> : null}
        {round && season ? <RoundBanner round={round} nextKickoff={nextKickoff} nextPending={season.nextPending} href={`/lineup?league=${league.id}`} /> : null}
        {round ? (
          <>
            <FieldScene
              href={`/lineup?league=${league.id}&round=${round.round}`}
              roundName={`${round.short_name} lineup`}
              points={roundPts}
              rank={myRow?.rank ?? null}
              members={members.length}
              players={fieldPlayers}
              status={round.status === "complete" ? "Final" : round.status === "in_progress" ? "● Live" : `${mine.length}/${slots.length} picked`}
            />
            {round.status !== "complete" ? (
              mine.length < slots.length ? (
                <Notice tone="amber"><Link href={`/lineup?league=${league.id}`} className="font-bold">{slots.length - mine.length} spot{slots.length - mine.length === 1 ? "" : "s"} still empty for the {round.short_name} round. Pick now →</Link></Notice>
              ) : lineupRow.data?.status !== "submitted" ? (
                <Notice tone="amber"><Link href={`/lineup?league=${league.id}`} className="font-bold">All nine picked. Submit your lineup →</Link></Notice>
              ) : <Notice tone="mint">✓ Lineup submitted. You can swap any pick until its game kicks off.</Notice>
            ) : null}
          </>
        ) : null}

        {ctx.leagues.length ? (
          <section>
            <SectionHeading action={<Link href="/leagues" className="link text-xs">All</Link>}>My leagues</SectionHeading>
            <div className="-mb-2 flex snap-x gap-3 overflow-x-auto px-3 pb-3 sm:px-0 [scrollbar-width:none]">
              {ctx.leagues.map((l, i) => (
                <Link key={l.id} href={`/leagues/${l.id}`} className={`${TILES[i % TILES.length]} flex w-44 shrink-0 snap-start flex-col rounded-2xl p-3 shadow-lg shadow-black/30 transition active:scale-[0.98]`}>
                  <div className="flex items-center justify-between">
                    <span className="rounded-full bg-white/35 px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide">{l.role === "commissioner" ? "Commish" : "Member"}</span>
                    <span className="text-[10px] font-bold opacity-70">{l.max_members} max</span>
                  </div>
                  <span className="my-3 grid place-items-center text-3xl" aria-hidden>🏟️</span>
                  <span className="truncate text-[14px] font-extrabold">{l.name}</span>
                  <span className="text-[11px] font-semibold opacity-75">{l.id === league.id && myRow ? `#${myRow.rank} · ${myRow.total.toFixed(1)} pts` : "Open league →"}</span>
                </Link>
              ))}
            </div>
          </section>
        ) : null}

        <Card flush title="Standings" action={<Link href={`/standings?league=${league.id}`} className="link text-xs">Full table</Link>}>
          <StandingsTable rows={rows.slice(0, 5)} names={names} me={ctx.user.id} />
        </Card>

        {season ? <UpcomingGames season={season} /> : null}

        <Card flush title={round ? `Top performers · ${round.short_name}` : "Top performers"}>
          {pts.length === 0 ? <Empty>No points scored yet this round. They appear here live once games kick off.</Empty> : (
            <ul className="divide-y divide-gray-100">
              {pts.map((p, i) => {
                const pl = p.player_id ? topPlayers.get(p.player_id) : undefined;
                const team = season?.teams.get(pl?.team_id ?? p.dst_team_id ?? "");
                const name = pl?.full_name ?? `${team?.name ?? ""} D/ST`;
                return (
                  <li key={subjectKey(p) + p.game_id}>
                    <Link href={pl ? `/players/${pl.id}` : `/games/${p.game_id}`} className="flex items-center gap-3 px-4 py-2.5 active:bg-gray-50">
                      <span className={`w-4 shrink-0 text-center text-xs font-black ${i === 0 ? "text-gold-400" : "text-gray-400"}`}>{i + 1}</span>
                      <SubjectAvatar name={name} team={teamLike(team)} dst={!pl} size={36} />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-bold">{name}{myKeys.has(subjectKey(p)) ? <span className="ml-1.5 text-[10px] font-extrabold text-gold-300">YOURS</span> : null}</div>
                        <div className="truncate text-xs text-gray-500">{pl?.position ?? "D/ST"} · {team?.abbreviation} · {p.status === "provisional" ? "live" : p.status}</div>
                      </div>
                      <span className="shrink-0 text-base font-extrabold tabular-nums">{p.points.toFixed(1)}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}

function Greeting({ name, sub }: { name: string; sub: string }) {
  return (
    <div className="flex items-center gap-3 px-4 pb-3 pt-4 sm:px-0">
      <div className="min-w-0 flex-1">
        <h1 className="truncate text-2xl font-extrabold tracking-tight">Hi {name}</h1>
        <p className="truncate text-sm text-gray-500">{sub}</p>
      </div>
      <Link href="/profile" aria-label="Profile"><Avatar name={name} size={46} ring="#f9c22e" /></Link>
    </div>
  );
}

/** Today's and upcoming games as tiles; live games glow pink (Sideout's "Watch live" row). */
function UpcomingGames({ season }: { season: NonNullable<Awaited<ReturnType<typeof getSeasonView>>> }) {
  const games = season.games.filter((g) => g.status !== "final" && g.status !== "cancelled").slice(0, 8);
  const recent = games.length ? [] : season.games.filter((g) => g.status === "final").slice(-4).reverse();
  const list = games.length ? games : recent;
  const round = (n: number) => season.rounds.find((r) => r.round === n)?.short_name ?? `R${n}`;
  return (
    <section>
      <SectionHeading action={<Link href="/games" className="link text-xs">All games</Link>}>
        <span className="flex items-center gap-2">
          {season.games.some((g) => g.status === "live" || g.status === "halftime") ? <span className="relative flex h-2.5 w-2.5"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-60" /><span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-red-500" /></span> : null}
          {games.length ? "Upcoming & live" : "Recent results"}
        </span>
      </SectionHeading>
      {list.length === 0 ? <Empty>The playoff schedule appears here once it&apos;s set.</Empty> : (
        <div className="-mb-2 flex snap-x gap-3 overflow-x-auto px-3 pb-3 sm:px-0 [scrollbar-width:none]">
          {list.map((g, i) => {
            const live = g.status === "live" || g.status === "halftime";
            const final = g.status === "final";
            const home = teamLike(season.teams.get(g.home_team_id));
            const away = teamLike(season.teams.get(g.away_team_id));
            return (
              <Link key={g.id} href={`/games/${g.id}`} className={`${live ? "tile-pink" : final ? "bg-surface-3 text-gray-900" : GAME_TILES[i % GAME_TILES.length]} relative flex w-40 shrink-0 snap-start flex-col rounded-2xl p-3 shadow-lg shadow-black/30 active:scale-[0.98]`}>
                <div className="flex items-center justify-between">
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide ${final ? "bg-white/10" : "bg-white/35"}`}>
                    {live ? `● ${g.status === "halftime" ? "Half" : g.period ?? "Live"}` : final ? "Final" : <LocalTime iso={g.kickoff_at} mode="kickoff" />}
                  </span>
                  <span className="text-[10px] font-bold opacity-70">{round(g.round)}</span>
                </div>
                <div className="my-3 flex items-center justify-center gap-2">
                  <TeamChip team={away} />
                  <span className="text-xs font-black opacity-60">@</span>
                  <TeamChip team={home} />
                </div>
                {g.home_score !== null ? (
                  <div className="flex items-center justify-center gap-3 text-xl font-black tabular-nums">
                    <span>{g.away_score}</span><span className="text-xs opacity-50">–</span><span>{g.home_score}</span>
                  </div>
                ) : <span className="rounded-full bg-charcoal/85 py-1 text-center text-[11px] font-extrabold text-white">Kickoff <LocalTime iso={g.kickoff_at} mode="time" /></span>}
              </Link>
            );
          })}
        </div>
      )}
    </section>
  );
}
