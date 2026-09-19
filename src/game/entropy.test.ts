import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createGame } from "@/game/setup.ts";
import { startGame } from "@/game/engine.ts";
import { fallbackProvider } from "@/ai/fallback.ts";
import { runNpcDiscussion } from "@/ai/npc-engine.ts";
import { fingerprint } from "@/ai/spice.ts";
import type { RoleId } from "@/game/types.ts";

describe("live entropy", () => {
  it("unseeded classic deals scatter the human role", () => {
    const counts = new Map<RoleId, number>();
    for (let i = 0; i < 48; i++) {
      const g = createGame({ playerCount: 10, mode: "classic" });
      const role = g.players[0]!.roleId;
      counts.set(role, (counts.get(role) ?? 0) + 1);
    }
    assert.ok(
      counts.size >= 4,
      `human role too stable: ${[...counts.entries()].map(([k, v]) => `${k}:${v}`).join(", ")}`,
    );
  });

  it("two unseeded games do not clone the same role list onto the same names", () => {
    const a = createGame({ playerCount: 10, mode: "chaos", humanName: "Zack" });
    const b = createGame({ playerCount: 10, mode: "chaos", humanName: "Zack" });
    const sig = (g: typeof a) =>
      g.players.map((p) => `${p.name}:${p.roleId}`).join("|");
    assert.notEqual(sig(a), sig(b));
  });

  it("NPCs start with different hunches, not a shared 0.35 pile-on", () => {
    const g = createGame({ playerCount: 10, seed: "hunches-apart" });
    const hunches = g.players
      .filter((p) => !p.isHuman)
      .map((p) => g.memories[p.id]?.hunchTargetId);
    const unique = new Set(hunches.filter(Boolean));
    assert.ok(unique.size >= 3, `hunches collapsed to ${[...unique].join(",")}`);
    const firstNpc = g.players.find((p) => !p.isHuman)!;
    const beliefs = Object.values(g.memories[firstNpc.id]!.beliefs);
    const distinct = new Set(beliefs.map((n) => n.toFixed(2)));
    assert.ok(distinct.size >= 3, "beliefs were not jittered");
  });

  it("discussion lines are not clones of each other", async () => {
    let state = startGame(createGame({ playerCount: 10, seed: "talk-apart", humanName: "Zack" })).state;
    if (state.phase === "night" && state.waitingForHuman) {
      const { applyEngineAction } = await import("@/game/engine.ts");
      const t = state.humanPrompt?.targets[0]?.id;
      state = applyEngineAction(state, {
        type: state.humanPrompt?.kind === "cupid" ? "nightCupid" : t ? "nightTarget" : "skip",
        actorId: state.humanPlayerId,
        targetId: t,
        target2Id: state.humanPrompt?.targets[1]?.id,
      }).state;
    }
    const { driveNpcsUntilHuman } = await import("@/ai/npc-engine.ts");
    state = await driveNpcsUntilHuman(state, { provider: fallbackProvider, openingSpeakers: 5 });
    if (state.phase === "discussion" && state.chat.filter((m) => m.kind === "player").length < 3) {
      state = (await runNpcDiscussion(state, { provider: fallbackProvider, maxSpeakers: 5 })).state;
    }
    const lines = state.chat.filter((m) => m.kind === "player").map((m) => fingerprint(m.text));
    assert.ok(lines.length >= 3, "expected several NPC lines");
    assert.equal(new Set(lines).size, lines.length, `duplicate NPC lines: ${lines.join(" || ")}`);
  });
});
