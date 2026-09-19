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
  "Rae",
  "Quinn",
  "Noor",
  "Soren",
  "Pilar",
  "Ellis",
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
    "needling",
    "blunt",
    "theatrical",
    "detached",
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
    "scattershot",
    "lawyerly",
    "gut-first",
    "quiet-hunter",
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
    "over-explains tiny facts",
    "names people like a roll call",
    "hedges then snaps shut",
    "sounds bored on purpose",
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
  "Rambling then suddenly specific.",
  "Deadpan. Treats the table like a joke that stopped being funny.",
  "Fast and impatient. Cuts people off in text.",
  "Poetic in a way that still names a suspect.",
  "Asks questions instead of making claims.",
  "Sounds like they already voted in their head.",
  "Country-plain. No flourish. A name and a reason.",
  "Slightly paranoid, stacks 'what if' on 'what if'.",
];

const AGENDAS = [
  "Play loud so nobody looks at you twice.",
  "Stay quiet until someone names you, then over-explain.",
  "Pick a scapegoat early and never let go.",
  "Mirror whoever sounds village-y and ride their reads.",
  "Ask trap questions instead of making claims.",
  "Defend the first person accused, then pivot.",
  "Only talk in votes and numbers.",
  "Act offended by every accusation.",
  "Pretend you noticed a night inconsistency.",
  "Hunt whoever talks after deaths.",
  "Bond with one player and follow their vote.",
  "Contrarian: if the table agrees, you don't.",
  "Protect a random 'soft' player as if they were seer.",
  "Dump your first read halfway through and swap.",
  "Sound like you have extra info you refuse to share.",
  "Keep naming the human just to see who jumps in.",
];

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

function jitter(rng: Rng, base: number, spread = 0.28): number {
  return clamp01(base + (rng.next() - 0.5) * 2 * spread);
}

export function generatePersonality(
  name: string,
  rng: Rng,
  taken: Set<string> = new Set(),
): Personality {
  let demeanor = rng.pick(TRAIT_POOLS.demeanor);
  let method = rng.pick(TRAIT_POOLS.method);
  let tell = rng.pick(TRAIT_POOLS.tell);
  let speakingStyle = rng.pick(STYLE_TEMPLATES);
  let agenda = rng.pick(AGENDAS);
  let guard = 0;
  let key = `${speakingStyle}|${agenda}|${method}`;
  while (taken.has(key) && guard++ < 24) {
    speakingStyle = rng.pick(STYLE_TEMPLATES);
    agenda = rng.pick(AGENDAS);
    method = rng.pick(TRAIT_POOLS.method);
    demeanor = rng.pick(TRAIT_POOLS.demeanor);
    tell = rng.pick(TRAIT_POOLS.tell);
    key = `${speakingStyle}|${agenda}|${method}`;
  }
  taken.add(key);

  return {
    seedName: name,
    traits: [demeanor, method, tell],
    speakingStyle,
    agenda,
    riskTolerance: jitter(rng, rng.next()),
    deception: jitter(rng, rng.next() * 0.85),
    aggression: jitter(rng, rng.next()),
    trustTendency: jitter(rng, rng.next()),
    analytical: jitter(rng, rng.next()),
    memoryStrength: jitter(rng, 0.35 + rng.next() * 0.6, 0.18),
  };
}

export function pickNpcNames(count: number, rng: Rng): string[] {
  if (count > NPC_NAME_POOL.length) {
    throw new Error(`Need at most ${NPC_NAME_POOL.length} NPC names`);
  }
  return rng.pickN([...NPC_NAME_POOL], count);
}

export const HUMAN_DEFAULT_NAME = "Zack";
