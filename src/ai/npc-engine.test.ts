import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createGame } from "@/game/setup.ts";
import { applyEngineAction, startGame } from "@/game/engine.ts";
import { fallbackProvider } from "@/ai/fallback.ts";
import { driveNpcsUntilHuman } from "@/ai/npc-engine.ts";

describe("driveNpcsUntilHuman", () => {
  it("opens a real table and does not dump back to lobby", async () => {
    let state = createGame({
      playerCount: 8,
      mode: "classic",
      seed: "stay-at-table",
      humanName: "Zack",
    });
    state = startGame(state).state;
    state = await driveNpcsUntilHuman(state, { provider: fallbackProvider });
    assert.notEqual(state.phase, "lobby");
    assert.notEqual(state.phase, "gameOver");
    assert.ok(state.phase === "night" || state.phase === "discussion");
    if (state.phase === "night") {
      assert.equal(state.waitingForHuman, true);
      assert.ok(state.humanPrompt);
      const target = state.humanPrompt!.targets[0]?.id;
      state = applyEngineAction(state, {
        type: state.humanPrompt!.kind === "cupid" ? "nightCupid" : target ? "nightTarget" : "skip",
        actorId: state.humanPlayerId,
        targetId: target,
        target2Id: state.humanPrompt!.targets[1]?.id,
      }).state;
      state = await driveNpcsUntilHuman(state, { provider: fallbackProvider });
    }
    assert.equal(state.phase, "discussion");
    const npcLines = state.chat.filter((m) => m.kind === "player" && m.authorId !== state.humanPlayerId);
    assert.ok(npcLines.length >= 2, "NPCs must speak during discussion");
    assert.equal(state.waitingForHuman, true);
  });

  it("keeps the human at the table through a vote into the next night", async () => {
    let state = createGame({
      playerCount: 8,
      mode: "classic",
      seed: "full-day",
      humanName: "Zack",
    });
    state = startGame(state).state;
    state = await driveNpcsUntilHuman(state, { provider: fallbackProvider });
    if (state.humanPrompt?.kind === "night" || state.humanPrompt?.kind === "cupid") {
      const t = state.humanPrompt.targets[0]?.id;
      state = applyEngineAction(state, {
        type: state.humanPrompt.kind === "cupid" ? "nightCupid" : t ? "nightTarget" : "skip",
        actorId: state.humanPlayerId,
        targetId: t,
        target2Id: state.humanPrompt.targets[1]?.id,
      }).state;
      state = await driveNpcsUntilHuman(state, { provider: fallbackProvider });
    }
    assert.equal(state.phase, "discussion");
    state = applyEngineAction(state, { type: "advance", actorId: state.humanPlayerId }).state;
    state = await driveNpcsUntilHuman(state, { provider: fallbackProvider });
    assert.equal(state.phase, "voting");
    assert.ok(state.humanPrompt?.kind === "vote");
    const voteFor = state.humanPrompt.targets[0]!.id;
    state = applyEngineAction(state, {
      type: "vote",
      actorId: state.humanPlayerId,
      targetId: voteFor,
    }).state;
    state = await driveNpcsUntilHuman(state, { provider: fallbackProvider });
    assert.ok(state.phase === "night" || state.phase === "gameOver" || state.phase === "hunterShot" || state.phase === "discussion");
    assert.notEqual(state.phase, "lobby");
  });
});
