import Link from "next/link";
import { notFound } from "next/navigation";
import { getContext, getSeasonView, pickLeague } from "@/lib/data/context";
import { defaultScoringConfigId, getPoints } from "@/lib/data/queries";
import { teamLike } from "@/lib/data/pool";
import { LocalTime } from "@/components/local-time";
import { PointsButton } from "@/components/points-breakdown";
import { positionText } from "@/components/position";
import { SubjectAvatar, TeamChip } from "@/components/team-chip";
import { Badge, Card, Empty, GameStatus } from "@/components/ui";
import type { OffenseStats } from "@/lib/scoring/engine";

const GROUPS: Array<{ title: string; rows: Array<[keyof OffenseStats, string]> }> = [
  { title: "Passing", rows: [["passYds", "Yards"], ["passTd", "Touchdowns"], ["passInt", "Interceptions"], ["pass2pt", "2-pt"]] },
  { title: "Rushing", rows: [["rushYds", "Yards"], ["rushTd", "Touchdowns"], ["rush2pt", "2-pt"]] },
  { title: "Receiving", rows: [["rec", "Receptions"], ["recYds", "Yards"], ["recTd", "Touchdowns"], ["rec2pt", "2-pt"]] },
  { title: "Kicking", rows: [["fgMade0_39", "FG 0–39"], ["fgMade40_49", "FG 40–49"], ["fgMade50p", "FG 50+"], ["fgMissed", "FG missed"], ["xpMade", "XP"], ["xpMissed", "XP missed"]] },
  { title: "Ball security", rows: [["fumLost", "Fumbles lost"]] },
];

export default async function PlayerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await getContext();
  const sb = ctx.supabase;
  const { data: player } = await sb.from("nfl_players").select("*").eq("id", id).maybeSingle();
  if (!player) notFound();
  const league = pickLeague(ctx, undefined);
  const season = await getSeasonView(league?.season_id ?? null);
  const team = season?.teams.get(player.team_id ?? "");
  const configId = league?.scoring_config_id ?? (await defaultScoringConfigId(sb));
  const gameIds = season?.games.map((g) => g.id) ?? [];
  const [{ data: stats }, points, { data: usage }] = await Promise.all([
    sb.from("player_game_stats").select("game_id, stats").eq("player_id", id),
    configId ? getPoints(sb, configId, gameIds) : Promise.resolve([]),
    sb.from("lineup_selections").select("league_id, round, slot").eq("user_id", ctx.user.id).eq("player_id", id).eq("status", "active"),
  ]);
  const myPts = points.filter((p) => p.player_id === id);
  const total = myPts.reduce((t, p) => t + p.points, 0);
  const log = (season?.games ?? []).filter((g) => g.home_team_id === player.team_id || g.away_team_id === player.team_id);

  return (
    <>
      <section className="mx-3 mt-4 flex items-center gap-4 rounded-3xl bg-surface p-4 shadow-xl shadow-black/30 sm:mx-0">
        <SubjectAvatar name={player.full_name} team={teamLike(team)} size={72} />
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-2xl font-black tracking-tight">{player.full_name}</h1>
          <div className="mt-0.5 flex flex-wrap items-center gap-2 text-sm text-gray-500">
            <span className={`font-extrabold ${positionText(player.position)}`}>{player.position}</span>
            <TeamChip team={teamLike(team)} size="sm" /> <span>{team?.city} {team?.name}</span>{player.jersey_number ? <span>#{player.jersey_number}</span> : null}
            {player.injury_status ? <Badge tone={["Out", "IR"].includes(player.injury_status) ? "red" : "amber"}>{player.injury_status}{player.injury_note ? ` · ${player.injury_note}` : ""}</Badge> : null}
          </div>
        </div>
        <div className="text-right"><div className="text-[10px] font-extrabold uppercase text-gray-500">Playoff pts</div><div className="text-2xl font-black tabular-nums text-gold-300">{total.toFixed(1)}</div></div>
      </section>
      <div className="mt-3 space-y-3">
        <Card title="Your One-and-Done status">
          {ctx.leagues.length === 0 ? <p className="text-sm text-gray-500">Join a league to use players.</p> : (
            <ul className="space-y-1.5 text-sm">
              {ctx.leagues.map((l) => {
                const u = (usage ?? []).find((x) => x.league_id === l.id);
                const rn = season?.rounds.find((r) => r.round === u?.round)?.short_name;
                return <li key={l.id} className="flex items-center justify-between gap-2"><Link href={`/leagues/${l.id}`} className="truncate font-semibold hover:underline">{l.name}</Link>{u ? <Badge>Used · {rn} ({u.slot})</Badge> : <Badge tone="mint">Available</Badge>}</li>;
              })}
            </ul>
          )}
        </Card>
        {log.length === 0 ? <Card><Empty>No playoff games for this player yet.</Empty></Card> : log.map((g) => {
          const st = (stats ?? []).find((s) => s.game_id === g.id)?.stats as OffenseStats | undefined;
          const fp = myPts.find((p) => p.game_id === g.id);
          const opp = season?.teams.get(g.home_team_id === player.team_id ? g.away_team_id : g.home_team_id);
          const rn = season?.rounds.find((r) => r.round === g.round)?.name ?? "";
          const groups = GROUPS.map((gr) => ({ ...gr, rows: gr.rows.filter(([k]) => st && st[k]) })).filter((gr) => gr.rows.length);
          return (
            <Card key={g.id} flush title={<span className="flex items-center gap-2">{rn}</span>} action={<Link href={`/games/${g.id}`} className="link text-xs">Box score</Link>}>
              <div className="flex items-center gap-3 border-b border-gray-100 px-4 py-3">
                <span className="text-sm text-gray-500">{g.home_team_id === player.team_id ? "vs" : "@"}</span>
                <TeamChip team={teamLike(opp)} size="sm" />
                <span className="text-sm font-bold">{g.away_score ?? ""}{g.home_score !== null ? "–" : ""}{g.home_score ?? ""}</span>
                <GameStatus status={g.status} kickoff={g.kickoff_at} period={g.period} clock={g.clock} />
                <span className="ml-auto text-right">{fp ? <PointsButton value={fp.points} name={player.full_name} team={teamLike(team)} subtitle={rn} lines={fp.breakdown} status={fp.status} className="text-xl font-black" /> : <span className="text-sm text-gray-500"><LocalTime iso={g.kickoff_at} /></span>}</span>
              </div>
              {groups.length ? (
                <div className="grid gap-x-6 gap-y-3 p-4 sm:grid-cols-3">
                  {groups.map((gr) => (
                    <div key={gr.title}>
                      <p className="mb-1 text-[11px] font-extrabold uppercase tracking-wide text-gray-500">{gr.title}</p>
                      {gr.rows.map(([k, label]) => <p key={k} className="flex justify-between text-sm"><span className="text-gray-600">{label}</span><span className="font-bold tabular-nums">{st![k]}</span></p>)}
                    </div>
                  ))}
                </div>
              ) : <p className="px-4 py-3 text-sm text-gray-500">{g.status === "final" ? "No statistics recorded." : "Statistics appear once the game kicks off."}</p>}
            </Card>
          );
        })}
      </div>
    </>
  );
}
