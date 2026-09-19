import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { fallbackProvider } from "@/ai/fallback.ts";
import { parseDecisionJson } from "@/ai/provider.ts";
import { createGame } from "@/game/setup.ts";
import { startGame } from "@/game/engine.ts";
import { buildPrivateView } from "@/game/isolation.ts";
import { validVoteTargets } from "@/roles/index.ts";

describe("AI fallback", () => {
  it("always returns a legal vote", async () => {
    const state = startGame(createGame({ playerCount: 8, seed: "ai-vote" })).state;
    const npc = state.players.find((p) => !p.isHuman)!;
    const view = buildPrivateView(state, npc.id);
    const valid = validVoteTargets(state, npc.id);
    const decision = await fallbackProvider.generateVote({
      kind: "vote",
      view,
      validTargets: valid,
    });
    assert.ok(decision.targetId);
    assert.ok(valid.includes(decision.targetId));
    assert.equal(decision.text, "");
  });

  it("parses messy JSON from an LLM", () => {
    const req = {
      kind: "vote" as const,
      view: buildPrivateView(startGame(createGame({ playerCount: 8, seed: "parse" })).state, "human"),
      validTargets: ["npc-1", "npc-2"],
    };
    const parsed = parseDecisionJson(
      'Sure. ```json\n{"action":"vote","targetId":"npc-2","text":"him","confidence":0.7,"reasoningSummary":"votes"}\n```',
      req,
    );
    assert.equal(parsed.targetId, "npc-2");
    assert.equal(parsed.action, "vote");
    assert.equal(parsed.text, "");
  });

  it("falls back when JSON is garbage", () => {
    const req = {
      kind: "vote" as const,
      view: buildPrivateView(startGame(createGame({ playerCount: 8, seed: "parse2" })).state, "human"),
      validTargets: ["npc-1"],
    };
    const parsed = parseDecisionJson("I refuse to use JSON", req);
    assert.equal(parsed.targetId, "npc-1");
  });
});
