/** Small deterministic random generator (same seed, same numbers, every time). */
export function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

export function rng(seed: string) {
  let a = hashString(seed);
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (lo: number, hi: number) => lo + Math.floor(next() * (hi - lo + 1)),
    chance: (p: number) => next() < p,
    pick: <T>(weights: Array<[T, number]>): T => {
      const total = weights.reduce((s, [, w]) => s + w, 0);
      let r = next() * total;
      for (const [v, w] of weights) if ((r -= w) <= 0) return v;
      return weights[weights.length - 1]![0];
    },
  };
}
