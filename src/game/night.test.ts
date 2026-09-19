import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createGame } from "@/game/setup.ts";
import { applyEngineAction, startGame } from "@/game/engine.ts";
import { recordNightAction, resetNightFlags, resolveNight } from "@/game/night.ts";
import type { RoleId } from "@/game/types.ts";

function table(forced: RoleId[], seed = "n") {
  const g = createGame({
    playerCount: forced.length as 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15,
    forcedRoles: forced,
    seed,
    humanName: "Zack",
  });
  return startGame(g).state;
}

describe("night resolution", () => {
  it("seer learns the true role", () => {
    const state = table([
      "seer",
      "werewolf",
      "guardianAngel",
      "hunter",
      "villager",
      "villager",
      "villager",
      "villager",
    ]);
    const seer = state.players.find((p) => p.roleId === "seer")!;
    const wolf = state.players.find((p) => p.roleId === "werewolf")!;
    resetNightFlags(state);
    state.phase = "night";
    state.night = 1;
    recordNightAction(state, { actorId: seer.id, type: "see", targetId: wolf.id, target2Id: null });
    resolveNight(state);
    assert.equal(seer.investigations[0]?.shownRoleId, "werewolf");
    assert.equal(seer.investigations[0]?.wasTrue, true);
  });

  it("fool is shown a fabricated role", () => {
    const state = table(
      [
        "fool",
        "werewolf",
        "seer",
        "guardianAngel",
        "hunter",
        "villager",
        "villager",
        "villager",
        "villager",
      ],
      "fool-see",
    );
    const fool = state.players.find((p) => p.roleId === "fool")!;
    const wolf = state.players.find((p) => p.roleId === "werewolf")!;
    resetNightFlags(state);
    state.phase = "night";
    state.night = 1;
    recordNightAction(state, { actorId: fool.id, type: "see", targetId: wolf.id, target2Id: null });
    resolveNight(state);
    assert.ok(fool.investigations[0]);
    assert.equal(typeof fool.investigations[0]?.shownRoleId, "string");
  });

  it("guardian angel blocks a wolf kill", () => {
    const state = table([
      "guardianAngel",
      "werewolf",
      "seer",
      "hunter",
      "villager",
      "villager",
      "villager",
      "villager",
    ]);
    const ga = state.players.find((p) => p.roleId === "guardianAngel")!;
    const wolf = state.players.find((p) => p.roleId === "werewolf")!;
    const seer = state.players.find((p) => p.roleId === "seer")!;
    resetNightFlags(state);
    state.phase = "night";
    state.night = 2;
    recordNightAction(state, { actorId: ga.id, type: "protect", targetId: seer.id, target2Id: null });
    recordNightAction(state, { actorId: wolf.id, type: "wolfKill", targetId: seer.id, target2Id: null });
    resolveNight(state);
    assert.equal(seer.isAlive, true);
    assert.equal(seer.wasSavedLastNight, true);
  });

  it("serial killer kill is blocked by protection", () => {
    const state = table([
      "serialKiller",
      "werewolf",
      "seer",
      "guardianAngel",
      "hunter",
      "villager",
      "villager",
      "tanner",
      "villager",
      "villager",
      "villager",
      "villager",
      "villager",
    ]);
    const sk = state.players.find((p) => p.roleId === "serialKiller")!;
    const ga = state.players.find((p) => p.roleId === "guardianAngel")!;
    const hunter = state.players.find((p) => p.roleId === "hunter")!;
    const wolf = state.players.find((p) => p.roleId === "werewolf")!;
    const seer = state.players.find((p) => p.roleId === "seer")!;
    resetNightFlags(state);
    state.phase = "night";
    state.night = 2;
    recordNightAction(state, { actorId: ga.id, type: "protect", targetId: hunter.id, target2Id: null });
    recordNightAction(state, { actorId: sk.id, type: "skKill", targetId: hunter.id, target2Id: null });
    recordNightAction(state, { actorId: wolf.id, type: "wolfKill", targetId: seer.id, target2Id: null });
    resolveNight(state);
    assert.equal(hunter.isAlive, true);
  });

  it("rejects dead players acting", () => {
    const state = table([
      "werewolf",
      "seer",
      "guardianAngel",
      "hunter",
      "villager",
      "villager",
      "villager",
      "villager",
    ]);
    const wolf = state.players.find((p) => p.roleId === "werewolf")!;
    wolf.isAlive = false;
    state.phase = "night";
    const err = recordNightAction(state, {
      actorId: wolf.id,
      type: "wolfKill",
      targetId: state.players.find((p) => p.roleId === "seer")!.id,
      target2Id: null,
    });
    assert.ok(err);
  });

  it("cupid binds two lovers who die together", () => {
    const state = table(
      [
        "cupid",
        "werewolf",
        "seer",
        "guardianAngel",
        "hunter",
        "fool",
        "villager",
        "villager",
        "villager",
        "villager",
        "villager",
        "villager",
      ],
      "cupid",
    );
    const cupid = state.players.find((p) => p.roleId === "cupid")!;
    const a = state.players.find((p) => p.roleId === "seer")!;
    const b = state.players.find((p) => p.roleId === "hunter")!;
    const wolf = state.players.find((p) => p.roleId === "werewolf")!;
    resetNightFlags(state);
    state.phase = "night";
    state.night = 1;
    recordNightAction(state, {
      actorId: cupid.id,
      type: "cupid",
      targetId: a.id,
      target2Id: b.id,
    });
    recordNightAction(state, { actorId: wolf.id, type: "wolfKill", targetId: a.id, target2Id: null });
    resolveNight(state);
    assert.equal(a.inLove, true);
    assert.equal(b.inLove, true);
    assert.equal(a.isAlive, false);
    assert.equal(b.isAlive, false);
    assert.equal(b.deathCause, "loverSorrow");
  });
});

describe("invalid night action", () => {
  it("cannot target packmates", () => {
    const state = table([
      "werewolf",
      "werewolf",
      "seer",
      "guardianAngel",
      "hunter",
      "fool",
      "villager",
      "villager",
      "villager",
      "villager",
    ]);
    const wolves = state.players.filter((p) => p.roleId === "werewolf");
    state.phase = "night";
    const err = recordNightAction(state, {
      actorId: wolves[0]!.id,
      type: "wolfKill",
      targetId: wolves[1]!.id,
      target2Id: null,
    });
    assert.ok(err);
  });
});

void applyEngineAction;
