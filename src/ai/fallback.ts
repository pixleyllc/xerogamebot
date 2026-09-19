import type { AIProvider, AiDecision, AiDecisionRequest } from "@/ai/provider.ts";
import { defaultDecision } from "@/ai/provider.ts";
import { fingerprint, saidFingerprints } from "@/ai/spice.ts";
import { createRng, freshEntropySeed, type Rng } from "@/game/rng.ts";
import type { NpcMemory, PlayerView } from "@/game/types.ts";

function nameOf(view: PlayerView, id: string): string {
  return view.players.find((p) => p.id === id)?.name ?? id;
}

function livingOthers(view: PlayerView): string[] {
  return view.players.filter((p) => p.isAlive && p.id !== view.viewerId).map((p) => p.id);
}

function scratchRng(): Rng {
  return createRng(freshEntropySeed());
}

function wolfLike(view: PlayerView): boolean {
  return view.shownRoleId === "werewolf" || view.faction === "wolf";
}

function skLike(view: PlayerView): boolean {
  return view.shownRoleId === "serialKiller";
}

function cultLike(view: PlayerView): boolean {
  return view.faction === "cult" || view.shownRoleId === "cultist";
}

function tannerLike(view: PlayerView): boolean {
  return view.shownRoleId === "tanner";
}

function scoresFor(view: PlayerView, valid: string[], invert = false): number[] {
  const mem = view.memory;
  return valid.map((id) => {
    const belief = mem?.beliefs[id] ?? 0.35;
    const trust = mem?.trust[id] ?? 0.5;
    const hunchBoost = mem?.hunchTargetId === id ? 0.18 : 0;
    const raw = belief + hunchBoost - trust * 0.15 + Math.random() * 0.08;
    return invert ? 1 - raw : raw;
  });
}

export function pickAmong(view: PlayerView, valid: string[], prefer: "hot" | "cold" | "mix"): string | null {
  if (!valid.length) return null;
  const rng = scratchRng();
  const p = view.personality;
  const temp = prefer === "mix" ? 0.55 : 0.18 + (1 - (p?.analytical ?? 0.5)) * 0.55;
  const invert = prefer === "cold";
  const scores = scoresFor(view, valid, invert);
  if (prefer === "mix") {
    return rng.pick(valid);
  }
  try {
    return rng.softmaxPick(valid, scores, temp);
  } catch {
    return rng.pick(valid);
  }
}

function pickNightTarget(req: AiDecisionRequest): { t1: string | null; t2: string | null } {
  const view = req.view;
  const valid = req.validTargets;
  if (!valid.length) return { t1: null, t2: null };
  const role = view.shownRoleId;
  const rng = scratchRng();
  if (role === "werewolf" || role === "serialKiller") {
    const hunt = pickAmong(view, valid, rng.chance(55) ? "cold" : "mix") ?? rng.pick(valid);
    return { t1: hunt, t2: null };
  }
  if (role === "seer" || role === "fool") {
    return { t1: pickAmong(view, valid, rng.chance(70) ? "hot" : "mix") ?? rng.pick(valid), t2: null };
  }
  if (role === "guardianAngel") {
    const selfAllies = [
      ...view.packMates.map((p) => p.id),
      view.loverId,
    ].filter((id): id is string => !!id && valid.includes(id));
    if (selfAllies.length && rng.chance(40)) return { t1: rng.pick(selfAllies), t2: null };
    return { t1: pickAmong(view, valid, rng.chance(50) ? "cold" : "mix") ?? rng.pick(valid), t2: null };
  }
  if (role === "cultist") {
    return { t1: pickAmong(view, valid, "mix") ?? rng.pick(valid), t2: null };
  }
  if (role === "cupid") {
    const shuffled = rng.shuffle(valid);
    return { t1: shuffled[0] ?? null, t2: shuffled[1] ?? null };
  }
  const shuffled = rng.shuffle(valid);
  return { t1: shuffled[0] ?? null, t2: shuffled[1] ?? null };
}

