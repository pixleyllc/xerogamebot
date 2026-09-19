/**
 * Mulberry32 seeded RNG so tests and replays are deterministic.
 * State is stored on GameState.rngState and mutated in place.
 */

export interface Rng {
  next(): number;
  int(maxExclusive: number): number;
  intInclusive(min: number, max: number): number;
  chance(percent: number): boolean;
  pick<T>(items: readonly T[]): T;
  pickN<T>(items: readonly T[], n: number): T[];
  shuffle<T>(items: readonly T[]): T[];
  getState(): number;
}

export function hashSeed(seed: string): number {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return (h >>> 0) || 1;
}

export function createRng(seed: string | number): Rng {
  let state = typeof seed === "number" ? seed >>> 0 : hashSeed(seed);
  if (state === 0) state = 1;

  const next = () => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  const rng: Rng = {
    next,
    int(maxExclusive: number) {
      if (maxExclusive <= 0) return 0;
      return Math.floor(next() * maxExclusive);
    },
    intInclusive(min: number, max: number) {
      if (max <= min) return min;
      return min + Math.floor(next() * (max - min + 1));
    },
    chance(percent: number) {
      return next() * 100 < percent;
    },
    pick<T>(items: readonly T[]) {
      if (items.length === 0) {
        throw new Error("Rng.pick called with empty list");
      }
      return items[Math.floor(next() * items.length)] as T;
    },
    pickN<T>(items: readonly T[], n: number) {
      const copy = rng.shuffle(items);
      return copy.slice(0, Math.max(0, Math.min(n, copy.length)));
    },
    shuffle<T>(items: readonly T[]) {
      const copy = items.slice();
      for (let i = copy.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        const tmp = copy[i] as T;
        copy[i] = copy[j] as T;
        copy[j] = tmp;
      }
      return copy;
    },
    getState() {
      return state >>> 0;
    },
  };
  return rng;
}

export function rngFromState(state: number): Rng {
  return createRng(state || 1);
}
