import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createGame } from "@/game/setup.ts";
import { applyEngineAction, startGame } from "@/game/engine.ts";
import { castVote, hunterShoot, resetVotes, tallyVotes } from "@/game/voting.ts";
import type { RoleId } from "@/game/types.ts";

function dealt(forced: RoleId[]) {
  const state = startGame(
    createGame({
      playerCount: forced.length as 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15,
      forcedRoles: forced,
      seed: "vote",
    }),
  ).state;
  state.phase = "voting";
  resetVotes(state);
  return state;
}

describe("voting", () => {
  it("lynches the plurality", () => {
    const state = dealt([
      "villager",
      "werewolf",
      "seer",
      "guardianAngel",
      "hunter",
      "villager",
      "villager",
      "villager",
    ]);
    const target = state.players.find((p) => p.roleId === "werewolf")!;
    for (const p of state.players.filter((x) => x.isAlive && x.id !== target.id)) {
      castVote(state, p.id, target.id);
    }
    const { lynched, tie } = tallyVotes(state);
    assert.equal(tie, false);
    assert.equal(lynched?.id, target.id);
  });

  it("tie with default rules is no lynch", () => {
    const state = dealt([
      "villager",
      "werewolf",
      "seer",
      "guardianAngel",
      "hunter",
      "villager",
      "villager",
      "villager",
    ]);
    const a = state.players[0]!;
    const b = state.players[1]!;
    const c = state.players[2]!;
    const d = state.players[3]!;
    castVote(state, a.id, b.id);
    castVote(state, c.id, d.id);
    const { lynched, tie } = tallyVotes(state);
    assert.equal(tie, true);
    assert.equal(lynched, null);
  });

  it("random tie break picks someone", () => {
    const state = dealt([
      "villager",
      "werewolf",
      "seer",
      "guardianAngel",
      "hunter",
      "villager",
      "villager",
      "villager",
    ]);
    state.settings.tieBreak = "random";
    const a = state.players[0]!;
    const b = state.players[1]!;
    const c = state.players[2]!;
    const d = state.players[3]!;
    castVote(state, a.id, b.id);
    castVote(state, c.id, d.id);
    const { lynched, tie } = tallyVotes(state);
    assert.equal(tie, true);
    assert.ok(lynched);
  });

  it("dead players cannot vote", () => {
    const state = dealt([
      "villager",
      "werewolf",
      "seer",
      "guardianAngel",
      "hunter",
      "villager",
      "villager",
      "villager",
    ]);
    const dead = state.players[1]!;
    dead.isAlive = false;
    const err = castVote(state, dead.id, state.players[0]!.id);
    assert.ok(err);
  });

  it("hunter death shot kills the target", () => {
    const state = dealt([
      "hunter",
      "werewolf",
      "seer",
      "guardianAngel",
      "villager",
      "villager",
      "villager",
      "villager",
    ]);
    const hunter = state.players.find((p) => p.roleId === "hunter")!;
    const wolf = state.players.find((p) => p.roleId === "werewolf")!;
    hunter.isAlive = false;
    hunter.diedAtDay = 1;
    hunter.deathCause = "lynch";
    state.phase = "hunterShot";
    state.pendingHunterId = hunter.id;
    const err = hunterShoot(state, hunter.id, wolf.id);
    assert.equal(err, null);
    assert.equal(wolf.isAlive, false);
    assert.equal(wolf.deathCause, "hunterShot");
  });
});

void applyEngineAction;
