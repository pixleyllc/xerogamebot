import {
  getRole,
  shownRoleFor,
  validHunterTargets,
  validNightTargets,
  validVoteTargets,
} from "@/roles/index.ts";
import type {
  ChatMessage,
  GameState,
  PlayerPublicInfo,
  PlayerState,
  PlayerView,
  PublicEvent,
  RoleId,
} from "@/game/types.ts";

function playerById(state: GameState, id: string): PlayerState {
  const p = state.players.find((x) => x.id === id);
  if (!p) throw new Error(`Unknown player ${id}`);
  return p;
}

function canKnowAllyRole(viewer: PlayerState, other: PlayerState): RoleId | null {
  if (viewer.roleId === "werewolf" && other.roleId === "werewolf" && !other.convertedToCult) {
    return "werewolf";
  }
  if (
    (viewer.roleId === "cultist" || viewer.convertedToCult) &&
    (other.roleId === "cultist" || other.convertedToCult)
  ) {
    return "cultist";
  }
  return null;
}

function visibleChat(state: GameState, viewerId: string): ChatMessage[] {
  return state.chat.filter((m) => {
    if (m.privateToPlayerId == null) return true;
    return m.privateToPlayerId === viewerId;
  });
}

export function buildPrivateView(state: GameState, viewerId: string): PlayerView {
  const viewer = playerById(state, viewerId);
  const shownRoleId = shownRoleFor(viewer);
  const publicEvents: PublicEvent[] = state.events.slice();

  const players: PlayerPublicInfo[] = state.players.map((p) => {
    const ally = p.id === viewer.id ? shownRoleId : canKnowAllyRole(viewer, p);
    const revealed =
      !p.isAlive && state.settings.showRolesOnDeath ? p.roleId : null;
    return {
      id: p.id,
      name: p.name,
      isAlive: p.isAlive,
      isHuman: p.isHuman,
      isLoverOfYou: viewer.loverId === p.id,
      knownAllyRoleId: p.id === viewer.id ? shownRoleId : ally,
      diedAtDay: p.diedAtDay,
      diedAtNight: p.diedAtNight,
      deathCause: p.deathCause,
      revealedRoleId: p.id === viewer.id ? shownRoleId : revealed,
    };
  });

  const packMates =
    viewer.roleId === "werewolf"
      ? state.players
          .filter((p) => p.id !== viewer.id && p.roleId === "werewolf" && p.isAlive)
          .map((p) => ({ id: p.id, name: p.name, roleId: "werewolf" as const }))
      : [];

  const cultMates =
    viewer.roleId === "cultist" || viewer.convertedToCult
      ? state.players
          .filter(
            (p) =>
              p.id !== viewer.id &&
              p.isAlive &&
              (p.roleId === "cultist" || p.convertedToCult),
          )
          .map((p) => ({ id: p.id, name: p.name }))
      : [];

  const cupidPair =
    viewer.roleId === "cupid"
      ? state.players
          .filter((p) => p.inLove)
          .map((p) => ({ id: p.id, name: p.name }))
      : null;

  const lover = viewer.loverId ? state.players.find((p) => p.id === viewer.loverId) : null;

  const investigations = viewer.investigations.map((inv) => ({
    night: inv.night,
    targetId: inv.targetId,
    targetName: playerById(state, inv.targetId).name,
    shownRoleId: inv.shownRoleId,
  }));

  const waitingForYou =
    state.waitingForHuman && viewer.isHuman ? state.humanPrompt : null;

  return {
    viewerId: viewer.id,
    viewerName: viewer.name,
    isHuman: viewer.isHuman,
    shownRoleId,
    trueRoleKnown: shownRoleId === viewer.roleId,
    faction: viewer.convertedToCult ? "cult" : viewer.faction,
    isAlive: viewer.isAlive,
    phase: state.phase,
    day: state.day,
    night: state.night,
    inLove: viewer.inLove,
    loverId: viewer.loverId,
    loverName: lover?.name ?? null,
    packMates,
    cultMates,
    cupidPair: cupidPair && cupidPair.length ? cupidPair : null,
    investigations,
    players,
    publicEvents,
    recentChat: visibleChat(state, viewer.id).slice(-40),
    memory: viewer.isHuman ? null : (state.memories[viewer.id] ?? null),
    personality: viewer.isHuman ? null : viewer.personality,
    waitingForYou,
    validNightTargets: viewer.isAlive ? validNightTargets(state, viewer) : [],
    validVoteTargets: viewer.isAlive ? validVoteTargets(state, viewer.id) : [],
    validHunterTargets: viewer.isAlive ? validHunterTargets(state, viewer.id) : [],
    settings: {
      mode: state.settings.mode,
      voteVisibility: state.settings.voteVisibility,
      showRolesOnDeath: state.settings.showRolesOnDeath,
      maxDiscussionMessages: state.settings.maxDiscussionMessages,
    },
  };
}

export function assertNoLeak(view: PlayerView, state: GameState) {
  const viewer = playerById(state, view.viewerId);
  if (viewer.roleId === "fool" && view.shownRoleId !== "seer") {
    throw new Error("Fool must see themselves as Seer");
  }
  const hiddenOthers = state.players.filter(
    (p) => p.id !== viewer.id && p.isAlive && !canKnowAllyRole(viewer, p),
  );
  for (const other of hiddenOthers) {
    const info = view.players.find((p) => p.id === other.id);
    if (info?.revealedRoleId && other.isAlive) {
      throw new Error(`Living hidden role revealed: ${other.name}`);
    }
    if (info?.knownAllyRoleId) {
      throw new Error(`Ally role incorrectly known: ${other.name}`);
    }
  }
}

export function livingNames(state: GameState): string {
  return state.players
    .filter((p) => p.isAlive)
    .map((p) => p.name)
    .join(", ");
}

export function roleCardText(view: PlayerView): string {
  const def = getRole(view.shownRoleId);
  const lines = [
    `${def.emoji} You are the ${def.displayName}.`,
    def.description,
    `Win: ${def.winCondition}`,
  ];
  if (view.packMates.length) {
    lines.push(`Your pack: ${view.packMates.map((p) => p.name).join(", ")}`);
  }
  if (view.cultMates.length) {
    lines.push(`Cult: ${view.cultMates.map((p) => p.name).join(", ")}`);
  }
  if (view.loverName) {
    lines.push(`You are in love with ${view.loverName}. If they die, you die.`);
  }
  if (view.cupidPair?.length) {
    lines.push(`Lovers you bound: ${view.cupidPair.map((p) => p.name).join(" & ")}`);
  }
  return lines.join("\n");
}
