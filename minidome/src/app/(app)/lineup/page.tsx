import Link from "next/link";
import { getContext, getSeasonView, parseRound, pickLeague, roundOf } from "@/lib/data/context";
import { getPlayers, getPoints, getSelections, subjectKey } from "@/lib/data/queries";
import { buildPool, teamLike, type SlotEntry } from "@/lib/data/pool";
import { slotsFor } from "@/lib/league/roster";
import { LeagueSwitcher } from "@/components/league-switcher";
import { RoundSteps } from "@/components/round-tracker";
import { Empty, Freshness, Notice, PageHeader } from "@/components/ui";
import { LiveRefresh } from "@/components/live-refresh";
import { LineupBuilder } from "@/components/lineup-builder";

export const metadata = { title: "Lineup" };

export default async function LineupPage({ searchParams }: { searchParams: Promise<{ league?: string; round?: string }> }) {
  const sp = await searchParams;
  const ctx = await getContext();
  const league = pickLeague(ctx, sp.league);
  if (!league) {
    return (
      <>
        <PageHeader title="Lineup" />
        <Empty>Join or create a league to build a lineup. <Link href="/leagues" className="link">My Leagues →</Link></Empty>
      </>
    );
  }
  const season = await getSeasonView(league.season_id);
  if (!season) return <Empty>The NFL schedule hasn&apos;t been loaded yet.</Empty>;
  const round = parseRound(sp.round, season) ?? 1;
  const r = roundOf(season, round);
  const sb = ctx.supabase;
  const [mine, players, lineupRow] = await Promise.all([
    getSelections(sb, league.id, { userId: ctx.user.id }),
    getPlayers(sb),
    sb.from("lineups").select("status, submitted_at").eq("league_id", league.id).eq("user_id", ctx.user.id).eq("round", round).maybeSingle(),
  ]);
  const points = await getPoints(sb, league.scoring_config_id, season.games.map((g) => g.id));
  const pool = buildPool({ season, round, players, mySelections: mine, points });
  const slots = slotsFor(league.roster_config);
  const thisRound = mine.filter((s) => s.round === round);
  const slotEntries: SlotEntry[] = slots.map((slot) => {
    const s = thisRound.find((x) => x.slot === slot);
    return { slot, selectionId: s?.id ?? null, key: s ? subjectKey(s) : null, locked: !!s?.locked, points: s?.points ?? null, scoreStatus: s?.score_status ?? null, breakdown: s?.breakdown ?? [] };
  });
  // Picks in this round always appear in the pool even if they are now unavailable (e.g. kicked off).
  const teams = Object.fromEntries([...season.teams.values()].map((t) => [t.id, teamLike(t)!]));
  const anyLive = r?.games.some((g) => g.status === "live" || g.status === "halftime") ?? false;

  return (
    <>
      <PageHeader title="Lineup" subtitle={<>{league.name} · <Freshness at={season.lastSync} /></>} />
      <LeagueSwitcher leagues={ctx.leagues} current={league.id} extra={`&round=${round}`} />
      <div className="space-y-3">
        <RoundSteps rounds={season.rounds} current={round} hrefFor={(n) => `/lineup?league=${league.id}&round=${n}`} />
        <LiveRefresh active={anyLive} everyMs={30_000} />
        {season.isSample ? <Notice tone="amber"><b>Sample postseason.</b> Schedules, results and stats are simulated for testing until a licensed NFL data feed is connected.</Notice> : null}
        {!r || r.status === "pending" ? (
          <Notice>The {r?.name ?? "next round"} matchups are set when the previous round finishes. Come back then to pick your players.</Notice>
        ) : (
          <LineupBuilder
            leagueId={league.id}
            round={round}
            roundName={r.name}
            roundStatus={r.status}
            lineupStatus={(lineupRow.data?.status as "draft" | "submitted" | undefined) ?? "draft"}
            allowIncomplete={league.allow_incomplete}
            slots={slotEntries}
            pool={pool}
            teams={teams}
          />
        )}
      </div>
    </>
  );
}
