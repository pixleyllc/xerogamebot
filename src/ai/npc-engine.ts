import { fallbackProvider, safeDecision } from "@/ai/fallback.ts";
import type { AIProvider, AiDecisionRequest } from "@/ai/provider.ts";
import { uniqueNonce } from "@/ai/spice.ts";
import { buildPrivateView } from "@/game/isolation.ts";
import {
  applyEngineAction,
  hunterNeedingShot,
  playersMissingNightAction,
  playersMissingVote,
} from "@/game/engine.ts";
import { livingPlayers, validNightTargets, validVoteTargets } from "@/roles/index.ts";
import type { EngineResult, GameState } from "@/game/types.ts";

export interface NpcTurnOptions {
  provider: AIProvider;
  maxSpeakers?: number;
  onMessage?: (state: GameState, speakerId: string, text: string) => Promise<void> | void;
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

export async function runNpcVotes(state: GameState, _provider: AIProvider): Promise<EngineResult> {
  let latest = emptyResult(state);
  const missing = playersMissingVote(state).filter((p) => !p.isHuman);
  for (const actor of missing) {
    if (latest.state.phase !== "voting") break;
    const view = buildPrivateView(latest.state, actor.id);
    const valid = validVoteTargets(latest.state, actor.id);
    const req: AiDecisionRequest = { kind: "vote", view, validTargets: valid, entropyNonce: uniqueNonce() };
    // Silent ballot — never ask a model to write a line. Repeat-prone vote
    // speeches were drowning the table; hunches from discussion already exist.
    const decision = await fallbackProvider.generateVote(req);
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
  _options: NpcTurnOptions,
): Promise<EngineResult> {
  return emptyResult(state);
}

/**
 * Drive every NPC action that is legal in the current phase.
 * Human actions are never invented here. NPCs never speak.
 */
export async function driveNpcs(state: GameState, provider: AIProvider): Promise<EngineResult> {
  if (state.phase === "night") return runNpcNight(state, provider);
  if (state.phase === "voting") return runNpcVotes(state, provider);
  if (state.phase === "hunterShot") return runNpcHunter(state, provider);
  return emptyResult(state);
}

export interface DriveUntilHumanOptions {
  provider: AIProvider;
  /** Extra NPC lines after the human speaks. Ignored — NPCs do not talk. */
  discussionReplies?: number;
  /** Opening village chatter. Ignored — NPCs do not talk. */
  openingSpeakers?: number;
  startedPhase?: GameState["phase"];
  skipDiscussion?: boolean;
}

/**
 * Play every NPC action that can happen without the human, then stop.
 * Never auto-calls the vote. Never invents a human action. Never speaks.
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
