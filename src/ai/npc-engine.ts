import { fallbackProvider, safeDecision } from "@/ai/fallback.ts";
import type { AIProvider, AiDecisionKind, AiDecisionRequest } from "@/ai/provider.ts";
import { bumpBelief, pruneMemory, recordAccusation } from "@/ai/memory.ts";
import { pickAngle, uniqueNonce, fingerprint } from "@/ai/spice.ts";
import { buildPrivateView } from "@/game/isolation.ts";
import { withGameRng } from "@/game/rng.ts";
import {
  applyEngineAction,
  hunterNeedingShot,
  playersMissingNightAction,
  playersMissingVote,
} from "@/game/engine.ts";
import { livingPlayers, validNightTargets, validVoteTargets } from "@/roles/index.ts";
import type { EngineResult, GameState, PlayerState } from "@/game/types.ts";

export interface NpcTurnOptions {
  provider: AIProvider;
  maxSpeakers?: number;
  onMessage?: (state: GameState, speakerId: string, text: string) => Promise<void> | void;
}

function speakerScore(p: PlayerState): number {
  return p.personality.aggression * 0.5 + p.personality.analytical * 0.25 + 0.1;
}

function pickSpeakers(state: GameState, pool: PlayerState[], max: number): PlayerState[] {
  if (pool.length <= max) {
    return withGameRng(state, (rng) => rng.shuffle(pool));
  }
  return withGameRng(state, (rng) => {
    if (rng.chance(35)) {
      const ranked = pool.slice().sort((a, b) => speakerScore(b) - speakerScore(a));
      const head = ranked.slice(0, Math.max(1, Math.floor(max / 2)));
      const rest = rng.shuffle(ranked.slice(head.length)).slice(0, max - head.length);
      return rng.shuffle([...head, ...rest]);
    }
    return rng.shuffle(pool).slice(0, max);
  });
}

function pickKind(state: GameState, actor: PlayerState): AiDecisionKind {
  return withGameRng(state, (rng) => {
    const last = state.lastHumanStatement?.toLowerCase() ?? "";
    if (last.includes(actor.name.toLowerCase())) return "defense";
    const roll = rng.next();
    if (roll < 0.32) return "accusation";
    if (roll < 0.44) return "defense";
    return "discussion";
  });
}

function emptyResult(state: GameState): EngineResult {
  return { state, privateMessages: [], publicMessages: [], errors: [] };
}

export async function runNpcNight(state: GameState, provider: AIProvider): Promise<EngineResult> {
  let latest = emptyResult(state);
  const missing = playersMissingNightAction(state).filter((p) => !p.isHuman);
  for (const actor of missing) {
    if (latest.state.phase !== "night") break;
    const view = buildPrivateView(latest.state, actor.id);
    const valid = validNightTargets(latest.state, actor);
    const req: AiDecisionRequest = {
      kind: "night",
      view,
      validTargets: valid,
      entropyNonce: uniqueNonce(),
    };
    const decision = await safeDecision(provider, req).catch(() =>
      fallbackProvider.generateNightAction(req),
    );
    if (actor.roleId === "cupid") {
      const t1 = decision.targetId ?? valid[Math.floor(Math.random() * valid.length)];
      const rest = valid.filter((id) => id !== t1);
      latest = applyEngineAction(latest.state, {
        type: "nightCupid",
        actorId: actor.id,
        targetId: t1,
        target2Id: decision.target2Id ?? rest[Math.floor(Math.random() * rest.length)],
      });
    } else if (decision.targetId) {
      latest = applyEngineAction(latest.state, {
        type: "nightTarget",
        actorId: actor.id,
        targetId: decision.targetId,
      });
    } else if (valid.length) {
      latest = applyEngineAction(latest.state, {
        type: "nightTarget",
        actorId: actor.id,
        targetId: valid[Math.floor(Math.random() * valid.length)]!,
      });
    } else {
      latest = applyEngineAction(latest.state, { type: "skip", actorId: actor.id });
    }
  }
  return latest;
}

