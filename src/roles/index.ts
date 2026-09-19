import type {
  Faction,
  GameState,
  PlayerState,
  RoleId,
} from "@/game/types.ts";

export type NightActionKind =
  | "none"
  | "wolfKill"
  | "protect"
  | "see"
  | "skKill"
  | "convert"
  | "cupid";

export interface RoleDefinition {
  id: RoleId;
  displayName: string;
  emoji: string;
  faction: Faction;
  description: string;
  winCondition: string;
  nightAction: NightActionKind;
  dayAction: "none" | "vote" | "hunterShot";
  passiveAbilities: string[];
  knowledgeRules: string[];
  targetRules: string;
  /** Lower numbers act earlier when collecting. Resolution uses a dedicated pipeline. */
  priority: number;
  deathBehavior: string;
  appearsAsToSelf: RoleId;
  maxPerGame: number | null;
  unique: boolean;
  canBeConvertedByCult: boolean;
  seerSeesAs: RoleId;
}

export const ROLES: Record<RoleId, RoleDefinition> = {
  villager: {
    id: "villager",
    displayName: "Villager",
    emoji: "👱",
    faction: "village",
    description:
      "A regular villager. You have no night ability. Talk, listen, and vote with the village to find the wolves.",
    winCondition: "Village wins when no Werewolves, Serial Killer, or Cultists remain.",
    nightAction: "none",
    dayAction: "vote",
    passiveAbilities: [],
    knowledgeRules: ["You know only public information."],
    targetRules: "No night target.",
    priority: 100,
    deathBehavior: "Standard death.",
    appearsAsToSelf: "villager",
    maxPerGame: null,
    unique: false,
    canBeConvertedByCult: true,
    seerSeesAs: "villager",
  },
  werewolf: {
    id: "werewolf",
    displayName: "Werewolf",
    emoji: "🐺",
    faction: "wolf",
    description:
      "Each night the wolf pack chooses one player to kill. During the day you must blend in with the village.",
    winCondition:
      "Werewolves win when they are equal to or greater than the number of remaining non-wolf players, and no Serial Killer is still alive.",
    nightAction: "wolfKill",
    dayAction: "vote",
    passiveAbilities: [
      "Knows the other living Werewolves.",
      "Pack shares a single kill.",
    ],
    knowledgeRules: [
      "You know who the other Werewolves are.",
      "You do not know hidden village roles.",
    ],
    targetRules:
      "Must target a living non-wolf player. Cannot target packmates.",
    priority: 30,
    deathBehavior: "Standard death. Remaining wolves continue the pack kill.",
    appearsAsToSelf: "werewolf",
    maxPerGame: 5,
    unique: false,
    canBeConvertedByCult: false,
    seerSeesAs: "werewolf",
  },
  seer: {
    id: "seer",
    displayName: "Seer",
    emoji: "👳",
    faction: "village",
    description:
      "Each night you may investigate one living player and learn their true role.",
    winCondition: "Village win condition.",
    nightAction: "see",
    dayAction: "vote",
    passiveAbilities: [],
    knowledgeRules: [
      "You learn the true role of each player you investigate.",
      "You are not told if a Fool exists.",
    ],
    targetRules: "Any living player except yourself.",
    priority: 60,
    deathBehavior: "Standard death.",
    appearsAsToSelf: "seer",
    maxPerGame: 1,
    unique: true,
    canBeConvertedByCult: true,
    seerSeesAs: "seer",
  },
  guardianAngel: {
    id: "guardianAngel",
    displayName: "Guardian Angel",
    emoji: "👼",
    faction: "village",
    description:
      "Each night you may watch over one player. If they are attacked, they survive. If you watch a Werewolf there is a 50% chance you die. If you watch the Serial Killer, you die.",
    winCondition: "Village win condition.",
    nightAction: "protect",
    dayAction: "vote",
    passiveAbilities: [
      "Protected player cannot be killed by wolves or the Serial Killer that night.",
    ],
    knowledgeRules: [
      "You are not told whether an attack was blocked.",
      "You do not learn the role of your target unless you die visiting them.",
    ],
    targetRules:
      "Any living player except yourself. You may protect the same person on consecutive nights.",
    priority: 20,
    deathBehavior:
      "May die while guarding a wolf (50%) or the Serial Killer (100%).",
    appearsAsToSelf: "guardianAngel",
    maxPerGame: 1,
    unique: true,
    canBeConvertedByCult: true,
    seerSeesAs: "guardianAngel",
  },
  hunter: {
    id: "hunter",
    displayName: "Hunter",
    emoji: "🎯",
    faction: "village",
    description:
      "A paranoid sharpshooter. If you are lynched you may shoot one player before you die. If wolves eat you, you have a chance to take a wolf down with you but you do not get a aimed shot.",
    winCondition: "Village win condition.",
    nightAction: "none",
    dayAction: "hunterShot",
    passiveAbilities: [
      "On lynch: choose one living player to shoot.",
      "On wolf eat: 30% chance + 20% per extra attacking wolf to kill a random wolf. You still die.",
    ],
    knowledgeRules: ["You know only public information until you die."],
    targetRules: "Death shot: any other living player.",
    priority: 90,
    deathBehavior:
      "Lynch → aimed shot. Eaten → possible random wolf kill, no aimed shot.",
    appearsAsToSelf: "hunter",
    maxPerGame: 1,
    unique: true,
    canBeConvertedByCult: true,
    seerSeesAs: "hunter",
  },
  tanner: {
    id: "tanner",
    displayName: "Tanner",
    emoji: "👺",
    faction: "tanner",
    description:
      "You hate your job. Your only goal is to be lynched by the village. If you are executed during the day, you win and everyone else loses.",
    winCondition: "Win if and only if you are lynched. Dying at night is a loss.",
    nightAction: "none",
    dayAction: "vote",
    passiveAbilities: ["Game ends immediately on a successful Tanner lynch."],
    knowledgeRules: ["You know you are the Tanner."],
    targetRules: "No night target.",
    priority: 100,
    deathBehavior: "Lynch is a win. Any other death is a loss for the Tanner.",
    appearsAsToSelf: "tanner",
    maxPerGame: 1,
    unique: true,
    canBeConvertedByCult: true,
    seerSeesAs: "tanner",
  },
  fool: {
    id: "fool",
    displayName: "Fool",
    emoji: "🃏",
    faction: "village",
    description:
      "You are told that you are the Seer. When you investigate, you are shown a random role — not the target's real role.",
    winCondition: "Village win condition. You still win with the village.",
    nightAction: "see",
    dayAction: "vote",
    passiveAbilities: [
      "Sees a random role from the current game's role pool.",
      "Is never told they are the Fool.",
    ],
    knowledgeRules: [
      "Private view reports role as Seer.",
      "Investigation results are fabricated by the engine.",
    ],
    targetRules: "Any living player except yourself.",
    priority: 61,
    deathBehavior: "Standard death.",
    appearsAsToSelf: "seer",
    maxPerGame: 1,
    unique: true,
    canBeConvertedByCult: true,
    seerSeesAs: "fool",
  },
  cultist: {
    id: "cultist",
    displayName: "Cultist",
    emoji: "👤",
    faction: "cult",
    description:
      "Each night you may convert one non-wolf, non-Serial-Killer player to the Cult. If every living player is a Cultist, the Cult wins.",
    winCondition: "All living players are Cultists.",
    nightAction: "convert",
    dayAction: "vote",
    passiveAbilities: [
      "Knows other Cultists.",
      "Converted players join the Cult faction and lose their previous win condition.",
    ],
    knowledgeRules: ["You know who the other Cultists are."],
    targetRules:
      "Living non-cult, non-wolf, non-Serial-Killer players. Hunter resists 50%.",
    priority: 50,
    deathBehavior: "Standard death.",
    appearsAsToSelf: "cultist",
    maxPerGame: 3,
    unique: false,
    canBeConvertedByCult: false,
    seerSeesAs: "cultist",
  },
  serialKiller: {
    id: "serialKiller",
    displayName: "Serial Killer",
    emoji: "🔪",
    faction: "serialKiller",
    description:
      "A lone killer. Each night you murder one player. You can kill anyone, including wolves. If wolves attack you, there is a 20% chance you are eaten and an 80% chance you kill a random attacking wolf and live. You win if you are the last player alive (lovers excepted).",
    winCondition:
      "Be the last living player, or the last living player besides a lover pair you belong to — lovers take priority if all remaining players are in love.",
    nightAction: "skKill",
    dayAction: "vote",
    passiveAbilities: [
      "Immune-ish to wolves: 80% chance to kill a wolf visitor instead of dying.",
      "Guardian Angel watching you dies.",
    ],
    knowledgeRules: ["You know you are the Serial Killer. You have no allies."],
    targetRules: "Any living player except yourself.",
    priority: 40,
    deathBehavior: "Can die to lynch, hunter, or unlucky wolf attack (20%).",
    appearsAsToSelf: "serialKiller",
    maxPerGame: 1,
    unique: true,
    canBeConvertedByCult: false,
    seerSeesAs: "serialKiller",
  },
  cupid: {
    id: "cupid",
    displayName: "Cupid",
    emoji: "🏹",
    faction: "village",
    description:
      "On night 1 you choose two players (you may include yourself). They fall in love. Lovers know each other but not their roles. If one dies, the other dies of sorrow. If the only remaining living players are the lovers, they win as Lovers regardless of their original teams.",
    winCondition:
      "Village win if the lovers are not the last two standing; Lovers win if every living player is in love.",
    nightAction: "cupid",
    dayAction: "vote",
    passiveAbilities: ["Pairs two players on night 1 only."],
    knowledgeRules: [
      "Cupid knows who the lovers are.",
      "Lovers know each other but not roles.",
    ],
    targetRules: "Two distinct living players on night 1. May include Cupid.",
    priority: 10,
    deathBehavior: "Standard death. Lovers persist after Cupid dies.",
    appearsAsToSelf: "cupid",
    maxPerGame: 1,
    unique: true,
    canBeConvertedByCult: true,
    seerSeesAs: "cupid",
  },
};

