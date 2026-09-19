import type { AIProvider, AiDecision, AiDecisionRequest } from "@/ai/provider.ts";
import { defaultDecision } from "@/ai/provider.ts";
import type { NpcMemory, PlayerView } from "@/game/types.ts";

function nameOf(view: PlayerView, id: string): string {
  return view.players.find((p) => p.id === id)?.name ?? id;
}

function livingOthers(view: PlayerView): string[] {
  return view.players.filter((p) => p.isAlive && p.id !== view.viewerId).map((p) => p.id);
}

function mostSuspicious(view: PlayerView, valid: string[]): string | null {
  const mem = view.memory;
  if (!mem) return valid[0] ?? null;
  let bestId: string | null = null;
  let best = -1;
  for (const id of valid) {
    const score = mem.beliefs[id] ?? 0.35;
    if (score > best) {
      best = score;
      bestId = id;
    }
  }
  return bestId;
}

function leastSuspicious(view: PlayerView, valid: string[]): string | null {
  const mem = view.memory;
  if (!mem) return valid[0] ?? null;
  let bestId: string | null = null;
  let best = 99;
  for (const id of valid) {
    const score = mem.beliefs[id] ?? 0.35;
    if (score < best) {
      best = score;
      bestId = id;
    }
  }
  return bestId;
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

function pickNightTarget(req: AiDecisionRequest): { t1: string | null; t2: string | null } {
  const view = req.view;
  const valid = req.validTargets;
  if (!valid.length) return { t1: null, t2: null };
  const role = view.shownRoleId;
  if (role === "werewolf" || role === "serialKiller") {
    return { t1: leastSuspicious(view, valid) ?? valid[0]!, t2: null };
  }
  if (role === "seer") {
    return { t1: mostSuspicious(view, valid) ?? valid[0]!, t2: null };
  }
  if (role === "guardianAngel") {
    const selfAllies = [
      ...view.packMates.map((p) => p.id),
      view.loverId,
    ].filter((id): id is string => !!id && valid.includes(id));
    if (view.investigations.some((i) => i.shownRoleId === "werewolf")) {
      const seerSelf = valid.includes(view.viewerId) ? view.viewerId : null;
      return { t1: selfAllies[0] ?? leastSuspicious(view, valid) ?? seerSelf ?? valid[0]!, t2: null };
    }
    return { t1: leastSuspicious(view, valid) ?? valid[0]!, t2: null };
  }
  if (role === "cultist") {
    return { t1: mostSuspicious(view, valid) ?? valid[0]!, t2: null };
  }
  if (role === "cupid") {
    const a = valid[0] ?? null;
    const b = valid.find((id) => id !== a) ?? null;
    return { t1: a, t2: b };
  }
  return { t1: valid[0] ?? null, t2: valid[1] ?? null };
}

function speak(view: PlayerView, targetId: string | null): string {
  const p = view.personality;
  const target = targetId ? nameOf(view, targetId) : "someone";
  const aggression = p?.aggression ?? 0.4;
  const analytical = p?.analytical ?? 0.4;
  if (tannerLike(view)) {
    return aggression > 0.6
      ? `Honestly? Vote me if you want a clean answer. ${target} has been louder than useful.`
      : `I'm not hiding. If the village wants a name, start with ${target} — but don't pretend I look wolfy.`;
  }
  if (wolfLike(view) || skLike(view) || cultLike(view)) {
    return aggression > 0.55
      ? `${target} has been steering this table. That's not how a villager talks when they're clean.`
      : `I keep coming back to ${target}. The votes around them don't add up.`;
  }
  if (analytical > 0.6) {
    return `${target} is the loudest pattern I have: yesterday's vote plus tonight's death don't clear them.`;
  }
  if (aggression > 0.65) {
    return `I'm putting ${target} up. If you're village, you vote with me.`;
  }
  return `I don't love how ${target} has been playing. We should talk about them before we lock a vote.`;
}

function voteTarget(view: PlayerView, valid: string[]): string | null {
  if (view.memory?.intendedVoteId && valid.includes(view.memory.intendedVoteId)) {
    return view.memory.intendedVoteId;
  }
  if (tannerLike(view)) {
    return mostSuspicious(view, valid);
  }
  if (wolfLike(view) || skLike(view)) {
    return mostSuspicious(view, valid);
  }
  return mostSuspicious(view, valid);
}

export const fallbackProvider: AIProvider = {
  id: "fallback",
  async generatePlayerDecision(req) {
    if (req.kind === "vote") return this.generateVote(req);
    if (req.kind === "night") return this.generateNightAction(req);
    return this.generatePlayerDialogue(req);
  },
  async generatePlayerDialogue(req) {
    const valid = req.validTargets.length ? req.validTargets : livingOthers(req.view);
    const target = mostSuspicious(req.view, valid);
    const text = speak(req.view, target);
    return {
      action: "speak",
      text,
      targetId: target,
      target2Id: null,
      confidence: 0.55,
      reasoningSummary: "Heuristic read from suspicion scores.",
      intendedVoteId: target,
      accusationTargetId: target,
    };
  },
  async generateNightAction(req) {
    const { t1, t2 } = pickNightTarget(req);
    return {
      action: t1 ? "night" : "skip",
      text: "",
      targetId: t1,
      target2Id: t2,
      confidence: 0.6,
      reasoningSummary: "Heuristic night target.",
    };
  },
  async generateVote(req) {
    const target = voteTarget(req.view, req.validTargets);
    return {
      action: "vote",
      text: "",
      targetId: target,
      target2Id: null,
      confidence: 0.58,
      reasoningSummary: "Highest suspicion among legal votes.",
      intendedVoteId: target,
    };
  },
  async summarizeMemory(_view: PlayerView, memory: NpcMemory) {
    return memory.strategicSummary;
  },
};

export function safeDecision(provider: AIProvider, req: AiDecisionRequest): Promise<AiDecision> {
  return provider.generatePlayerDecision(req).catch(() => defaultDecision(req));
}
