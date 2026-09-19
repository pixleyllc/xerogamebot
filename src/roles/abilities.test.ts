import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { ROLES, getRole, needsNightAction, shownRoleFor } from "@/roles/index.ts";
import type { PlayerState } from "@/game/types.ts";

describe("role registry", () => {
  it("every role has required fields", () => {
    for (const role of Object.values(ROLES)) {
      assert.ok(role.id);
      assert.ok(role.displayName);
      assert.ok(role.emoji);
      assert.ok(role.faction);
      assert.ok(role.description.length > 20);
      assert.ok(role.winCondition.length > 10);
    }
  });

  it("fool appears as seer", () => {
    const fool = {
      roleId: "fool",
    } as PlayerState;
    assert.equal(shownRoleFor(fool), "seer");
    assert.equal(getRole("fool").appearsAsToSelf, "seer");
  });

  it("cupid only acts on night 1", () => {
    const cupid = { roleId: "cupid", isAlive: true, hasUsedNightAction: false } as PlayerState;
    assert.equal(needsNightAction(cupid, 1), true);
    assert.equal(needsNightAction(cupid, 2), false);
  });

  it("werewolves cannot be converted", () => {
    assert.equal(getRole("werewolf").canBeConvertedByCult, false);
    assert.equal(getRole("serialKiller").canBeConvertedByCult, false);
    assert.equal(getRole("villager").canBeConvertedByCult, true);
  });
});