const HOOKS: Array<(n: string) => string> = [
  (n) => `${n} is the name stuck in my teeth.`,
  (n) => `Why is ${n} so comfortable right now?`,
  (n) => `I keep waiting for ${n} to actually say something.`,
  (n) => `${n} jumped in too fast. That's a tell or a panic.`,
  (n) => `If we lynch wrong, it's because we ignored ${n}.`,
  (n) => `${n} feels like they already picked a story.`,
  (n) => `Don't look at me — look at ${n}.`,
  (n) => `${n} hasn't been pressured once. That's the problem.`,
  (n) => `I want ${n} on the block just to hear the defense.`,
  (n) => `${n} is playing like the night didn't happen.`,
  (n) => `Somebody explain ${n} to me in one sentence.`,
  (n) => `My gut is ${n}. I might dump it. Not yet.`,
  (n) => `${n} and whoever defends them first — that's a pair.`,
  (n) => `Quiet table. Loudest silence is ${n}.`,
  (n) => `I don't need a speech. I need ${n} to answer.`,
  (n) => `${n} sounds village in a way that was practiced.`,
  (n) => `Vote math hates ${n} more than the flavor text does.`,
  (n) => `${n} is my second choice, which is why I'm saying it first.`,
  (n) => `I'm not claiming anything. I'm pointing at ${n}.`,
  (n) => `${n} talked around the death instead of through it.`,
  (n) => `If ${n} is village, they should want a different name than that.`,
  (n) => `I slept on ${n} and woke up still annoyed.`,
  (n) => `${n} is fishing for a wagon. Don't give it.`,
  (n) => `Put ${n} up. If I'm wrong, I'll eat it tomorrow.`,
  (n) => `${n} keeps redirecting. That's not how clean people talk.`,
];

const QUESTIONS: Array<(n: string) => string> = [
  (n) => `${n} — who did you want dead last night, honestly?`,
  (n) => `${n}, if you had a night action, did you use it? Yes or no.`,
  (n) => `Why shouldn't we vote ${n} right now? One reason.`,
  (n) => `${n}, pick a name that isn't me. Let's see who you throw.`,
  (n) => `Did anyone actually hear ${n} make a read, or just vibes?`,
];

const DEFLECTIONS: Array<(n: string) => string> = [
  (n) => `Leave me. The day is about ${n}.`,
  (n) => `That's a cute spin. Still ${n}.`,
  (n) => `You want me? Fine. Wagon ${n} anyway.`,
  (n) => `I'm not the puzzle. ${n} is.`,
];

function composeLine(view: PlayerView, targetId: string | null, rng: Rng): string {
  const others = view.players.filter((p) => p.isAlive && p.id !== view.viewerId);
  const target = targetId
    ? nameOf(view, targetId)
    : others.length
      ? rng.pick(others).name
      : "someone";
  const style = (view.personality?.speakingStyle ?? "").toLowerCase();
  const aggression = view.personality?.aggression ?? rng.next();
  const used = saidFingerprints(view);

  const builders: Array<() => string> = [];
  if (tannerLike(view)) {
    builders.push(
      () => rng.pick([
        `Hang me if you want a clean answer. ${target} has been louder than useful.`,
        `I'm not hiding. Start with ${target} — or start with me and waste a day.`,
        `If the village needs a body, I'm standing here. ${target} still smells worse.`,
        `Vote me. I'm done performing. ${target} can enjoy the extra day.`,
      ]),
    );
  }
  if (wolfLike(view) || skLike(view) || cultLike(view)) {
    builders.push(
      () => rng.pick([
        `${target} has been steering. Villagers don't drive this hard when they're clean.`,
        `I keep coming back to ${target}. The timing is ugly.`,
        `Don't let ${target} narrate us into a nothing day.`,
        `${target} is doing the 'helpful village' bit too early.`,
      ]),
    );
  }
  builders.push(() => rng.pick(HOOKS)(target));
  builders.push(() => rng.pick(QUESTIONS)(target));
  if (aggression > 0.55) builders.push(() => rng.pick(DEFLECTIONS)(target));

  if (style.includes("question")) {
    builders.push(() => rng.pick(QUESTIONS)(target));
  }
  if (style.includes("short") || style.includes("clipped") || style.includes("deadpan")) {
    builders.push(() => `${target}. That's the vote.`);
    builders.push(() => `Name's ${target}. I'm not writing an essay.`);
  }
  if (style.includes("lawyer") || style.includes("vote")) {
    builders.push(() => `Count the wagons. ${target} is the only name that actually moves.`);
  }
  if (style.includes("warm") || style.includes("concern")) {
    builders.push(() => `I'm worried about ${target}. That's not an attack, it's the read.`);
  }

  for (let i = 0; i < 18; i++) {
    const line = rng.pick(builders)().trim();
    const fp = fingerprint(line);
    if (!used.has(fp) && line.length > 8) return line;
  }
  return rng.pick(HOOKS)(target);
}

