import Link from "next/link";
import { notFound } from "next/navigation";
import { getContext, getSeasonView, pickLeague } from "@/lib/data/context";
import { defaultScoringConfigId, getPlayers, getPoints, getSelections, subjectKey } from "@/lib/data/queries";
import { teamLike } from "@/lib/data/pool";
import { LiveRefresh } from "@/components/live-refresh";
import { LocalTime } from "@/components/local-time";
import { PointsButton } from "@/components/points-breakdown";
import { positionText } from "@/components/position";
import { TeamChip } from "@/components/team-chip";
import { Card, Empty, Freshness, GameStatus, ScoreStatus } from "@/components/ui";
import type { DstStats, OffenseStats } from "@/lib/scoring/engine";

const COLS: Array<{ key: keyof OffenseStats; label: string }> = [
  { key: "passYds", label: "PaYd" }, { key: "passTd", label: "PaTD" }, { key: "passInt", label: "INT" },
  { key: "rushYds", label: "RuYd" }, { key: "rushTd", label: "RuTD" },
  { key: "rec", label: "Rec" }, { key: "recYds", label: "ReYd" }, { key: "recTd", label: "ReTD" }, { key: "fumLost", label: "FL" },
];

export default async function GamePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await getContext();
  const sb = ctx.supabase;
  const { data: game } = await sb.from("nfl_games").select("*").eq("id", id).maybeSingle();
  if (!game) notFound();
  const league = pickLeague(ctx, undefined);
  const season = await getSeasonView(game.season_id);
  const configId = league && league.season_id === game.season_id ? league.scoring_config_id : await defaultScoringConfigId(sb);
  const [{ data: stats }, { data: dst }, points, mine] = await Promise.all([
    sb.from("player_game_stats").select("player_id, team_id, stats, imported_at").eq("game_id", id),
    sb.from("dst_game_stats").select("team_id, stats, imported_at").eq("game_id", id),
    configId ? getPoints(sb, configId, [id]) : Promise.resolve([]),
    league ? getSelections(sb, league.id, { userId: ctx.user.id }) : Promise.resolve([]),
  ]);
  const players = await getPlayers(sb, (stats ?? []).map((s) => s.player_id));
  const pts = new Map(points.map((p) => [subjectKey(p), p]));
  const myKeys = new Set(mine.filter((s) => s.game_id === id).map(subjectKey));
  const home = teamLike(season?.teams.get(game.home_team_id));
  const away = teamLike(season?.teams.get(game.away_team_id));
  const live = game.status === "live" || game.status === "halftime";
  const roundName = season?.rounds.find((r) => r.round === game.round)?.name ?? "";
  const updated = [...(stats ?? []), ...(dst ?? [])].map((s) => s.imported_at as string).sort().pop() ?? null;

  const side = (teamId: string) => (stats ?? []).filter((s) => s.team_id === teamId)
    .map((s) => ({ s, p: players.get(s.player_id), fp: pts.get(s.player_id) }))
    .sort((a, b) => (b.fp?.points ?? 0) - (a.fp?.points ?? 0));

  return (
    <>
      <LiveRefresh active={live} everyMs={20_000} />
      <section className="relative mx-3 mt-4 overflow-hidden rounded-3xl bg-gradient-to-br from-turf-600 via-turf-800 to-charcoal p-5 shadow-xl shadow-black/40 sm:mx-0">
        <div aria-hidden className="pointer-events-none absolute inset-0 opacity-20 [background:repeating-linear-gradient(90deg,transparent_0,transparent_44px,rgba(255,255,255,.6)_44px,rgba(255,255,255,.6)_46px)]" />
        <div className="relative">
          <div className="flex items-center justify-between text-xs">
            <span className="font-extrabold uppercase tracking-wide text-gold-300">{roundName}</span>
            <GameStatus status={game.status} kickoff={game.kickoff_at} period={game.period} clock={game.clock} />
          </div>
          <div className="mt-4 grid grid-cols-[1fr_auto_1fr] items-center gap-3 text-center">
            <div className="flex flex-col items-center gap-1"><TeamChip team={away} size="lg" /><span className="text-xs font-bold text-gray-700">{season?.teams.get(game.away_team_id)?.name}</span></div>
            <div className="text-4xl font-black tabular-nums">{game.away_score ?? "–"} <span className="text-lg text-gray-500">:</span> {game.home_score ?? "–"}</div>
            <div className="flex flex-col items-center gap-1"><TeamChip team={home} size="lg" /><span className="text-xs font-bold text-gray-700">{season?.teams.get(game.home_team_id)?.name}</span></div>
          </div>
          <p className="mt-3 text-center text-xs text-gray-600">Kickoff <LocalTime iso={game.kickoff_at} /> · <Freshness at={updated} /></p>
        </div>
      </section>

      <div className="mt-3 space-y-3">
        {(stats ?? []).length === 0 ? <Card><Empty>Player statistics appear here once the game kicks off.</Empty></Card> : null}
        {[game.away_team_id, game.home_team_id].map((tid) => {
          const rows = side(tid);
          const t = season?.teams.get(tid);
          const d = (dst ?? []).find((x) => x.team_id === tid);
          const dfp = pts.get(`dst:${tid}`);
          if (!rows.length && !d) return null;
          return (
            <Card key={tid} flush title={<span className="flex items-center gap-2"><TeamChip team={teamLike(t)} size="sm" />{t?.city} {t?.name}</span>}>
              <div className="overflow-x-auto">
                <table className="table min-w-[640px]">
                  <thead><tr><th>Player</th>{COLS.map((c) => <th key={c.key} className="text-right">{c.label}</th>)}<th className="text-right">FPts</th></tr></thead>
                  <tbody>
                    {rows.map(({ s, p, fp }) => (
                      <tr key={s.player_id} className={myKeys.has(s.player_id) ? "bg-gold-400/10" : ""}>
                        <td><Link href={`/players/${s.player_id}`} className="font-bold hover:underline">{p?.full_name}</Link> <span className={`text-[11px] font-bold ${positionText(p?.position)}`}>{p?.position}</span>{myKeys.has(s.player_id) ? <span className="ml-1 text-[10px] font-extrabold text-gold-300">YOURS</span> : null}</td>
                        {COLS.map((c) => <td key={c.key} className="text-right tabular-nums text-gray-700">{(s.stats as OffenseStats)[c.key] ?? ""}</td>)}
                        <td className="text-right">{fp ? <PointsButton value={fp.points} name={p?.full_name ?? ""} team={teamLike(t)} subtitle={roundName} lines={fp.breakdown} status={fp.status} className="font-extrabold" /> : "–"}</td>
                      </tr>
                    ))}
                    {d ? (
                      <tr className={myKeys.has(`dst:${tid}`) ? "bg-gold-400/10" : ""}>
                        <td className="font-bold">D/ST <span className="text-[11px] text-gray-500">{(["sacks", "ints", "fumRec"] as Array<keyof DstStats>).map((k) => `${(d.stats as DstStats)[k] ?? 0} ${k === "sacks" ? "sk" : k === "ints" ? "int" : "fr"}`).join(" · ")} · {(d.stats as DstStats).pointsAllowed ?? 0} PA</span></td>
                        <td colSpan={COLS.length} />
                        <td className="text-right">{dfp ? <PointsButton value={dfp.points} name={`${t?.name} D/ST`} team={teamLike(t)} dst subtitle={roundName} lines={dfp.breakdown} status={dfp.status} className="font-extrabold" /> : "–"}</td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
              <div className="flex items-center justify-between border-t border-gray-100 px-4 py-2 text-[11px] text-gray-500"><span>Kickers: see their player page for field goals by distance.</span><ScoreStatus status={dfp?.status ?? rows[0]?.fp?.status} /></div>
            </Card>
          );
        })}
      </div>
    </>
  );
}