export const ROLE_LIST: RoleDefinition[] = Object.values(ROLES);

export function getRole(id: RoleId): RoleDefinition {
  const role = ROLES[id];
  if (!role) throw new Error(`Unknown role: ${id}`);
  return role;
}

export function factionFor(id: RoleId): Faction {
  return getRole(id).faction;
}

export function nightActionKind(id: RoleId): NightActionKind {
  return getRole(id).nightAction;
}

export function shownRoleFor(player: PlayerState): RoleId {
  return getRole(player.roleId).appearsAsToSelf;
}

export function livingPlayers(state: GameState): PlayerState[] {
  return state.players.filter((p) => p.isAlive && !p.isFled);
}

export function playersByRole(state: GameState, role: RoleId): PlayerState[] {
  return state.players.filter((p) => p.isAlive && p.roleId === role);
}

export function isWolf(player: PlayerState): boolean {
  return player.roleId === "werewolf" && !player.convertedToCult;
}

export function isCultist(player: PlayerState): boolean {
  return player.roleId === "cultist" || player.convertedToCult;
}

export function roleLabel(id: RoleId): string {
  const r = getRole(id);
  return `${r.emoji} ${r.displayName}`;
}

export function needsNightAction(player: PlayerState, night: number): boolean {
  if (!player.isAlive) return false;
  const kind = nightActionKind(player.roleId);
  if (kind === "none") return false;
  if (kind === "cupid") return night === 1 && !player.hasUsedNightAction;
  if (player.roleId === "werewolf") return true;
  return true;
}

