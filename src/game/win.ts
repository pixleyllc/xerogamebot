import { livingPlayers } from "@/roles/index.ts";
import type { Faction, GameState, PlayerState, WinnerInfo } from "@/game/types.ts";

function isWolf(p: PlayerState): boolean {
  return p.roleId === "werewolf" && !p.convertedToCult;
}
function isCult(p: PlayerState): boolean {
  return p.roleId === "cultist" || p.convertedToCult;
}
function isSk(p: PlayerState): boolean {
  return p.roleId === "serialKiller" && !p.convertedToCult;
}

/**
 * Win-check order follows GreyWolfDev/Werewolf CheckForGameEnd:
 * lovers (all living are in love) → cult (all living cult) → wolves outnumber
 * (no SK remaining) → SK last standing → village (no wolf/SK/cult).
 * Tanner is handled at lynch time, not here.
 */
export function checkWin(state: GameState): WinnerInfo | null {
  const alive = livingPlayers(state);
  if (alive.length === 0) {
    return {
      faction: "noOne",
      playerIds: [],
      summary: "Nobody remains. The village is silent.",
    };
  }

  if (alive.length >= 1 && alive.every((p) => p.inLove)) {
    return {
      faction: "lovers",
      playerIds: alive.map((p) => p.id),
      summary: "Only the lovers remain. Love outlasts the village.",
    };
  }

  if (alive.every(isCult)) {
    return {
      faction: "cult",
      playerIds: alive.map((p) => p.id),
      summary: "The Cult has converted everyone who still lives.",
    };
  }

  const wolves = alive.filter(isWolf);
  const sk = alive.filter(isSk);
  const nonWolves = alive.filter((p) => !isWolf(p));

  if (wolves.length > 0 && sk.length === 0 && wolves.length >= nonWolves.length) {
    return {
      faction: "wolf",
      playerIds: wolves.map((p) => p.id),
      summary: "The werewolves equal or outnumber the village.",
    };
  }

  if (sk.length > 0 && wolves.length === 0 && sk.length === alive.length) {
    return {
      faction: "serialKiller",
      playerIds: sk.map((p) => p.id),
      summary: "The Serial Killer is the last one standing.",
    };
  }

  const cultLeft = alive.some(isCult);
  if (wolves.length === 0 && sk.length === 0 && !cultLeft) {
    const village = alive.filter((p) => p.faction === "village" || p.roleId === "fool" || p.roleId === "cupid");
    return {
      faction: "village",
      playerIds: village.map((p) => p.id),
      summary: "The threats are gone. The village survives.",
    };
  }

  return null;
}

export function tannerWin(state: GameState, tanner: PlayerState): WinnerInfo {
  return {
    faction: "tanner",
    playerIds: [tanner.id],
    summary: `${tanner.name} the Tanner was lynched and wins. Everyone else loses.`,
  };
}

export function winnersForFaction(state: GameState, faction: Faction): string[] {
  if (faction === "lovers") {
    return state.players.filter((p) => p.inLove).map((p) => p.id);
  }
  if (faction === "tanner") {
    return state.players.filter((p) => p.roleId === "tanner").map((p) => p.id);
  }
  if (faction === "wolf") {
    return state.players.filter((p) => p.originalRoleId === "werewolf").map((p) => p.id);
  }
  if (faction === "cult") {
    return state.players
      .filter((p) => p.roleId === "cultist" || p.convertedToCult)
      .map((p) => p.id);
  }
  if (faction === "serialKiller") {
    return state.players.filter((p) => p.roleId === "serialKiller").map((p) => p.id);
  }
  if (faction === "village") {
    return state.players
      .filter(
        (p) =>
          (p.faction === "village" || p.roleId === "fool" || p.roleId === "cupid") &&
          !p.convertedToCult,
      )
      .map((p) => p.id);
  }
  return [];
}
