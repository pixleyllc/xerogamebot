import { createRng, freshEntropySeed, type Rng } from "@/game/rng.ts";
import { randomId } from "@/game/ids.ts";
import { generatePersonality, HUMAN_DEFAULT_NAME, pickNpcNames } from "@/game/names.ts";
import { emptyMemory, seedNpcMinds } from "@/ai/memory.ts";
import { factionFor, getRole } from "@/roles/index.ts";
import {
  DEFAULT_SETTINGS,
  HUMAN_ID,
  PLAYER_COUNTS,
  type GameMode,
  type GameSettings,
  type GameState,
  type NpcMemory,
  type PlayerCount,
  type PlayerState,
  type RoleId,
} from "@/game/types.ts";

export interface CreateGameOptions {
  humanName?: string;
  humanTelegramId?: number | null;
  playerCount?: PlayerCount;
  mode?: GameMode;
  seed?: string;
  settings?: Partial<GameSettings>;
  /** Test-only: assign these roles in player order (human first). */
  forcedRoles?: RoleId[];
  forcedNpcNames?: string[];
}

const CLASSIC_TABLE: Record<PlayerCount, RoleId[]> = {
  8: [
    "werewolf",
    "seer",
    "guardianAngel",
    "hunter",
    "villager",
    "villager",
    "villager",
    "villager",
  ],
  9: [
    "werewolf",
    "seer",
    "guardianAngel",
    "hunter",
    "fool",
    "villager",
    "villager",
    "villager",
    "villager",
  ],
  10: [
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
  ],
  11: [
    "werewolf",
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
  ],
  12: [
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
  ],
  13: [
    "werewolf",
    "werewolf",
    "seer",
    "guardianAngel",
    "hunter",
    "serialKiller",
    "tanner",
    "villager",
    "villager",
    "villager",
    "villager",
    "villager",
    "villager",
  ],
  14: [
    "werewolf",
    "werewolf",
    "seer",
    "guardianAngel",
    "hunter",
    "fool",
    "cupid",
    "tanner",
    "villager",
    "villager",
    "villager",
    "villager",
    "villager",
    "villager",
  ],
  15: [
    "werewolf",
    "werewolf",
    "werewolf",
    "seer",
    "guardianAngel",
    "hunter",
    "fool",
    "cupid",
    "cultist",
    "villager",
    "villager",
    "villager",
    "villager",
    "villager",
    "villager",
  ],
};

export function wolfCountFor(playerCount: number): number {
  return Math.min(Math.max(Math.floor(playerCount / 5), 1), 5);
}

export function classicRoles(playerCount: PlayerCount): RoleId[] {
  const roles = CLASSIC_TABLE[playerCount];
  if (!roles || roles.length !== playerCount) {
    throw new Error(`No classic table for ${playerCount} players`);
  }
  return roles.slice();
}

function chaosRoles(playerCount: PlayerCount, rng: Rng): RoleId[] {
  let wolves = wolfCountFor(playerCount);
  if (rng.chance(30) && wolves > 1) wolves -= 1;
  else if (rng.chance(24) && wolves < Math.min(4, Math.floor(playerCount / 3)) && playerCount >= 10) {
    wolves += 1;
  }
  const roles: RoleId[] = Array.from({ length: wolves }, () => "werewolf");
  const remaining = playerCount - wolves;

  const required: RoleId[] = ["seer"];
  const optionalPool: RoleId[] = [
    "guardianAngel",
    "hunter",
    "fool",
    "tanner",
    "cupid",
  ];
  if (playerCount >= 10) optionalPool.push("serialKiller");
  if (playerCount >= 11) optionalPool.push("cultist");
  if (playerCount >= 13 && rng.chance(45)) optionalPool.push("cultist");
  if (rng.chance(18)) optionalPool.push("hunter");
  if (rng.chance(18)) optionalPool.push("tanner");

  const shuffledOptional = rng.shuffle(optionalPool);
  const specials: RoleId[] = [...required];
  const specialBudget = Math.min(
    remaining - 2,
    1 + rng.intInclusive(1, Math.max(2, Math.floor(playerCount / 3))),
  );
  for (const role of shuffledOptional) {
    if (specials.length >= specialBudget) break;
    if (specials.includes(role) && getRole(role).unique) continue;
    specials.push(role);
  }

  while (specials.length > remaining - 2) specials.pop();
  roles.push(...specials);
  while (roles.length < playerCount) roles.push("villager");
  if (roles.length > playerCount) roles.length = playerCount;
  return roles;
}

