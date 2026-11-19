import Link from "next/link";
import { getContext, getSeasonView, pickLeague } from "@/lib/data/context";
import { getStandings } from "@/lib/data/queries";
import { roundStandings } from "@/lib/standings/standings";
import { StandingsTable } from "@/components/standings-table";
import { LeagueSwitcher } from "@/components/league-switcher";
import { LiveRefresh } from "@/components/live-refresh";
import { Card, Empty, Freshness, PageHeader } from "@/components/ui";

export const metadata = { title: "Standings" };

export default async function Standings({ searchParams }: { searchParams: Promise<{ league?: string; view?: string; round?: string }> }) {
  const sp = await searchParams;
  const ctx = await getContext();
  const league = pickLeague(ctx, sp.league);
  if (!league) return <><PageHeader title="Standings" /><Empty>Join a league to see standings. <Link href="/leagues" className="link">My Leagues →</Link></Empty></>;
  const season = await getSeasonView(league.season_id);
  const rounds = season?.rounds ?? [];
  const current = season?.current ?? 1;
  const view = sp.view === "round" ? "round" : "overall";
  const shownRound = Number(sp.round) || current;
  const { rows, members, scores } = await getStandings(ctx.supabase, league.id, rounds.map((r) => r.round));
  const names = new Map(members.map((m) => [m.user_id, m.display_name]));
  const roundRows = roundStandings(members.map((m) => m.user_id), scores, shownRound);
  const roundName = rounds.find((r) => r.round === shownRound)?.short_name ?? `Round ${shownRound}`;
  const live = season?.games.some((g) => g.status === "live" || g.status === "halftime") ?? false;
  const tab = (label: string, href: string, on: boolean) => <Link href={href} className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-bold transition-colors ${on ? "bg-gold-400 text-charcoal" : "bg-surface-2 text-gray-600"}`}>{label}</Link>;
  const base = `/standings?league=${league.id}`;

  return (
    <>
      <PageHeader title="Standings" subtitle={<>{league.name} · <Freshness label="Updated" at={season?.lastSync} /></>} />
      <LeagueSwitcher leagues={ctx.leagues} current={league.id} />
      <LiveRefresh active={live} everyMs={30_000} />
      <div className="space-y-3">
        <div className="flex gap-2 overflow-x-auto px-4 sm:px-0 [scrollbar-width:none]">
          {tab("Cumulative", base, view === "overall")}
          {rounds.map((r) => tab(r.round === current ? `${r.short_name} (current)` : r.short_name, `${base}&view=round&round=${r.round}`, view === "round" && shownRound === r.round))}
        </div>
        {view === "overall" ? (
          <Card flush title="Total playoff points">
            <StandingsTable rows={rows} names={names} me={ctx.user.id} roundLabel={rounds.find((r) => r.round === current)?.short_name} roundOf={(r) => r.byRound[current] ?? 0} />
          </Card>
        ) : (
          <Card flush title={`${roundName} round`}>
            <StandingsTable rows={roundRows} names={names} me={ctx.user.id} roundLabel={roundName} roundOf={(r) => r.byRound[shownRound] ?? 0} showTotal={false} />
          </Card>
        )}
        <Card flush title="Round by round">
          <div className="overflow-x-auto">
            <table className="table">
              <thead><tr><th>#</th><th>Participant</th>{rounds.map((r) => <th key={r.round} className="text-right">{r.short_name}</th>)}<th className="text-right">Total</th><th className="text-right">+/–</th></tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.userId} className={r.userId === ctx.user.id ? "bg-gold-400/10" : ""}>
                    <td className="font-black">{r.tied ? `T${r.rank}` : r.rank}</td>
                    <td className="font-bold">{names.get(r.userId)}</td>
                    {rounds.map((x) => {
                      const best = Math.max(...rows.map((y) => y.byRound[x.round] ?? 0));
                      const v = r.byRound[x.round] ?? 0;
                      return <td key={x.round} className={`text-right tabular-nums ${v > 0 && v === best ? "font-extrabold text-gold-300" : "text-gray-700"}`}>{x.status === "pending" ? "–" : v.toFixed(1)}</td>;
                    })}
                    <td className="text-right font-extrabold tabular-nums">{r.total.toFixed(1)}</td>
                    <td className="text-right tabular-nums text-gray-500">{r.behind > 0 ? `−${r.behind.toFixed(1)}` : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="border-t border-gray-100 px-4 py-2.5 text-[11px] text-gray-500">Gold = best score of that round. Ties are broken by the Super Bowl score, then Conference, Divisional and Wild Card; anyone still level shares the position.</p>
        </Card>
      </div>
    </>
  );
}
