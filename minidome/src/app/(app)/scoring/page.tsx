import { describeRules, HALF_PPR } from "@/lib/scoring/engine";
import { Card, PageHeader } from "@/components/ui";

export const metadata = { title: "Scoring rules" };

export default function Scoring() {
  const r = describeRules(HALF_PPR);
  const list = (rows: Array<{ label: string; value: string }>) => (
    <ul className="divide-y divide-gray-100">
      {rows.map((x) => <li key={x.label} className="flex justify-between px-4 py-2.5 text-sm"><span className="text-gray-700">{x.label}</span><span className={`font-extrabold tabular-nums ${x.value.startsWith("-") ? "text-red-600" : ""}`}>{x.value}</span></li>)}
    </ul>
  );
  return (
    <>
      <PageHeader title="Scoring & rules" subtitle="Half PPR · version 1" />
      <div className="space-y-3">
        <Card title="How One-and-Done works">
          <ol className="list-decimal space-y-1.5 pl-5 text-sm text-gray-700">
            <li>Each playoff round (Wild Card, Divisional, Conference Championships, Super Bowl) you pick nine: QB, 2 RB, 2 WR, TE, FLEX (RB/WR/TE), D/ST and K.</li>
            <li><b>Each player and each D/ST can be used only once</b> all postseason, per league. Everyone in the league can pick the same player.</li>
            <li>Every pick locks at its own player&apos;s kickoff. Until then you can swap it.</li>
            <li>Teams on a bye, eliminated teams and players ruled Out/IR can&apos;t be picked.</li>
            <li>Most total points across all four rounds wins. Ties: Super Bowl score, then Conference, Divisional, Wild Card; still level means a shared position.</li>
          </ol>
        </Card>
        <div className="grid gap-3 lg:grid-cols-2">
          <Card flush title="Players">{list(r.offense)}</Card>
          <div className="space-y-3">
            <Card flush title="Defense / special teams">{list(r.dst)}</Card>
            <Card flush title="D/ST points allowed">{list(r.pointsAllowed)}</Card>
          </div>
        </div>
        <Card title="Points allowed: what counts">
          <p className="text-sm text-gray-700">Points allowed is the opponent&apos;s final score (including overtime) minus points the opponent scored with its own defense or special teams: return touchdowns and the try after them, safeties, and defensive two-point or extra-point returns. Those points weren&apos;t allowed by the defense being scored.</p>
          <p className="mt-2 text-xs text-gray-500">All points are calculated on the server from official statistics and can be tapped for a full breakdown. Live points are provisional; stat corrections update scores and standings automatically, and earlier calculations are kept.</p>
        </Card>
      </div>
    </>
  );
}