export async function runNpcVotes(state: GameState, provider: AIProvider): Promise<EngineResult> {
  let latest = emptyResult(state);
  const missing = playersMissingVote(state).filter((p) => !p.isHuman);
  for (const actor of missing) {
    if (latest.state.phase !== "voting") break;
    const view = buildPrivateView(latest.state, actor.id);
    const valid = validVoteTargets(latest.state, actor.id);
    const req: AiDecisionRequest = { kind: "vote", view, validTargets: valid, entropyNonce: uniqueNonce() };
    const decision = await safeDecision(provider, req).catch(() =>
      fallbackProvider.generateVote(req),
    );
    const target =
      (decision.targetId && valid.includes(decision.targetId) && decision.targetId) ||
      (valid.length ? valid[Math.floor(Math.random() * valid.length)] : undefined);
    if (target) {
      latest = applyEngineAction(latest.state, {
        type: "vote",
        actorId: actor.id,
        targetId: target,
      });
    }
  }
  return latest;
}

export async function runNpcHunter(state: GameState, provider: AIProvider): Promise<EngineResult> {
  const hunter = hunterNeedingShot(state);
  if (!hunter || hunter.isHuman) return emptyResult(state);
  const view = buildPrivateView(state, hunter.id);
  const valid = livingPlayers(state)
    .filter((p) => p.id !== hunter.id)
    .map((p) => p.id);
  const req: AiDecisionRequest = { kind: "hunterShot", view, validTargets: valid, entropyNonce: uniqueNonce() };
  const decision = await safeDecision(provider, req).catch(() =>
    fallbackProvider.generatePlayerDecision(req),
  );
  const target =
    decision.targetId && valid.includes(decision.targetId)
      ? decision.targetId
      : valid.length
        ? valid[Math.floor(Math.random() * valid.length)]
        : undefined;
  if (!target) return emptyResult(state);
  return applyEngineAction(state, {
    type: "hunterShot",
    actorId: hunter.id,
    targetId: target,
  });
}

export async function runNpcDiscussion(
  state: GameState,
  options: NpcTurnOptions,
): Promise<EngineResult> {
  const provider = options.provider;
  const max = options.maxSpeakers ?? state.settings.maxDiscussionMessages;
  const already = new Set(state.discussionPlan);
  const living = livingPlayers(state).filter((p) => !p.isHuman && !already.has(p.id));
  const speakers = pickSpeakers(state, living, Math.min(max, living.length));
  let latest = emptyResult(state);
  for (const actor of speakers) {
    if (latest.state.phase !== "discussion") break;
    const view = buildPrivateView(latest.state, actor.id);
    const valid = livingPlayers(latest.state)
      .filter((p) => p.id !== actor.id)
      .map((p) => p.id);
    const kind = pickKind(latest.state, actor);
    const angle = withGameRng(latest.state, (rng) =>
      pickAngle(rng, latest.state.chat.map((m) => m.text).join(" ")),
    );
    const req: AiDecisionRequest = {
      kind,
      view,
      validTargets: valid,
      recentHumanStatement: latest.state.lastHumanStatement,
      entropyNonce: uniqueNonce(),
      angle,
    };
    const decision = await safeDecision(provider, req).catch(() =>
      fallbackProvider.generatePlayerDialogue(req),
    );
    const text = decision.text.trim() || fallbackLine(actor, view, decision.targetId);
    latest = applyEngineAction(latest.state, {
      type: "say",
      actorId: actor.id,
      text,
    });
    const memAfter = latest.state.memories[actor.id];
    if (memAfter) {
      memAfter.saidFingerprints = [
        ...(memAfter.saidFingerprints ?? []),
        fingerprint(text),
      ].slice(-24);
    }
    latest.state.discussionPlan = [...latest.state.discussionPlan, actor.id];
    latest.state.discussionIndex = latest.state.discussionPlan.length;
    if (decision.accusationTargetId) {
      recordAccusation(latest.state, actor, decision.accusationTargetId, text);
    }
    if (decision.intendedVoteId) {
      const mem = latest.state.memories[actor.id];
      if (mem) mem.intendedVoteId = decision.intendedVoteId;
    }
    if (decision.updatedBeliefs) {
      const mem = latest.state.memories[actor.id];
      if (mem) {
        for (const [id, value] of Object.entries(decision.updatedBeliefs)) {
          if (typeof value === "number") mem.beliefs[id] = Math.max(0.02, Math.min(0.98, value));
        }
      }
    }
    if (decision.targetId) {
      const mem = latest.state.memories[actor.id];
      if (mem) bumpBelief(mem, decision.targetId, 0.04, actor.personality.analytical);
    }
    pruneMemory(latest.state.memories[actor.id]!);
    await options.onMessage?.(latest.state, actor.id, text);
  }
  return latest;
}

