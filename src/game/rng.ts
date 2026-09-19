/**
 * Mulberry32 seeded RNG so tests and replays stay deterministic when a seed
 * is passed. Live games mix CSPRNG entropy so deals and NPC minds cannot
 * collapse onto the same shuffle.
 */

export interface Rng {
  next(): number;
  int(maxExclusive: number): number;
  intInclusive(min: number, max: number): number;
  chance(percent: number): boolean;
  pick<T>(items: readonly T[]): T;
  pickN<T>(items: readonly T[], n: number): T[];
  shuffle<T>(items: readonly T[]): T[];
  weightedPick<T>(items: readonly T[], weights: readonly number[]): T;
  softmaxPick<T>(items: readonly T[], scores: readonly number[], temperature: number): T;
  mixEntropy(): void;
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

function fillRandomBytes(bytes: Uint8Array): void {
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    crypto.getRandomValues(bytes);
    return;
  }
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = Math.floor(Math.random() * 256);
  }
}

/** Unbiased live seed: clock + performance + 16 CSPRNG bytes. */
export function freshEntropySeed(): string {
  const bytes = new Uint8Array(16);
  fillRandomBytes(bytes);
  const t = Date.now().toString(16);
  const p =
    typeof performance !== "undefined"
      ? Math.floor(performance.now() * 1000).toString(16)
      : Math.floor(Math.random() * 1e9).toString(16);
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `e-${t}-${p}-${hex}`;
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
    weightedPick<T>(items: readonly T[], weights: readonly number[]) {
      if (items.length === 0) {
        throw new Error("Rng.weightedPick called with empty list");
      }
      let sum = 0;
      const w = items.map((_, i) => {
        const v = weights[i];
        const n = typeof v === "number" && Number.isFinite(v) && v > 0 ? v : 0;
        sum += n;
        return n;
      });
      if (sum <= 0) return items[Math.floor(next() * items.length)] as T;
      let r = next() * sum;
      for (let i = 0; i < items.length; i++) {
        r -= w[i]!;
        if (r <= 0) return items[i] as T;
      }
      return items[items.length - 1] as T;
    },
    softmaxPick<T>(items: readonly T[], scores: readonly number[], temperature: number) {
      if (items.length === 0) {
        throw new Error("Rng.softmaxPick called with empty list");
      }
      const t = Math.max(0.05, temperature);
      const max = scores.reduce((m, s) => (s > m ? s : m), Number.NEGATIVE_INFINITY);
      const exps = scores.map((s) => Math.exp(((s || 0) - max) / t));
      return rng.weightedPick(items, exps);
    },
    mixEntropy() {
      const bytes = new Uint8Array(8);
      fillRandomBytes(bytes);
      let extra = 2166136261;
      for (const b of bytes) extra = Math.imul(extra ^ b, 16777619);
      extra = (extra ^ (Date.now() >>> 0)) >>> 0;
      state = (state ^ extra) >>> 0 || 1;
      const burn = 3 + (bytes[0]! % 13);
      for (let i = 0; i < burn; i++) next();
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

/** Run a callback against the game's RNG and persist the mutated state. */
export function withGameRng<T>(state: { rngState: number }, fn: (rng: Rng) => T): T {
  const rng = rngFromState(state.rngState);
  const result = fn(rng);
  state.rngState = rng.getState();
  return result;
}
