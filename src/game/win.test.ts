import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createGame } from "@/game/setup.ts";
import { startGame } from "@/game/engine.ts";
import { checkWin, tannerWin } from "@/game/win.ts";
import { executeLynch } from "@/game/voting.ts";
import type { RoleId } from "@/game/types.ts";

function dealt(forced: RoleId[]) {
  return startGame(
    createGame({
      playerCount: forced.length as 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15,
      forcedRoles: forced,
      seed: "win",
    }),
  ).state;
}

describe("win conditions", () => {
  it("village wins when wolves, SK, and cult are gone", () => {
    const state = dealt([
      "villager",
      "seer",
      "guardianAngel",
      "hunter",
      "werewolf",
      "villager",
      "villager",
      "villager",
    ]);
    const wolf = state.players.find((p) => p.roleId === "werewolf")!;
    wolf.isAlive = false;
    const win = checkWin(state);
    assert.equal(win?.faction, "village");
  });

  it("wolves win when they equal remaining non-wolves", () => {
    const state = dealt([
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
    for (const p of state.players) {
      if (p.roleId !== "werewolf" && p.roleId !== "seer" && p.roleId !== "hunter") {
        p.isAlive = false;
      }
    }
    const wolves = state.players.filter((p) => p.roleId === "werewolf" && p.isAlive);
    const others = state.players.filter((p) => p.isAlive && p.roleId !== "werewolf");
    assert.equal(wolves.length, 2);
    assert.equal(others.length, 2);
    const win = checkWin(state);
    assert.equal(win?.faction, "wolf");
  });

  it("tanner wins on lynch", () => {
    const state = dealt([
      "tanner",
      "werewolf",
      "seer",
      "guardianAngel",
      "hunter",
      "villager",
      "villager",
      "villager",
      "villager",
      "villager",
      "villager",
    ]);
    const tanner = state.players.find((p) => p.roleId === "tanner")!;
    executeLynch(state, tanner);
    const win = tannerWin(state, tanner);
    assert.equal(win.faction, "tanner");
    assert.deepEqual(win.playerIds, [tanner.id]);
  });

  it("serial killer wins last standing", () => {
    const state = dealt([
      "serialKiller",
      "werewolf",
      "seer",
      "guardianAngel",
      "hunter",
      "tanner",
      "villager",
      "villager",
      "villager",
      "villager",
      "villager",
      "villager",
      "villager",
    ]);
    for (const p of state.players) {
      if (p.roleId !== "serialKiller") p.isAlive = false;
    }
    const win = checkWin(state);
    assert.equal(win?.faction, "serialKiller");
  });

  it("cult wins when all living are cultists", () => {
    const state = dealt([
      "cultist",
      "werewolf",
      "werewolf",
      "seer",
      "guardianAngel",
      "hunter",
      "fool",
      "cupid",
      "villager",
      "villager",
      "villager",
      "villager",
      "villager",
      "villager",
      "villager",
    ]);
    for (const p of state.players) {
      if (p.roleId !== "cultist") p.isAlive = false;
    }
    const win = checkWin(state);
    assert.equal(win?.faction, "cult");
  });

  it("lovers win when only they remain", () => {
    const state = dealt([
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
    ]);
    const a = state.players.find((p) => p.roleId === "seer")!;
    const b = state.players.find((p) => p.roleId === "hunter")!;
    a.inLove = true;
    b.inLove = true;
    a.loverId = b.id;
    b.loverId = a.id;
    for (const p of state.players) {
      if (p.id !== a.id && p.id !== b.id) p.isAlive = false;
    }
    const win = checkWin(state);
    assert.equal(win?.faction, "lovers");
  });

  it("SK does not auto-win 1v1 versus a villager", () => {
    const state = dealt([
      "serialKiller",
      "werewolf",
      "seer",
      "guardianAngel",
      "hunter",
      "tanner",
      "villager",
      "villager",
      "villager",
      "villager",
      "villager",
      "villager",
      "villager",
    ]);
    for (const p of state.players) {
      if (p.roleId !== "serialKiller" && p.roleId !== "seer") p.isAlive = false;
    }
    assert.equal(checkWin(state), null);
  });
});