function fallbackLine(actor: PlayerState, view: ReturnType<typeof buildPrivateView>, targetId: string | null) {
  const name =
    view.players.find((p) => p.id === targetId)?.name ??
    view.players.find((p) => p.isAlive && p.id !== actor.id)?.name ??
    "them";
  return `${name} still looks off to me. I'm not ready to drop it.`;
}

/**
 * Drive every NPC action that is legal in the current phase.
 * Human actions are never invented here.
 */
export async function driveNpcs(state: GameState, provider: AIProvider): Promise<EngineResult> {
  if (state.phase === "night") return runNpcNight(state, provider);
  if (state.phase === "voting") return runNpcVotes(state, provider);
  if (state.phase === "hunterShot") return runNpcHunter(state, provider);
  if (state.phase === "discussion") return runNpcDiscussion(state, { provider });
  return emptyResult(state);
}

export interface DriveUntilHumanOptions {
  provider: AIProvider;
  /** Extra NPC lines after the human speaks. Default 2. */
  discussionReplies?: number;
  /** Opening village chatter. Default settings.maxDiscussionMessages. */
  openingSpeakers?: number;
}

/**
 * Play every NPC action that can happen without the human, then stop.
 * Never auto-calls the vote. Never invents a human action.
 * Stays on the table through night → dawn → discussion.
 */
export async function driveNpcsUntilHuman(
  state: GameState,
  options: DriveUntilHumanOptions,
): Promise<GameState> {
  const provider = options.provider;
  let current = state;
  let guard = 0;
  while (guard++ < 20 && current.phase !== "gameOver") {
    const beforeKey = `${current.phase}:${current.waitingForHuman}:${current.chat.length}:${current.night}:${current.day}`;
    if (current.phase === "night") {
      current = (await runNpcNight(current, provider)).state;
      if (current.phase === "night") break;
      continue;
    }
    if (current.phase === "discussion") {
      const opening = options.openingSpeakers ?? current.settings.maxDiscussionMessages;
      const replies = options.discussionReplies ?? 2;
      const want = current.discussionPlan.length === 0 ? opening : current.discussionPlan.length + replies;
      const remaining = Math.max(0, want - current.discussionPlan.length);
      if (remaining > 0) {
        current = (await runNpcDiscussion(current, { provider, maxSpeakers: remaining })).state;
      }
      break;
    }
    if (current.phase === "voting") {
      current = (await runNpcVotes(current, provider)).state;
      if (current.phase !== "voting") continue;
      if (current.waitingForHuman) break;
      const still = playersMissingVote(current);
      if (!still.length) {
        current = applyEngineAction(current, {
          type: "advance",
          actorId: current.humanPlayerId,
        }).state;
        continue;
      }
      break;
    }
    if (current.phase === "hunterShot") {
      current = (await runNpcHunter(current, provider)).state;
      if (current.phase === "hunterShot" && current.waitingForHuman) break;
      if (current.phase === "hunterShot") {
        current = applyEngineAction(current, {
          type: "advance",
          actorId: current.humanPlayerId,
        }).state;
      }
      continue;
    }
    if (
      current.phase === "dawn" ||
      current.phase === "execution" ||
      current.phase === "day" ||
      current.phase === "winCheck"
    ) {
      current = applyEngineAction(current, {
        type: "advance",
        actorId: current.humanPlayerId,
      }).state;
      const afterKey = `${current.phase}:${current.waitingForHuman}:${current.chat.length}:${current.night}:${current.day}`;
      if (afterKey === beforeKey) break;
      continue;
    }
    break;
  }
  return current;
}