export function validNightTargets(
  state: GameState,
  actor: PlayerState,
): string[] {
  const kind = nightActionKind(actor.roleId);
  const living = livingPlayers(state);
  switch (kind) {
    case "none":
      return [];
    case "wolfKill":
      return living.filter((p) => p.id !== actor.id && !isWolf(p)).map((p) => p.id);
    case "protect":
      return living.filter((p) => p.id !== actor.id).map((p) => p.id);
    case "see":
      return living.filter((p) => p.id !== actor.id).map((p) => p.id);
    case "skKill":
      return living.filter((p) => p.id !== actor.id).map((p) => p.id);
    case "convert":
      return living
        .filter(
          (p) =>
            p.id !== actor.id &&
            !isCultist(p) &&
            !isWolf(p) &&
            p.roleId !== "serialKiller",
        )
        .map((p) => p.id);
    case "cupid":
      return living.map((p) => p.id);
    default:
      return [];
  }
}

export function validVoteTargets(state: GameState, actorId: string): string[] {
  return livingPlayers(state)
    .filter((p) => p.id !== actorId)
    .map((p) => p.id);
}

export function validHunterTargets(state: GameState, hunterId: string): string[] {
  return livingPlayers(state)
    .filter((p) => p.id !== hunterId)
    .map((p) => p.id);
}
