import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { assignRoles, classicRoles, createGame, validateRoleDistribution, wolfCountFor } from "@/game/setup.ts";
import { createRng } from "@/game/rng.ts";
import { PLAYER_COUNTS, type PlayerCount, type RoleId } from "@/game/types.ts";

describe("role assignment", () => {
  it("uses the upstream wolf-count formula", () => {
    assert.equal(wolfCountFor(8), 1);
    assert.equal(wolfCountFor(9), 1);
    assert.equal(wolfCountFor(10), 2);
    assert.equal(wolfCountFor(14), 2);
    assert.equal(wolfCountFor(15), 3);
  });

  for (const n of PLAYER_COUNTS) {
    it(`classic ${n} is a legal table`, () => {
      const roles = classicRoles(n as PlayerCount);
      assert.equal(roles.length, n);
      assert.equal(validateRoleDistribution(roles, "classic").length, 0);
      assert.equal(roles.filter((r) => r === "werewolf").length, wolfCountFor(n));
    });
  }

  it("shuffles without losing the wolf count", () => {
    const rng = createRng("seed-a");
    const a = assignRoles(10, "classic", rng);
    assert.equal(a.length, 10);
    assert.equal(a.filter((r) => r === "werewolf").length, wolfCountFor(10));
    assert.equal(validateRoleDistribution(a, "classic").length, 0);
    assert.ok(a.includes("seer"));
  });

  it("chaos always validates", () => {
    for (let i = 0; i < 20; i++) {
      const rng = createRng(`chaos-${i}`);
      const roles = assignRoles(12, "chaos", rng);
      assert.equal(validateRoleDistribution(roles, "chaos").length, 0);
    }
  });

  it("rejects an immediate wolf majority", () => {
    const bad: RoleId[] = [
      "werewolf",
      "werewolf",
      "werewolf",
      "werewolf",
      "villager",
      "villager",
      "villager",
      "villager",
    ];
    const issues = validateRoleDistribution(bad, "classic");
    assert.ok(issues.some((i) => i.code === "wolfMajority" || i.code === "immediateWolfWin"));
  });

  it("createGame deals unique NPC names and memories", () => {
    const g = createGame({ playerCount: 10, seed: "names", humanName: "Zack" });
    assert.equal(g.players.length, 10);
    assert.equal(g.players[0]?.isHuman, true);
    const names = new Set(g.players.map((p) => p.name));
    assert.equal(names.size, 10);
    assert.equal(Object.keys(g.memories).length, 10);
  });
});
