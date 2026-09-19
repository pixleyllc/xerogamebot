import type { Personality } from "@/game/types.ts";
import type { Rng } from "@/game/rng.ts";

export const NPC_NAME_POOL = [
  "Luna",
  "Mateo",
  "Sofia",
  "Diego",
  "Valeria",
  "Carlos",
  "Mia",
  "Alex",
  "Emma",
  "Noah",
  "Aria",
  "Kai",
  "Rosa",
  "Leo",
  "Nina",
  "Omar",
  "Ivy",
  "Theo",
  "Camila",
  "Jules",
] as const;

const TRAIT_POOLS = {
  demeanor: [
    "calm",
    "intense",
    "warm",
    "cold",
    "wry",
    "earnest",
    "restless",
    "quiet",
  ],
  method: [
    "analytical",
    "social",
    "aggressive",
    "cautious",
    "improvisational",
    "pattern-watching",
    "empathetic",
    "confrontational",
  ],
  tell: [
    "jokes under pressure",
    "asks precise questions",
    "defends allies quickly",
    "lets others talk first",
    "pushes votes early",
    "changes targets often",
    "mirrors the last speaker",
    "speaks in short verdicts",
  ],
};

const STYLE_TEMPLATES = [
  "Short sentences. Rarely hedges. Names people directly.",
  "Soft, observational, piles small details.",
  "Needling and sarcastic, but not cartoonish.",
  "Formal, almost like minutes of a meeting.",
  "Casual, slangy, a little chaotic.",
  "Quiet and clipped. Speaks only when sure.",
  "Warm and persuasive, frames everything as concern.",
  "Lawyerly. Points at voting history.",
];

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

function jitter(rng: Rng, base: number, spread = 0.25): number {
  return clamp01(base + (rng.next() - 0.5) * 2 * spread);
}

export function generatePersonality(name: string, rng: Rng): Personality {
  const demeanor = rng.pick(TRAIT_POOLS.demeanor);
  const method = rng.pick(TRAIT_POOLS.method);
  const tell = rng.pick(TRAIT_POOLS.tell);
  const namedBias: Partial<Personality> = {};

  switch (name) {
    case "Luna":
      namedBias.analytical = 0.85;
      namedBias.aggression = 0.25;
      namedBias.trustTendency = 0.35;
      break;
    case "Mateo":
      namedBias.aggression = 0.86;
      namedBias.deception = 0.45;
      namedBias.riskTolerance = 0.7;
      break;
    case "Sofia":
      namedBias.trustTendency = 0.7;
      namedBias.analytical = 0.6;
      namedBias.aggression = 0.3;
      break;
    case "Diego":
      namedBias.riskTolerance = 0.88;
      namedBias.deception = 0.4;
      namedBias.aggression = 0.55;
      break;
    case "Valeria":
      namedBias.analytical = 0.9;
      namedBias.aggression = 0.2;
      namedBias.memoryStrength = 0.92;
      break;
    case "Carlos":
      namedBias.aggression = 0.8;
      namedBias.trustTendency = 0.25;
      namedBias.deception = 0.35;
      break;
    case "Mia":
      namedBias.deception = 0.78;
      namedBias.trustTendency = 0.65;
      namedBias.aggression = 0.4;
      break;
    case "Alex":
      namedBias.analytical = 0.92;
      namedBias.memoryStrength = 0.85;
      namedBias.aggression = 0.35;
      break;
    case "Emma":
      namedBias.trustTendency = 0.8;
      namedBias.riskTolerance = 0.25;
      namedBias.aggression = 0.22;
      break;
    default:
      break;
  }

  return {
    seedName: name,
    traits: [demeanor, method, tell],
    speakingStyle: rng.pick(STYLE_TEMPLATES),
    riskTolerance: jitter(rng, namedBias.riskTolerance ?? rng.next()),
    deception: jitter(rng, namedBias.deception ?? rng.next() * 0.7),
    aggression: jitter(rng, namedBias.aggression ?? rng.next()),
    trustTendency: jitter(rng, namedBias.trustTendency ?? rng.next()),
    analytical: jitter(rng, namedBias.analytical ?? rng.next()),
    memoryStrength: jitter(rng, namedBias.memoryStrength ?? 0.45 + rng.next() * 0.5),
  };
}

export function pickNpcNames(count: number, rng: Rng): string[] {
  if (count > NPC_NAME_POOL.length) {
    throw new Error(`Need at most ${NPC_NAME_POOL.length} NPC names`);
  }
  return rng.pickN([...NPC_NAME_POOL], count);
}

export const HUMAN_DEFAULT_NAME = "Zack";
