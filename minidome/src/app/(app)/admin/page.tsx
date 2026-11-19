import { getContext, getSeasonView } from "@/lib/data/context";
import { getPlayers } from "@/lib/data/queries";
import { SyncControls, StatCorrection, VoidSelection, type StatOption } from "@/components/admin-panels";
import { LocalTime, Relative } from "@/components/local-time";
import { Badge, Card, Empty, Notice, PageHeader } from "@/components/ui";

export const metadata = { title: "Admin" };

export default async function Admin() {
  const ctx = await getContext();
  if (!ctx.profile?.is_site_admin) return <><PageHeader title="Admin" /><Notice tone="red">Site administrators only.</Notice></>;
  const sb = ctx.supabase;
  const season = await getSeasonView(null);
  const gameIds = season?.games.map((g) => g.id) ?? [];
  const since = new Date(Date.now() - 86400_000).toISOString();
  const [{ data: runs }, { count: runs24 }, { count: fails24 }, { count: users }, { count: leagues }, { data: audit }, { data: pstats }, { data: dstats }, { data: stuck }, { data: revisions }] = await Promise.all([
    sb.from("sync_runs").select("*").order("started_at", { ascending: false }).limit(15),
    sb.from("sync_runs").select("id", { count: "exact", head: true }).gte("started_at", since),
    sb.from("sync_runs").select("id", { count: "exact", head: true }).gte("started_at", since).eq("ok", false),
    sb.from("profiles").select("id", { count: "exact", head: true }),
    sb.from("leagues").select("id", { count: "exact", head: true }),
    sb.from("audit_log").select("id, action, entity, reason, at").order("at", { ascending: false }).limit(20),
    gameIds.length ? sb.from("player_game_stats").select("player_id, game_id, stats").in("game_id", gameIds) : Promise.resolve({ data: [] }),
    gameIds.length ? sb.from("dst_game_stats").select("team_id, game_id, stats").in("game_id", gameIds) : Promise.resolve({ data: [] }),
    sb.from("v_selection_points").select("id, user_id, round, slot, player_id, dst_team_id, game_status").in("game_status", ["cancelled", "suspended"]),
    sb.from("stat_revisions").select("id, kind, source, reason, changed_at").order("changed_at", { ascending: false }).limit(10),
  ]);
  const players = await getPlayers(sb, [...new Set((pstats ?? []).map((s) => s.player_id))]);
  const last = runs?.[0];
  const lastOk = runs?.find((r) => r.ok);
  const stale = !!lastOk && Date.now() - new Date(lastOk.finished_at ?? lastOk.started_at).getTime() > (lastOk.next_interval_seconds ?? 86400) * 3000;
  const unmatched = (runs ?? []).filter((r) => (r.detail ?? "").includes("Unmatched"));
  const gameLabel = (id: string) => {
    const g = season?.games.find((x) => x.id === id);
    const r = season?.rounds.find((x) => x.round === g?.round)?.short_name;
    return g ? `${r}: ${season?.teams.get(g.away_team_id)?.abbreviation} @ ${season?.teams.get(g.home_team_id)?.abbreviation}` : id;
  };
  const options: StatOption[] = [
    ...(pstats ?? []).map((s) => ({ kind: "player" as const, subjectId: s.player_id, gameId: s.game_id, label: `${players.get(s.player_id)?.full_name} (${players.get(s.player_id)?.position})`, stats: s.stats as Record<string, number> })),
    ...(dstats ?? []).map((s) => ({ kind: "dst" as const, subjectId: s.team_id, gameId: s.game_id, label: `${season?.teams.get(s.team_id)?.name} D/ST`, stats: s.stats as Record<string, number> })),
  ].sort((a, b) => a.label.localeCompare(b.label));

  return (
    <>
      <PageHeader title="Administrator" subtitle={`${process.env.NFL_DATA_PROVIDER ?? "mock"} data provider · ${users ?? 0} users · ${leagues ?? 0} leagues`} />
      <div className="space-y-3">
        {stale ? <Notice tone="red"><b>Data feed may have stopped.</b> The last successful sync was <Relative iso={lastOk?.finished_at} />, longer than expected.</Notice> : null}
        {last && !last.ok ? <Notice tone="red"><b>Last sync failed:</b> {last.detail}</Notice> : null}
        <div className="grid grid-cols-2 gap-2 px-3 sm:grid-cols-4 sm:px-0">
          {[["Last success", lastOk ? <Relative key="r" iso={lastOk.finished_at} /> : "never"], ["Next run in", last?.next_interval_seconds ? `${last.next_interval_seconds}s` : "—"], ["Calls (24 h)", String(runs24 ?? 0)], ["Failures (24 h)", String(fails24 ?? 0)]].map(([k, v]) => (
            <div key={String(k)} className="rounded-2xl bg-surface p-3 shadow-lg shadow-black/20"><div className="text-[10px] font-extrabold uppercase tracking-wide text-gray-500">{k}</div><div className="text-lg font-black">{v}</div></div>
          ))}
        </div>
        <Card title="NFL data feed"><SyncControls sample={!!season?.isSample} /></Card>
        <Card flush title="Synchronization log">
          {(runs ?? []).length === 0 ? <Empty>No syncs yet. Press &quot;Sync now&quot;.</Empty> : (
            <ul className="divide-y divide-gray-100">
              {(runs ?? []).map((r) => (
                <li key={r.id} className="px-4 py-2.5 text-sm">
                  <span className="flex items-center gap-2">{r.ok ? <Badge tone="mint">OK</Badge> : r.ok === false ? <Badge tone="red">Failed</Badge> : <Badge tone="amber">Running</Badge>}<span className="text-xs text-gray-500">{r.kind} · <LocalTime iso={r.started_at} /></span></span>
                  <span className="mt-0.5 block text-[12px] text-gray-700">{r.detail}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card title="Player ID mismatches">
          {unmatched.length === 0 ? <p className="text-sm text-gray-500">None: every statistic matched a known player or team by provider id.</p> : unmatched.map((r) => <p key={r.id} className="text-sm text-amber-800">{r.detail}</p>)}
        </Card>
        <Card title="Correct a statistic">
          <p className="mb-3 text-xs text-gray-500">For confirmed discrepancies only. Requires a reason; the previous value, your id and the time are recorded, points and standings recalculate, and affected members are notified.</p>
          {options.length ? <StatCorrection games={[...new Set(options.map((o) => o.gameId))].map((id) => ({ id, label: gameLabel(id) }))} options={options} /> : <Empty>No statistics imported yet.</Empty>}
        </Card>
        <Card title="Selection exceptions (cancelled / suspended games)">
          <VoidSelection rows={(stuck ?? []).map((s) => ({ id: s.id, label: `${s.slot} · round ${s.round} · ${s.player_id ? "player" : "D/ST"} · ${s.game_status}` }))} />
        </Card>
        <div className="grid gap-3 lg:grid-cols-2">
          <Card flush title="Recent stat revisions">
            {(revisions ?? []).length === 0 ? <Empty>None yet.</Empty> : (
              <ul className="divide-y divide-gray-100">{(revisions ?? []).map((r) => <li key={r.id} className="px-4 py-2 text-sm"><Badge tone={r.source === "admin" ? "amber" : "slate"}>{r.source}</Badge> {r.kind}{r.reason ? ` · ${r.reason}` : ""}<span className="block text-[11px] text-gray-500"><LocalTime iso={r.changed_at} /></span></li>)}</ul>
            )}
          </Card>
          <Card flush title="Audit log">
            {(audit ?? []).length === 0 ? <Empty>Nothing yet.</Empty> : (
              <ul className="divide-y divide-gray-100">{(audit ?? []).map((a) => <li key={a.id} className="px-4 py-2 text-sm"><span className="font-mono text-xs font-bold text-gold-300">{a.action}</span> {a.entity}{a.reason ? ` · “${a.reason}”` : ""}<span className="block text-[11px] text-gray-500"><LocalTime iso={a.at} /></span></li>)}</ul>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
