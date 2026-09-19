import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createGame } from "@/game/setup.ts";
import { startGame } from "@/game/engine.ts";
import { assertNoLeak, buildPrivateView } from "@/game/isolation.ts";
import type { RoleId } from "@/game/types.ts";

const FORCED: RoleId[] = [
  "seer",
  "werewolf",
  "werewolf",
  "guardianAngel",
  "hunter",
  "fool",
  "villager",
  "villager",
  "villager",
  "villager",
];

describe("information isolation", () => {
  it("seer does not see other hidden roles", () => {
    const state = startGame(createGame({ playerCount: 10, forcedRoles: FORCED, seed: "iso" })).state;
    const seer = state.players.find((p) => p.roleId === "seer")!;
    const view = buildPrivateView(state, seer.id);
    assertNoLeak(view, state);
    const wolfIds = state.players.filter((p) => p.roleId === "werewolf").map((p) => p.id);
    for (const id of wolfIds) {
      const info = view.players.find((p) => p.id === id)!;
      assert.equal(info.knownAllyRoleId, null);
      assert.equal(info.revealedRoleId, null);
    }
  });

  it("wolves know packmates only", () => {
    const state = startGame(createGame({ playerCount: 10, forcedRoles: FORCED, seed: "iso2" })).state;
    const wolf = state.players.find((p) => p.roleId === "werewolf")!;
    const view = buildPrivateView(state, wolf.id);
    assertNoLeak(view, state);
    assert.ok(view.packMates.length >= 1);
    const seer = state.players.find((p) => p.roleId === "seer")!;
    const seerInfo = view.players.find((p) => p.id === seer.id)!;
    assert.equal(seerInfo.knownAllyRoleId, null);
  });

  it("fool is shown as seer to themselves", () => {
    const state = startGame(createGame({ playerCount: 10, forcedRoles: FORCED, seed: "iso3" })).state;
    const fool = state.players.find((p) => p.roleId === "fool")!;
    const view = buildPrivateView(state, fool.id);
    assert.equal(view.shownRoleId, "seer");
    assert.equal(view.trueRoleKnown, false);
    const seer = state.players.find((p) => p.roleId === "seer")!;
    const other = buildPrivateView(state, seer.id);
    const foolPublic = other.players.find((p) => p.id === fool.id)!;
    assert.equal(foolPublic.knownAllyRoleId, null);
  });

  it("private whispers are not in another player's view", () => {
    const state = startGame(createGame({ playerCount: 10, forcedRoles: FORCED, seed: "iso4" })).state;
    const seer = state.players.find((p) => p.roleId === "seer")!;
    const wolf = state.players.find((p) => p.roleId === "werewolf")!;
    const view = buildPrivateView(state, wolf.id);
    assert.ok(
      view.recentChat.every(
        (m) => m.privateToPlayerId == null || m.privateToPlayerId === wolf.id,
      ),
    );
    const seerView = buildPrivateView(state, seer.id);
    assert.ok(seerView.recentChat.some((m) => m.privateToPlayerId === seer.id || m.kind === "whisper" || m.kind === "moderator"));
  });
});
