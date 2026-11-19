/**
 * Lineup spots. Mirrors the database functions league_slots / position_fits_slot (the database
 * is authoritative; this copy drives the lineup builder and is tested to match).
 */
export type Position = "QB" | "RB" | "WR" | "TE" | "K";
export type SlotBase = "QB" | "RB" | "WR" | "TE" | "FLEX" | "DST" | "K";
export type RosterConfig = Partial<Record<SlotBase, number>>;

export const DEFAULT_ROSTER: Required<RosterConfig> = { QB: 1, RB: 2, WR: 2, TE: 1, FLEX: 1, DST: 1, K: 1 };
const ORDER: SlotBase[] = ["QB", "RB", "WR", "TE", "FLEX", "DST", "K"];

export function slotsFor(config: RosterConfig = DEFAULT_ROSTER): string[] {
  const out: string[] = [];
  for (const base of ORDER) {
    const n = Math.max(0, Math.floor(config[base] ?? 0));
    for (let i = 1; i <= n; i++) out.push(n === 1 ? base : `${base}${i}`);
  }
  return out;
}

export function slotBase(slot: string): SlotBase {
  return slot.replace(/\d+$/, "") as SlotBase;
}

/** Can a player of this position (or a D/ST, position "DST") fill this spot? */
export function fitsSlot(position: Position | "DST", slot: string): boolean {
  const base = slotBase(slot);
  if (base === "FLEX") return position === "RB" || position === "WR" || position === "TE";
  return base === position;
}

/** "RB1" -> "RB", "FLEX" -> "FLEX", "DST" -> "D/ST" (for display). */
export function slotLabel(slot: string): string {
  const b = slotBase(slot);
  return b === "DST" ? "D/ST" : b;
}

export function slotHint(slot: string): string {
  const b = slotBase(slot);
  return b === "FLEX" ? "RB / WR / TE" : b === "DST" ? "Defense & special teams" : b === "K" ? "Kicker" : b === "QB" ? "Quarterback" : b === "RB" ? "Running back" : b === "WR" ? "Wide receiver" : "Tight end";
}
