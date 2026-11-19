/**
 * Position colours (Sideout's slot-tile treatment, football positions): QB pink, RB green,
 * WR blue, TE orange, FLEX a blend, D/ST violet, K teal.
 */
const TILE: Record<string, string> = {
  QB: "bg-[#ff9cc0] text-charcoal",
  RB: "bg-[#7fe0a6] text-charcoal",
  WR: "bg-[#8fc0ff] text-charcoal",
  TE: "bg-[#ffc785] text-charcoal",
  FLEX: "bg-gradient-to-r from-[#7fe0a6] via-[#8fc0ff] to-[#ffc785] text-charcoal",
  DST: "bg-[#c3adff] text-charcoal",
  K: "bg-[#7fe8de] text-charcoal",
};
const TEXT: Record<string, string> = { QB: "text-[#ff9cc0]", RB: "text-[#7fe0a6]", WR: "text-[#8fc0ff]", TE: "text-[#ffc785]", DST: "text-[#c3adff]", K: "text-[#7fe8de]" };

const base = (label: string) => label.replace(/\d+$/, "").replace("D/ST", "DST");

export function PositionTile({ label, size = "md" }: { label: string; size?: "sm" | "md" }) {
  const k = base(label);
  return (
    <span className={`grid shrink-0 place-items-center rounded-lg font-extrabold shadow-sm ${TILE[k] ?? "bg-surface-3 text-gray-700"} ${size === "sm" ? "h-6 w-9 text-[10px]" : "h-8 w-11 text-[11px]"}`}>
      {k === "DST" ? "D/ST" : k}
    </span>
  );
}

export function positionText(label: string | null | undefined): string {
  return TEXT[base(label ?? "")] ?? "text-gray-500";
}
