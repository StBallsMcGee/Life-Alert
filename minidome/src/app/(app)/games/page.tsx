import Link from "next/link";
import { getContext, getSeasonView, parseRound, pickLeague } from "@/lib/data/context";
import { teamLike } from "@/lib/data/pool";
import { RoundSteps } from "@/components/round-tracker";
import { LiveRefresh } from "@/components/live-refresh";
import { LocalTime } from "@/components/local-time";
import { TeamChip } from "@/components/team-chip";
import { Empty, Freshness, GameStatus, Notice, PageHeader, SectionHeading } from "@/components/ui";

export const metadata = { title: "NFL Games" };

export default async function Games({ searchParams }: { searchParams: Promise<{ round?: string }> }) {
  const sp = await searchParams;
  const ctx = await getContext();
  const league = pickLeague(ctx, undefined);
  const season = await getSeasonView(league?.season_id ?? null);
  if (!season) return <><PageHeader title="NFL Games" /><Empty>The playoff schedule hasn&apos;t been loaded yet.</Empty></>;
  const round = parseRound(sp.round, season) ?? 1;
  const r = season.rounds.find((x) => x.round === round);
  const games = r?.games ?? [];
  const groups: Array<[string, typeof games]> = [
    ["Live", games.filter((g) => ["live", "halftime", "suspended"].includes(g.status))],
    ["Upcoming", games.filter((g) => ["scheduled", "pregame", "postponed"].includes(g.status))],
    ["Completed", games.filter((g) => ["final", "cancelled"].includes(g.status))],
  ];
  const byes = round === 1 ? [...season.playoffTeams.keys()].filter((t) => !games.some((g) => g.home_team_id === t || g.away_team_id === t)) : [];

  return (
    <>
      <PageHeader title="NFL Games" subtitle={<>{season.label} · <Freshness at={season.lastSync} /></>} />
      <LiveRefresh active={groups[0]![1].length > 0} everyMs={30_000} />
      <div className="space-y-3">
        <RoundSteps rounds={season.rounds} current={round} hrefFor={(n) => `/games?round=${n}`} />
        {season.isSample ? <Notice tone="amber">Sample postseason: simulated games for testing.</Notice> : null}
        {games.length === 0 ? <Empty>{r?.name ?? "This round"}: matchups are set when the previous round ends.</Empty> : null}
        {groups.map(([label, list]) => list.length ? (
          <section key={label}>
            <SectionHeading>{label === "Live" ? <span className="flex items-center gap-2"><span className="relative flex h-2.5 w-2.5"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-60" /><span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-red-500" /></span>Live now</span> : label}</SectionHeading>
            <div className="grid gap-3 px-3 sm:grid-cols-2 sm:px-0">
              {list.map((g) => {
                const home = season.teams.get(g.home_team_id);
                const away = season.teams.get(g.away_team_id);
                const done = g.status === "final";
                const row = (t: typeof home, score: number | null, won: boolean, seed: number | null | undefined) => (
                  <div className="flex items-center gap-3">
                    <TeamChip team={teamLike(t)} />
                    <span className={`min-w-0 flex-1 truncate text-[15px] ${done && !won ? "text-gray-500" : "font-extrabold"}`}>{seed ? <span className="mr-1 text-[11px] text-gray-500">{seed}</span> : null}{t?.city} {t?.name}</span>
                    <span className={`text-2xl font-black tabular-nums ${done && !won ? "text-gray-500" : ""}`}>{score ?? ""}</span>
                  </div>
                );
                return (
                  <Link key={g.id} href={`/games/${g.id}`} className="block rounded-2xl bg-surface p-4 shadow-lg shadow-black/20 transition active:scale-[0.99]">
                    <div className="mb-3 flex items-center justify-between text-xs">
                      <GameStatus status={g.status} kickoff={g.kickoff_at} period={g.period} clock={g.clock} />
                      <span className="text-gray-500"><LocalTime iso={g.kickoff_at} /></span>
                    </div>
                    <div className="space-y-2">
                      {row(away, g.away_score, g.winner_team_id === g.away_team_id, season.playoffTeams.get(g.away_team_id))}
                      {row(home, g.home_score, g.winner_team_id === g.home_team_id, season.playoffTeams.get(g.home_team_id))}
                    </div>
                  </Link>
                );
              })}
            </div>
          </section>
        ) : null)}
        {byes.length ? (
          <section>
            <SectionHeading>First-round byes</SectionHeading>
            <div className="flex flex-wrap gap-2 px-4 sm:px-0">
              {byes.map((t) => <span key={t} className="flex items-center gap-2 rounded-full bg-surface px-3 py-1.5 text-sm font-bold"><TeamChip team={teamLike(season.teams.get(t))} size="sm" />{season.teams.get(t)?.name} <span className="text-xs text-gray-500">play in the Divisional Round</span></span>)}
            </div>
          </section>
        ) : null}
      </div>
    </>
  );
}
