/**
 * Shared, JSON-serializable game types.
 * Used by the Cloudflare Worker, Durable Objects, tests, and the web client.
 */

export type GameMode = "classic" | "chaos";

export type Phase =
  | "lobby"
  | "roleAssignment"
  | "night"
  | "dawn"
  | "day"
  | "discussion"
  | "voting"
  | "execution"
  | "hunterShot"
  | "winCheck"
  | "gameOver";

export type RoleId =
  | "villager"
  | "werewolf"
  | "seer"
  | "guardianAngel"
  | "hunter"
  | "tanner"
  | "fool"
  | "cultist"
  | "serialKiller"
  | "cupid";

export type Faction =
  | "village"
  | "wolf"
  | "tanner"
  | "cult"
  | "serialKiller"
  | "lovers"
  | "neutral"
  | "noOne";

export type DeathCause =
  | "wolf"
  | "serialKiller"
  | "hunterShot"
  | "hunterRetaliation"
  | "lynch"
  | "loverSorrow"
  | "gaWolf"
  | "gaSerialKiller"
  | "cultHunt"
  | "idle"
  | "unknown";

export type NightActionType =
  | "wolfKill"
  | "protect"
  | "see"
  | "skKill"
  | "convert"
  | "cupid"
  | "skip";

export type VoteVisibility = "public" | "hidden";

export type TieBreak = "none" | "random";

export interface GameSettings {
  mode: GameMode;
  playerCount: number;
  voteVisibility: VoteVisibility;
  tieBreak: TieBreak;
  showRolesOnDeath: boolean;
  showRolesOnGameEnd: boolean;
  allowOrdinaryTextAsSay: boolean;
  discussionMessageDelayMs: number;
  aiResponseDelayMs: number;
  nightTimeoutMs: number;
  discussionTimeoutMs: number;
  voteTimeoutMs: number;
  hunterShotTimeoutMs: number;
  maxDiscussionMessages: number;
}

export const DEFAULT_SETTINGS: GameSettings = {
  mode: "classic",
  playerCount: 10,
  voteVisibility: "public",
  tieBreak: "none",
  showRolesOnDeath: false,
  showRolesOnGameEnd: true,
  allowOrdinaryTextAsSay: true,
  discussionMessageDelayMs: 1400,
  aiResponseDelayMs: 700,
  nightTimeoutMs: 90_000,
  discussionTimeoutMs: 120_000,
  voteTimeoutMs: 60_000,
  hunterShotTimeoutMs: 45_000,
  maxDiscussionMessages: 5,
};

export interface Personality {
  seedName: string;
  traits: string[];
  speakingStyle: string;
  riskTolerance: number;
  deception: number;
  aggression: number;
  trustTendency: number;
  analytical: number;
  memoryStrength: number;
}

export interface MemoryFact {
  id: string;
  day: number;
  night: number;
  text: string;
  kind:
    | "death"
    | "vote"
    | "statement"
    | "accusation"
    | "reveal"
    | "nightPrivate"
    | "public";
  aboutPlayerIds: string[];
}

export interface NpcMemory {
  playerId: string;
  beliefs: Record<string, number>;
  trust: Record<string, number>;
  facts: MemoryFact[];
  shortTerm: string[];
  strategicSummary: string;
  accusationHistory: Array<{
    day: number;
    targetId: string;
    text: string;
  }>;
  voteHistory: Array<{ day: number; targetId: string }>;
  intendedVoteId: string | null;
}

export interface InvestigationResult {
  night: number;
  targetId: string;
  shownRoleId: RoleId;
  wasTrue: boolean;
}

export interface PlayerState {
  id: string;
  name: string;
  isHuman: boolean;
  isAlive: boolean;
  isFled: boolean;
  roleId: RoleId;
  originalRoleId: RoleId;
  faction: Faction;
  personality: Personality;
  telegramUserId: number | null;
  inLove: boolean;
  loverId: string | null;
  hasUsedNightAction: boolean;
  nightTargetId: string | null;
  nightTarget2Id: string | null;
  voteTargetId: string | null;
  votesReceived: number;
  diedAtDay: number | null;
  diedAtNight: number | null;
  deathCause: DeathCause | null;
  killedByPlayerId: string | null;
  wasSavedLastNight: boolean;
  investigations: InvestigationResult[];
  convertedToCult: boolean;
  hunterHasShot: boolean;
  lastProtectedId: string | null;
}

