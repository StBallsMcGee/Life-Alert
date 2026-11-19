import Link from "next/link";
import { getContext, getSeasonView } from "@/lib/data/context";
import { getStandings } from "@/lib/data/queries";
import { signOut } from "@/app/actions";
import { DeleteAccount, MarkReadButton, ProfileForm } from "@/components/profile-forms";
import { LocalTime } from "@/components/local-time";
import { Avatar, Badge, Card, Empty } from "@/components/ui";

export const metadata = { title: "Profile" };

export default async function Profile() {
  const ctx = await getContext();
  const p = ctx.profile;
  const [{ data: notes }, history] = await Promise.all([
    ctx.supabase.from("notifications").select("id, type, message, link, read_at, created_at").eq("user_id", ctx.user.id).order("created_at", { ascending: false }).limit(30),
    Promise.all(ctx.leagues.map(async (l) => {
      const season = await getSeasonView(l.season_id);
      const { rows, members } = await getStandings(ctx.supabase, l.id, season?.rounds.map((r) => r.round) ?? []);
      const me = rows.find((r) => r.userId === ctx.user.id);
      return { l, season: season?.label ?? "", rank: me?.rank ?? null, total: me?.total ?? 0, of: members.length, champ: l.status === "complete" && me?.rank === 1 };
    })),
  ]);
  const totalPts = history.reduce((t, h) => t + h.total, 0);
  const titles = history.filter((h) => h.champ).length;

  return (
    <>
      <section className="mx-3 mt-4 flex items-center gap-4 rounded-3xl bg-gradient-to-br from-turf-700 via-turf-800 to-charcoal p-5 shadow-xl shadow-black/30 sm:mx-0">
        <Avatar name={p?.display_name || "?"} size={64} ring="#f9c22e" />
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-2xl font-black">{p?.display_name}</h1>
          <p className="text-sm text-gray-600">@{p?.username} · {ctx.user.email}</p>
          <p className="text-xs text-gray-500">Member since {p ? <LocalTime iso={p.created_at} mode="date" /> : "—"}</p>
        </div>
      </section>
      <div className="mt-3 grid grid-cols-3 gap-2 px-3 sm:px-0">
        {[["Leagues", String(ctx.leagues.length)], ["Playoff pts", totalPts.toFixed(1)], ["Titles", String(titles)]].map(([k, v]) => (
          <div key={k} className="rounded-2xl bg-surface p-3 text-center shadow-lg shadow-black/20"><div className="text-[10px] font-extrabold uppercase tracking-wide text-gray-500">{k}</div><div className="text-xl font-black tabular-nums">{v}</div></div>
        ))}
      </div>
      <div className="mt-3 space-y-3">
        <Card title="Notifications" action={(notes ?? []).some((n) => !n.read_at) ? <MarkReadButton /> : null} flush>
          {(notes ?? []).length === 0 ? <Empty>No notifications yet.</Empty> : (
            <ul className="divide-y divide-gray-100">
              {(notes ?? []).map((n) => (
                <li key={n.id} className={`flex items-start gap-3 px-4 py-2.5 text-sm ${n.read_at ? "" : "bg-gold-400/5"}`}>
                  <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${n.read_at ? "bg-gray-300" : "bg-gold-400"}`} />
                  <span className="min-w-0 flex-1">{n.link ? <Link href={n.link} className="hover:underline">{n.message}</Link> : n.message}<span className="block text-[11px] text-gray-500"><LocalTime iso={n.created_at} /></span></span>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card title="Current & past results" flush>
          {history.length === 0 ? <Empty>No leagues yet.</Empty> : (
            <ul className="divide-y divide-gray-100">
              {history.map((h) => (
                <li key={h.l.id}>
                  <Link href={`/leagues/${h.l.id}`} className="flex items-center gap-3 px-4 py-2.5 active:bg-gray-50">
                    <span className="min-w-0 flex-1"><span className="block truncate text-sm font-bold">{h.l.name}</span><span className="text-[11px] text-gray-500">{h.season}</span></span>
                    {h.champ ? <Badge tone="gold">🏆 Champion</Badge> : null}
                    <span className="text-right text-sm"><b className="tabular-nums">{h.rank ? `#${h.rank}` : "–"}</b><span className="text-gray-500"> of {h.of}</span><span className="block text-[11px] tabular-nums text-gray-500">{h.total.toFixed(1)} pts</span></span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card title="Account settings"><ProfileForm initial={{ displayName: p?.display_name ?? "", username: p?.username ?? "", prefs: (p?.notification_prefs as Record<string, boolean>) ?? {} }} /></Card>
        <Card title="Sign out & delete">
          <form action={signOut} className="mb-4"><button className="btn-secondary">Sign out</button></form>
          <DeleteAccount />
        </Card>
      </div>
    </>
  );
}
