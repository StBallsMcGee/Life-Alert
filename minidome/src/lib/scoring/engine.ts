/**
 * THE MINIDOME scoring service.
 *
 * Pure functions: statistics + a scoring configuration in, fantasy points and a line-by-line
 * breakdown out. It knows nothing about data providers, the database or the screens. The sync
 * service runs it server-side and stores the result (with the engine and configuration
 * version) in fantasy_points; nothing in the browser calculates official points.
 *
 * Arithmetic is done in thousandths so values like 0.04 per yard add up exactly.
 */

export const ENGINE_VERSION = "minidome-scoring-1";

/** Normalised statistics for a player in one game. Missing values count as zero. */
export interface OffenseStats {
  passYds?: number; passTd?: number; passInt?: number; pass2pt?: number;
  rushYds?: number; rushTd?: number; rush2pt?: number;
  rec?: number; recYds?: number; recTd?: number; rec2pt?: number;
  fumLost?: number;
  xpMade?: number; xpMissed?: number;
  fgMade0_39?: number; fgMade40_49?: number; fgMade50p?: number; fgMissed?: number;
}

/**
 * Team defence / special teams statistics in one game.
 *
 * pointsAllowed follows THE MINIDOME definition (docs/SCORING.md): the opponent's final score
 * minus points the opponent scored on its own defensive or special-teams plays (return
 * touchdowns and the try after them, safeties, and defensive two-point/extra-point returns).
 * Overtime points count. The data adapter computes it; the engine only applies the tiers.
 */
export interface DstStats {
  sacks?: number; ints?: number; fumRec?: number;
  defTd?: number; stTd?: number; safeties?: number; blockedKicks?: number;
  xpReturns?: number; twoPtReturns?: number;
  pointsAllowed?: number;
}

export interface PointsAllowedTier { max: number | null; points: number }

export interface ScoringRules {
  passYds: number; passTd: number; passInt: number; pass2pt: number;
  rushYds: number; rushTd: number; rush2pt: number;
  rec: number; recYds: number; recTd: number; rec2pt: number;
  fumLost: number;
  xpMade: number; xpMissed: number; fgMade0_39: number; fgMade40_49: number; fgMade50p: number; fgMissed: number;
  dstSack: number; dstInt: number; dstFumRec: number; dstTd: number; dstStTd: number; dstSafety: number;
  dstBlockedKick: number; dstXpReturn: number; dstTwoPtReturn: number;
  pointsAllowed: PointsAllowedTier[];
}

/** The default Half PPR rules (identical to scoring configuration "Half PPR" version 1). */
export const HALF_PPR: ScoringRules = {
  passYds: 0.04, passTd: 4, passInt: -2, pass2pt: 2,
  rushYds: 0.1, rushTd: 6, rush2pt: 2,
  rec: 0.5, recYds: 0.1, recTd: 6, rec2pt: 2,
  fumLost: -2,
  xpMade: 1, xpMissed: -1, fgMade0_39: 3, fgMade40_49: 4, fgMade50p: 5, fgMissed: -1,
  dstSack: 1, dstInt: 2, dstFumRec: 2, dstTd: 6, dstStTd: 6, dstSafety: 2, dstBlockedKick: 2,
  dstXpReturn: 2, dstTwoPtReturn: 2,
  pointsAllowed: [
    { max: 0, points: 10 }, { max: 6, points: 7 }, { max: 13, points: 4 }, { max: 20, points: 1 },
    { max: 27, points: 0 }, { max: 34, points: -1 }, { max: null, points: -4 },
  ],
};

export interface BreakdownLine {
  key: string;
  label: string;
  /** How many (yards, touchdowns, ...). For points allowed: the points allowed. */
  count: number;
  /** Points per unit, or the tier's points for points allowed. */
  each: number;
  points: number;
}

export interface ScoreResult { points: number; breakdown: BreakdownLine[] }

const SCALE = 1000;
const units = (n: number) => Math.round(n * SCALE);
const fromUnits = (u: number) => Math.round(u / 10) / 100; // to hundredths

const OFFENSE: Array<[keyof OffenseStats, keyof ScoringRules, string]> = [
  ["passYds", "passYds", "Passing yards"],
  ["passTd", "passTd", "Passing touchdowns"],
  ["passInt", "passInt", "Interceptions thrown"],
  ["pass2pt", "pass2pt", "Passing 2-pt conversions"],
  ["rushYds", "rushYds", "Rushing yards"],
  ["rushTd", "rushTd", "Rushing touchdowns"],
  ["rush2pt", "rush2pt", "Rushing 2-pt conversions"],
  ["rec", "rec", "Receptions"],
  ["recYds", "recYds", "Receiving yards"],
  ["recTd", "recTd", "Receiving touchdowns"],
  ["rec2pt", "rec2pt", "Receiving 2-pt conversions"],
  ["fumLost", "fumLost", "Fumbles lost"],
  ["xpMade", "xpMade", "Extra points made"],
  ["xpMissed", "xpMissed", "Extra points missed"],
  ["fgMade0_39", "fgMade0_39", "Field goals 0–39 yds"],
  ["fgMade40_49", "fgMade40_49", "Field goals 40–49 yds"],
  ["fgMade50p", "fgMade50p", "Field goals 50+ yds"],
  ["fgMissed", "fgMissed", "Field goals missed"],
];

