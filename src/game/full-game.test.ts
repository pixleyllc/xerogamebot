import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createGame } from "@/game/setup.ts";
import { applyEngineAction, startGame } from "@/game/engine.ts";
import { driveNpcs } from "@/ai/npc-engine.ts";
import { fallbackProvider } from "@/ai/fallback.ts";
import type { GameState, RoleId } from "@/game/types.ts";

async function autoHuman(state: GameState): Promise<GameState> {
  let current = state;
  let steps = 0;
  while (current.phase !== "gameOver" && steps++ < 80) {
    current = (await driveNpcs(current, fallbackProvider)).state;
    if (current.phase === "gameOver") break;
    if (current.waitingForHuman && current.humanPrompt) {
      const prompt = current.humanPrompt;
      if (prompt.kind === "discussion" || prompt.kind === "continue") {
        current = applyEngineAction(current, {
          type: "say",
          actorId: current.humanPlayerId,
          text: "I am watching the votes.",
        }).state;
        current = applyEngineAction(current, {
          type: "advance",
          actorId: current.humanPlayerId,
        }).state;
        continue;
      }
      const target = prompt.targets[0]?.id;
      const target2 = prompt.targets[1]?.id;
      if (prompt.kind === "cupid") {
        current = applyEngineAction(current, {
          type: "nightCupid",
          actorId: current.humanPlayerId,
          targetId: target,
          target2Id: target2,
        }).state;
      } else if (prompt.kind === "night") {
        current = applyEngineAction(current, {
          type: target ? "nightTarget" : "skip",
          actorId: current.humanPlayerId,
          targetId: target,
        }).state;
      } else if (prompt.kind === "vote") {
        current = applyEngineAction(current, {
          type: "vote",
          actorId: current.humanPlayerId,
          targetId: target,
        }).state;
      } else if (prompt.kind === "hunterShot") {
        current = applyEngineAction(current, {
          type: "hunterShot",
          actorId: current.humanPlayerId,
          targetId: target,
        }).state;
      } else {
        current = applyEngineAction(current, {
          type: "skip",
          actorId: current.humanPlayerId,
        }).state;
      }
      continue;
    }
    if (!current.waitingForHuman) {
      current = applyEngineAction(current, {
        type: "advance",
        actorId: current.humanPlayerId,
      }).state;
    }
  }
  return current;
}

describe("simulated full games", () => {
  it("completes an 8-player classic game with fallback AI", async () => {
    let state = createGame({ playerCount: 8, mode: "classic", seed: "full-8", humanName: "Zack" });
    state = startGame(state).state;
    state = await autoHuman(state);
    assert.equal(state.phase, "gameOver");
    assert.ok(state.winners);
    assert.ok(["village", "wolf", "tanner", "serialKiller", "lovers", "cult", "noOne"].includes(state.winners.faction));
  });

  it("completes a 10-player game", async () => {
    let state = createGame({ playerCount: 10, mode: "classic", seed: "full-10" });
    state = startGame(state).state;
    state = await autoHuman(state);
    assert.equal(state.phase, "gameOver");
    assert.ok(state.winners);
  });

  it("survives JSON persistence roundtrip mid-game", () => {
    const state = startGame(
      createGame({ playerCount: 8, seed: "persist", forcedRoles: [
        "seer",
        "werewolf",
        "guardianAngel",
        "hunter",
        "villager",
        "villager",
        "villager",
        "villager",
      ] as RoleId[] }),
    ).state;
    const json = JSON.stringify(state);
    const restored = JSON.parse(json) as GameState;
    assert.equal(restored.players.length, 8);
    assert.equal(restored.seed, state.seed);
    assert.equal(restored.phase, state.phase);
  });
});