export interface NightAction {
  actorId: string;
  type: NightActionType;
  targetId: string | null;
  target2Id: string | null;
}

export interface PublicEvent {
  id: string;
  at: number;
  day: number;
  night: number;
  phase: Phase;
  kind:
    | "system"
    | "death"
    | "dawn"
    | "discussion"
    | "vote"
    | "lynch"
    | "win"
    | "roleReveal"
    | "statement"
    | "phase";
  text: string;
  speakerId: string | null;
  speakerName: string | null;
  relatedPlayerIds: string[];
  meta?: Record<string, string | number | boolean | null>;
}

export interface WinnerInfo {
  faction: Faction;
  playerIds: string[];
  summary: string;
}

export interface ChatMessage {
  id: string;
  at: number;
  authorId: string;
  authorName: string;
  kind: "moderator" | "player" | "whisper" | "system";
  text: string;
  privateToPlayerId: string | null;
}

export interface GameState {
  id: string;
  createdAt: number;
  updatedAt: number;
  humanTelegramId: number | null;
  humanPlayerId: string;
  settings: GameSettings;
  phase: Phase;
  day: number;
  night: number;
  players: PlayerState[];
  nightActions: NightAction[];
  events: PublicEvent[];
  chat: ChatMessage[];
  memories: Record<string, NpcMemory>;
  pendingHunterId: string | null;
  winners: WinnerInfo | null;
  seed: string;
  rngState: number;
  processedUpdateIds: number[];
  waitingForHuman: boolean;
  humanPrompt: HumanPrompt | null;
  discussionIndex: number;
  discussionPlan: string[];
  lastHumanStatement: string | null;
  version: number;
}

export interface HumanPrompt {
  kind: "night" | "vote" | "hunterShot" | "cupid" | "discussion" | "continue";
  title: string;
  body: string;
  targets: Array<{ id: string; name: string; hint?: string }>;
  allowSkip: boolean;
  cupidSecondPick: boolean;
}

export interface PlayerPublicInfo {
  id: string;
  name: string;
  isAlive: boolean;
  isHuman: boolean;
  isLoverOfYou: boolean;
  knownAllyRoleId: RoleId | null;
  diedAtDay: number | null;
  diedAtNight: number | null;
  deathCause: DeathCause | null;
  revealedRoleId: RoleId | null;
}

export interface PlayerView {
  viewerId: string;
  viewerName: string;
  isHuman: boolean;
  shownRoleId: RoleId;
  trueRoleKnown: boolean;
  faction: Faction;
  isAlive: boolean;
  phase: Phase;
  day: number;
  night: number;
  inLove: boolean;
  loverId: string | null;
  loverName: string | null;
  packMates: Array<{ id: string; name: string; roleId: RoleId }>;
  cultMates: Array<{ id: string; name: string }>;
  cupidPair: Array<{ id: string; name: string }> | null;
  investigations: Array<{
    night: number;
    targetId: string;
    targetName: string;
    shownRoleId: RoleId;
  }>;
  players: PlayerPublicInfo[];
  publicEvents: PublicEvent[];
  recentChat: ChatMessage[];
  memory: NpcMemory | null;
  personality: Personality | null;
  waitingForYou: HumanPrompt | null;
  validNightTargets: string[];
  validVoteTargets: string[];
  validHunterTargets: string[];
  settings: Pick<
    GameSettings,
    "mode" | "voteVisibility" | "showRolesOnDeath" | "maxDiscussionMessages"
  >;
}

export interface EngineAction {
  type:
    | "nightTarget"
    | "nightCupid"
    | "vote"
    | "hunterShot"
    | "say"
    | "skip"
    | "advance";
  actorId: string;
  targetId?: string;
  target2Id?: string;
  text?: string;
}

export interface EngineResult {
  state: GameState;
  privateMessages: ChatMessage[];
  publicMessages: ChatMessage[];
  errors: string[];
}

export const HUMAN_ID = "human";

export const WOLF_ROLES: RoleId[] = ["werewolf"];
export const CULT_ROLES: RoleId[] = ["cultist"];
export const EVIL_ROLES: RoleId[] = ["werewolf", "serialKiller", "cultist"];
export const VILLAGE_ROLES: RoleId[] = [
  "villager",
  "seer",
  "guardianAngel",
  "hunter",
  "fool",
];

export const PLAYER_COUNTS = [8, 9, 10, 11, 12, 13, 14, 15] as const;
export type PlayerCount = (typeof PLAYER_COUNTS)[number];