function voteTarget(view: PlayerView, valid: string[]): string | null {
  if (!valid.length) return null;
  const rng = scratchRng();
  if (view.memory?.intendedVoteId && valid.includes(view.memory.intendedVoteId) && rng.chance(55)) {
    return view.memory.intendedVoteId;
  }
  if (view.memory?.hunchTargetId && valid.includes(view.memory.hunchTargetId) && rng.chance(40)) {
    return view.memory.hunchTargetId;
  }
  const prefer = tannerLike(view)
    ? rng.chance(35)
      ? "mix"
      : "hot"
    : rng.chance(22)
      ? "mix"
      : "hot";
  return pickAmong(view, valid, prefer) ?? rng.pick(valid);
}

export const fallbackProvider: AIProvider = {
  id: "fallback",
  async generatePlayerDecision(req) {
    if (req.kind === "vote") return this.generateVote(req);
    if (req.kind === "night" || req.kind === "hunterShot") return this.generateNightAction(req);
    return this.generatePlayerDialogue(req);
  },
  async generatePlayerDialogue(req) {
    const rng = scratchRng();
    const valid = req.validTargets.length ? req.validTargets : livingOthers(req.view);
    const prefer = req.kind === "defense" ? "mix" : rng.chance(30) ? "mix" : "hot";
    const target = pickAmong(req.view, valid, prefer);
    const text = composeLine(req.view, target, rng);
    const mem = req.view.memory;
    if (mem) mem.saidFingerprints = [...(mem.saidFingerprints ?? []), fingerprint(text)].slice(-24);
    return {
      action: "speak",
      text,
      targetId: target,
      target2Id: null,
      confidence: 0.42 + rng.next() * 0.4,
      reasoningSummary: req.view.memory?.privateHunch ?? "Private read.",
      intendedVoteId: target,
      accusationTargetId: req.kind === "accusation" || rng.chance(60) ? target : null,
    };
  },
  async generateNightAction(req) {
    const { t1, t2 } = pickNightTarget(req);
    return {
      action: t1 ? (req.kind === "hunterShot" ? "hunterShot" : "night") : "skip",
      text: "",
      targetId: t1,
      target2Id: t2,
      confidence: 0.4 + Math.random() * 0.35,
      reasoningSummary: req.view.memory?.privateHunch ?? "Heuristic night target.",
    };
  },
  async generateVote(req) {
    const target = voteTarget(req.view, req.validTargets);
    return {
      action: "vote",
      text: "",
      targetId: target,
      target2Id: null,
      confidence: 0.38 + Math.random() * 0.4,
      reasoningSummary: "Softmax over private hunches, not first-in-list.",
      intendedVoteId: target,
    };
  },
  async summarizeMemory(_view: PlayerView, memory: NpcMemory) {
    return memory.strategicSummary || memory.privateHunch;
  },
};

export function safeDecision(provider: AIProvider, req: AiDecisionRequest): Promise<AiDecision> {
  return provider.generatePlayerDecision(req).catch(() => defaultDecision(req));
}