/** Classic tables stay legal, but 0–3 villagers can become unused specials. */
function spiceClassicRoles(playerCount: PlayerCount, rng: Rng): RoleId[] {
  const roles = classicRoles(playerCount);
  const present = new Set(roles);
  const extras: RoleId[] = ["tanner", "fool", "cupid", "hunter", "guardianAngel"];
  if (playerCount >= 10) extras.push("serialKiller");
  if (playerCount >= 12) extras.push("cultist");
  const unused = rng.shuffle(extras.filter((r) => !present.has(r)));
  const swaps = rng.intInclusive(0, Math.min(3, unused.length));
  let extraIdx = 0;
  for (let s = 0; s < swaps; s++) {
    const villagerIdx = roles.findIndex((r) => r === "villager");
    if (villagerIdx < 0 || extraIdx >= unused.length) break;
    const candidate = roles.slice();
    candidate[villagerIdx] = unused[extraIdx++]!;
    if (validateRoleDistribution(candidate, "classic").length === 0) {
      roles[villagerIdx] = candidate[villagerIdx]!;
    }
  }
  return roles;
}

export interface SetupIssue {
  code: string;
  message: string;
}

export function validateRoleDistribution(
  roles: RoleId[],
  mode: GameMode,
): SetupIssue[] {
  const issues: SetupIssue[] = [];
  const n = roles.length;
  if (!PLAYER_COUNTS.includes(n as PlayerCount)) {
    issues.push({
      code: "count",
      message: `Player count ${n} is not supported. Use 8–15.`,
    });
  }

  const counts = new Map<RoleId, number>();
  for (const r of roles) counts.set(r, (counts.get(r) ?? 0) + 1);

  for (const [role, count] of counts) {
    const def = getRole(role);
    if (def.unique && count > 1) {
      issues.push({
        code: "unique",
        message: `${def.displayName} is unique but assigned ${count} times.`,
      });
    }
    if (def.maxPerGame != null && count > def.maxPerGame) {
      issues.push({
        code: "max",
        message: `${def.displayName} exceeds max ${def.maxPerGame}.`,
      });
    }
  }

  const wolfN = counts.get("werewolf") ?? 0;
  const skN = counts.get("serialKiller") ?? 0;
  const cultN = counts.get("cultist") ?? 0;
  const villageN = roles.filter((r) => getRole(r).faction === "village").length;
  const tannerN = counts.get("tanner") ?? 0;

  if (wolfN < 1) {
    issues.push({ code: "wolves", message: "Need at least one Werewolf." });
  }
  if (villageN < 2) {
    issues.push({
      code: "village",
      message: "Need at least two village-aligned players.",
    });
  }
  if (wolfN >= n / 2 && mode === "classic") {
    issues.push({
      code: "wolfMajority",
      message: "Classic games cannot start with wolves at or above half the table.",
    });
  }
  if (wolfN >= villageN + skN + cultN + tannerN) {
    issues.push({
      code: "immediateWolfWin",
      message: "Wolves would win before night 1.",
    });
  }
  if (skN > 0 && n === wolfN + skN) {
    issues.push({
      code: "immediateSk",
      message: "Serial Killer / wolf-only tables are illegal.",
    });
  }
  if (cultN > 0 && n - cultN - wolfN - skN < 1) {
    issues.push({
      code: "cult",
      message: "Cult has no legal conversion targets.",
    });
  }
  if ((counts.get("fool") ?? 0) > 0 && (counts.get("seer") ?? 0) === 0) {
    issues.push({
      code: "fool",
      message: "Fool requires a real Seer in the same game so the village has a true investigative role.",
    });
  }
  return issues;
}

