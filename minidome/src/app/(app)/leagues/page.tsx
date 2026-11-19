import Link from "next/link";
import { getContext, getSeasonView, roundOf } from "@/lib/data/context";
import { getStandings } from "@/lib/data/queries";
import { JoinForm } from "@/components/league-forms";
import { Badge, Card, Empty, PageHeader } from "@/components/ui";

export const metadata = { title: "My Leagues" };

const TILES = ["tile-violet", "tile-green", "tile-orange", "tile-blue", "tile-pink", "tile-teal"];

export default async function Leagues() {
  const ctx = await getContext();
  const cards = await Promise.all(ctx.leagues.map(async (l) => {
    const season = await getSeasonView(l.season_id);
    const round = season ? roundOf(season, season.current) : undefined;
    const [{ rows, members }, { data: lu }] = await Promise.all([
      getStandings(ctx.supabase, l.id, season?.rounds.map((r) => r.round) ?? []),
      round ? ctx.supabase.from("lineups").select("status").eq("league_id", l.id).eq("user_id", ctx.user.id).eq("round", round.round).maybeSingle() : Promise.resolve({ data: null }),
    ]);
    const me = rows.find((r) => r.userId === ctx.user.id);
    const leader = members.find((m) => m.user_id === rows[0]?.userId);
    return { l, round, me, members: members.length, leader: leader?.display_name, leaderPts: rows[0]?.total ?? 0, submitted: lu?.status === "submitted" };
  }));

  return (
    <>
      <PageHeader title="My Leagues" subtitle="Private, invitation-only competitions" actions={<Link href="/leagues/new" className="btn-primary">+ New league</Link>} />
      <div className="space-y-3">
        {cards.length === 0 ? <Card><Empty>You&apos;re not in a league yet. Create one, or join with a code from your commissioner.</Empty></Card> : (
          <div className="grid gap-3 px-3 sm:grid-cols-2 sm:px-0">
            {cards.map(({ l, round, me, members, leader, leaderPts, submitted }, i) => (
              <Link key={l.id} href={`/leagues/${l.id}`} className="block overflow-hidden rounded-2xl bg-surface shadow-lg shadow-black/20 transition active:scale-[0.99]">
                <div className={`${TILES[i % TILES.length]} flex items-center justify-between px-4 py-3`}>
                  <span className="min-w-0">
                    <span className="block truncate text-lg font-black">{l.name}</span>
                    <span className="text-[11px] font-bold opacity-75">{members}/{l.max_members} members · {l.role === "commissioner" ? "You're commissioner" : "Member"}</span>
                  </span>
                  <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-white/40 text-2xl font-black">{me ? `#${me.rank}` : "–"}</span>
                </div>
                <div className="grid grid-cols-3 divide-x divide-gray-100 text-center">
                  <div className="px-2 py-2.5"><div className="text-[10px] font-extrabold uppercase text-gray-500">Your total</div><div className="font-black tabular-nums">{(me?.total ?? 0).toFixed(1)}</div></div>
                  <div className="px-2 py-2.5"><div className="text-[10px] font-extrabold uppercase text-gray-500">Leader</div><div className="truncate font-bold">{leader ?? "–"} <span className="text-xs text-gray-500">{leaderPts.toFixed(1)}</span></div></div>
                  <div className="px-2 py-2.5"><div className="text-[10px] font-extrabold uppercase text-gray-500">{round?.short_name ?? "Round"}</div><div>{round?.status === "complete" ? <Badge tone="dark">Done</Badge> : submitted ? <Badge tone="mint">Submitted</Badge> : <Badge tone="amber">To do</Badge>}</div></div>
                </div>
              </Link>
            ))}
          </div>
        )}
        <Card title="Join a league">
          <div id="join" className="space-y-2">
            <p className="text-sm text-gray-500">Got an invitation code or link from a commissioner? Enter it here.</p>
            <JoinForm />
          </div>
        </Card>
      </div>
    </>
  );
}