const DST: Array<[keyof DstStats, keyof ScoringRules, string]> = [
  ["sacks", "dstSack", "Sacks"],
  ["ints", "dstInt", "Interceptions"],
  ["fumRec", "dstFumRec", "Fumble recoveries"],
  ["defTd", "dstTd", "Defensive touchdowns"],
  ["stTd", "dstStTd", "Special teams touchdowns"],
  ["safeties", "dstSafety", "Safeties"],
  ["blockedKicks", "dstBlockedKick", "Blocked kicks"],
  ["xpReturns", "dstXpReturn", "Extra point returns"],
  ["twoPtReturns", "dstTwoPtReturn", "Two-point returns"],
];

function num(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

function lines<S extends object>(stats: S, map: Array<[keyof S, keyof ScoringRules, string]>, rules: ScoringRules) {
  const out: BreakdownLine[] = [];
  let total = 0;
  for (const [statKey, ruleKey, label] of map) {
    const count = num(stats[statKey]);
    const each = rules[ruleKey] as number;
    if (count === 0 || !each) continue;
    const u = Math.round(units(each) * count);
    total += u;
    out.push({ key: String(statKey), label, count, each, points: fromUnits(u) });
  }
  return { total, out };
}

export function pointsAllowedTier(pa: number, tiers: readonly PointsAllowedTier[]): PointsAllowedTier {
  const sorted = [...tiers].sort((a, b) => (a.max ?? Infinity) - (b.max ?? Infinity));
  return sorted.find((t) => t.max === null || pa <= t.max) ?? sorted[sorted.length - 1]!;
}

export function scoreOffense(stats: OffenseStats, rules: ScoringRules = HALF_PPR): ScoreResult {
  const { total, out } = lines(stats, OFFENSE, rules);
  return { points: fromUnits(total), breakdown: out };
}

export function scoreDst(stats: DstStats, rules: ScoringRules = HALF_PPR): ScoreResult {
  const { total, out } = lines(stats, DST, rules);
  let sum = total;
  if (typeof stats.pointsAllowed === "number") {
    const tier = pointsAllowedTier(stats.pointsAllowed, rules.pointsAllowed);
    sum += units(tier.points);
    out.push({ key: "pointsAllowed", label: `Points allowed (${tierLabel(tier, rules.pointsAllowed)})`, count: stats.pointsAllowed, each: tier.points, points: tier.points });
  }
  return { points: fromUnits(sum), breakdown: out };
}

function tierLabel(tier: PointsAllowedTier, tiers: readonly PointsAllowedTier[]): string {
  const sorted = [...tiers].sort((a, b) => (a.max ?? Infinity) - (b.max ?? Infinity));
  const i = sorted.indexOf(tier);
  const lo = i <= 0 ? 0 : (sorted[i - 1]!.max ?? 0) + 1;
  if (tier.max === null) return `${lo}+`;
  return lo === tier.max ? String(lo) : `${lo}–${tier.max}`;
}

/** Validates and completes a stored configuration (unknown keys ignored, missing keys default to Half PPR). */
export function parseRules(raw: unknown): ScoringRules {
  const r = { ...HALF_PPR } as Record<string, unknown>;
  if (raw && typeof raw === "object") {
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
      if (!(k in HALF_PPR)) continue;
      if (k === "pointsAllowed") {
        if (Array.isArray(v) && v.every((t) => t && typeof t === "object" && typeof (t as PointsAllowedTier).points === "number")) r[k] = v;
      } else if (typeof v === "number" && Number.isFinite(v)) r[k] = v;
    }
  }
  return r as unknown as ScoringRules;
}

/** Adds point values exactly (e.g. a round total). */
export function sumPoints(values: Array<number | null | undefined>): number {
  return fromUnits(values.reduce<number>((s, v) => s + units(v ?? 0), 0));
}

/** Rule lines for the public "Scoring rules" page. */
export function describeRules(rules: ScoringRules) {
  const fmt = (n: number) => (n > 0 ? `+${n}` : String(n));
  return {
    offense: OFFENSE.map(([, k, label]) => ({ label: label.endsWith("yards") ? `${label} (per yard)` : label, value: fmt(rules[k] as number) })),
    dst: DST.map(([, k, label]) => ({ label, value: fmt(rules[k] as number) })),
    pointsAllowed: [...rules.pointsAllowed].sort((a, b) => (a.max ?? Infinity) - (b.max ?? Infinity)).map((t) => ({ label: tierLabel(t, rules.pointsAllowed), value: fmt(t.points) })),
  };
}