export function assignRoles(
  playerCount: PlayerCount,
  mode: GameMode,
  rng: Rng,
  forced?: RoleId[],
): RoleId[] {
  if (forced) {
    if (forced.length !== playerCount) {
      throw new Error(
        `forcedRoles length ${forced.length} != playerCount ${playerCount}`,
      );
    }
    const issues = validateRoleDistribution(forced, mode);
    if (issues.length) {
      throw new Error(issues.map((i) => i.message).join(" "));
    }
    return forced.slice();
  }

  if (mode === "classic") {
    const roles = spiceClassicRoles(playerCount, rng);
    const issues = validateRoleDistribution(roles, mode);
    if (issues.length) {
      const fallback = classicRoles(playerCount);
      return rng.shuffle(fallback);
    }
    return rng.shuffle(roles);
  }

  for (let attempt = 0; attempt < 80; attempt++) {
    const roles = rng.shuffle(chaosRoles(playerCount, rng));
    const issues = validateRoleDistribution(roles, mode);
    if (issues.length === 0) return roles;
  }
  throw new Error("Unable to generate a legal Chaos role distribution.");
}

function makePlayer(
  id: string,
  name: string,
  isHuman: boolean,
  roleId: RoleId,
  personality: ReturnType<typeof generatePersonality>,
  telegramUserId: number | null,
): PlayerState {
  return {
    id,
    name,
    isHuman,
    isAlive: true,
    isFled: false,
    roleId,
    originalRoleId: roleId,
    faction: factionFor(roleId),
    personality,
    telegramUserId,
    inLove: false,
    loverId: null,
    hasUsedNightAction: false,
    nightTargetId: null,
    nightTarget2Id: null,
    voteTargetId: null,
    votesReceived: 0,
    diedAtDay: null,
    diedAtNight: null,
    deathCause: null,
    killedByPlayerId: null,
    wasSavedLastNight: false,
    investigations: [],
    convertedToCult: false,
    hunterHasShot: false,
    lastProtectedId: null,
  };
}

export function createGame(options: CreateGameOptions = {}): GameState {
  const playerCount = (options.playerCount ?? 10) as PlayerCount;
  if (!PLAYER_COUNTS.includes(playerCount)) {
    throw new Error(`Unsupported player count ${playerCount}`);
  }
  const mode = options.mode ?? "classic";
  const seeded = options.seed != null;
  const seed = options.seed ?? freshEntropySeed();
  const rng = createRng(seed);
  if (!seeded) rng.mixEntropy();
  const settings: GameSettings = {
    ...DEFAULT_SETTINGS,
    ...options.settings,
    mode,
    playerCount,
  };

  const roles = assignRoles(playerCount, mode, rng, options.forcedRoles);
  if (!options.forcedRoles) {
    const reshuffled = rng.shuffle(roles);
    roles.length = 0;
    roles.push(...reshuffled);
  }
  const humanName = (options.humanName ?? HUMAN_DEFAULT_NAME).trim() || HUMAN_DEFAULT_NAME;
  const npcNames =
    options.forcedNpcNames ?? pickNpcNames(playerCount - 1, rng, humanName);
  if (npcNames.length !== playerCount - 1) {
    throw new Error("NPC name count mismatch");
  }

  const takenMinds = new Set<string>();
  const players: PlayerState[] = [];
  players.push(
    makePlayer(
      HUMAN_ID,
      humanName,
      true,
      roles[0] as RoleId,
      generatePersonality(humanName, rng, takenMinds),
      options.humanTelegramId ?? null,
    ),
  );
  for (let i = 0; i < npcNames.length; i++) {
    const name = npcNames[i] as string;
    players.push(
      makePlayer(
        `npc-${i + 1}`,
        name,
        false,
        roles[i + 1] as RoleId,
        generatePersonality(name, rng, takenMinds),
        null,
      ),
    );
  }

  const memories: Record<string, NpcMemory> = {};
  for (const p of players) {
    memories[p.id] = emptyMemory(
      p.id,
      players.filter((o) => o.id !== p.id).map((o) => o.id),
      rng,
    );
  }

  const now = Date.now();
  const state: GameState = {
    id: randomId("game"),
    createdAt: now,
    updatedAt: now,
    humanTelegramId: options.humanTelegramId ?? null,
    humanPlayerId: HUMAN_ID,
    settings,
    phase: "roleAssignment",
    day: 0,
    night: 0,
    players,
    nightActions: [],
    events: [],
    chat: [],
    memories,
    pendingHunterId: null,
    winners: null,
    seed,
    rngState: rng.getState(),
    processedUpdateIds: [],
    waitingForHuman: false,
    humanPrompt: null,
    discussionIndex: 0,
    discussionPlan: [],
    lastHumanStatement: null,
    version: 1,
  };
  seedNpcMinds(state, rng);
  state.rngState = rng.getState();
  return state;
}

export { CLASSIC_TABLE };
