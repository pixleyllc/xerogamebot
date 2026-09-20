import { buildPrivateView, roleCardText } from "@/game/isolation.ts";
import { moderator, playerSay, stamp, whisper } from "@/game/events.ts";
import {
  anyoneNeedsNightAction,
  autoSkipIfNoTargets,
  dawnText,
  recordNightAction,
  resetNightFlags,
  resolveNight,
} from "@/game/night.ts";
import {
  getRole,
  livingPlayers,
  needsNightAction,
  roleLabel,
  validNightTargets,
} from "@/roles/index.ts";
import { checkWin, tannerWin } from "@/game/win.ts";
import {
  castVote,
  executeLynch,
  hunterShoot,
  lynchAnnouncement,
  resetVotes,
  tallyVotes,
  voteSummary,
} from "@/game/voting.ts";
import type {
  EngineAction,
  EngineResult,
  GameState,
  HumanPrompt,
  PlayerState,
} from "@/game/types.ts";
import { HUMAN_ID } from "@/game/types.ts";

function result(state: GameState, errors: string[] = []): EngineResult {
  stamp(state);
  return {
    state,
    privateMessages: state.chat.filter((m) => m.privateToPlayerId != null).slice(-12),
    publicMessages: state.chat.filter((m) => m.privateToPlayerId == null).slice(-12),
    errors,
  };
}

function human(state: GameState): PlayerState {
  const p = state.players.find((x) => x.id === state.humanPlayerId) ?? state.players.find((x) => x.isHuman);
  if (!p) throw new Error("No human player");
  return p;
}

function setPrompt(state: GameState, prompt: HumanPrompt | null) {
  state.humanPrompt = prompt;
  state.waitingForHuman = prompt != null;
}

function applyWin(state: GameState) {
  const win = checkWin(state);
  if (!win) return false;
  state.winners = win;
  state.phase = "gameOver";
  setPrompt(state, null);
  const names = win.playerIds
    .map((id) => state.players.find((p) => p.id === id)?.name)
    .filter(Boolean)
    .join(", ");
  const roster = state.players
    .map((p) => `${p.name} — ${roleLabel(p.originalRoleId)}${p.convertedToCult ? " (cult)" : ""}${p.isAlive ? "" : " †"}`)
    .join("\n");
  moderator(
    state,
    `Game over. ${win.summary}\n\nWinners (${win.faction}): ${names || "—"}\n\nRoles:\n${roster}`,
    { kind: "win", related: win.playerIds },
  );
  return true;
}

function nightPromptFor(state: GameState, actor: PlayerState): HumanPrompt {
  const def = getRole(actor.roleId === "fool" ? "seer" : actor.roleId);
  const targets = validNightTargets(state, actor).map((id) => {
    const p = state.players.find((x) => x.id === id)!;
    return { id: p.id, name: p.name };
  });
  if (def.nightAction === "cupid") {
    return {
      kind: "cupid",
      title: `Night ${state.night}`,
      body: "Choose two players to fall in love.",
      targets,
      allowSkip: false,
      cupidSecondPick: true,
    };
  }
  const verb =
    def.nightAction === "wolfKill"
      ? "Choose your kill"
      : def.nightAction === "protect"
        ? "Choose someone to watch over"
        : def.nightAction === "see"
          ? "Choose someone to investigate"
          : def.nightAction === "skKill"
            ? "Choose your victim"
            : def.nightAction === "convert"
              ? "Choose someone to convert"
              : "Choose a target";
  return {
    kind: "night",
    title: `Night ${state.night}`,
    body: `You are ${def.emoji} ${def.displayName}.\n\n${verb}:`,
    targets,
    allowSkip: def.nightAction === "protect" || def.nightAction === "see" || def.nightAction === "convert",
    cupidSecondPick: false,
  };
}

export function beginNight(state: GameState): EngineResult {
  if (applyWin(state)) return result(state);
  state.night += 1;
  state.phase = "night";
  resetNightFlags(state);
  const actors = anyoneNeedsNightAction(state);
  for (const a of actors) autoSkipIfNoTargets(state, a);
  const still = anyoneNeedsNightAction(state).filter((p) => !p.hasUsedNightAction);
  const h = human(state);
  moderator(
    state,
    `Night ${state.night}. The village sleeps. Those with work in the dark, choose.`,
    { kind: "phase" },
  );
  if (h.isAlive && still.some((p) => p.id === h.id)) {
    setPrompt(state, nightPromptFor(state, h));
    whisper(state, h.id, nightPromptFor(state, h).body);
  } else {
    setPrompt(state, null);
  }
  return maybeFinishNight(state);
}

function allNightActionsIn(state: GameState): boolean {
  return anyoneNeedsNightAction(state).every((p) => p.hasUsedNightAction);
}

export function maybeFinishNight(state: GameState): EngineResult {
  if (state.phase !== "night") return result(state);
  if (!allNightActionsIn(state)) return result(state);
  const { deaths, notes } = resolveNight(state);
  state.day += 1;
  state.phase = "dawn";
  const text = dawnText(state, deaths, notes);
  moderator(state, text, {
    kind: "dawn",
    related: deaths.map((d) => d.id),
  });
  if (applyWin(state)) return result(state);
  return beginDiscussion(state);
}

export function beginDiscussion(state: GameState): EngineResult {
  state.phase = "discussion";
  state.discussionIndex = 0;
  state.discussionPlan = [];
  const h = human(state);
  if (h.isAlive) {
    setPrompt(state, {
      kind: "discussion",
      title: `Day ${state.day}`,
      body: "Make your case. When you are ready, call the vote.",
      targets: [],
      allowSkip: true,
      cupidSecondPick: false,
    });
  } else {
    setPrompt(state, {
      kind: "continue",
      title: `Day ${state.day}`,
      body: "You are dead. Watch the village argue, then continue to the vote.",
      targets: [],
      allowSkip: true,
      cupidSecondPick: false,
    });
  }
  return result(state);
}

export function beginVoting(state: GameState): EngineResult {
  state.phase = "voting";
  resetVotes(state);
  const h = human(state);
  const targets = livingPlayers(state)
    .filter((p) => p.id !== h.id)
    .map((p) => ({ id: p.id, name: p.name }));
  moderator(state, "The vote is open. Who should be executed?", { kind: "phase" });
  if (h.isAlive) {
    setPrompt(state, {
      kind: "vote",
      title: "Vote",
      body: "Who should be eliminated?",
      targets,
      allowSkip: false,
      cupidSecondPick: false,
    });
  } else {
    setPrompt(state, null);
  }
  return maybeFinishVoting(state);
}

export function maybeFinishVoting(state: GameState): EngineResult {
  if (state.phase !== "voting") return result(state);
  const alive = livingPlayers(state);
  if (alive.some((p) => !p.voteTargetId && p.isAlive)) return result(state);
  const summary = voteSummary(state);
  if (state.settings.voteVisibility === "public") {
    moderator(state, summary, { kind: "vote" });
  }
  const { lynched, tie, noVotes } = tallyVotes(state);
  state.phase = "execution";
  moderator(state, lynchAnnouncement(state, lynched, tie, noVotes), {
    kind: "lynch",
    related: lynched ? [lynched.id] : [],
  });
  if (lynched) {
    executeLynch(state, lynched);
    const lover = state.players.find((p) => p.deathCause === "loverSorrow" && p.diedAtDay === state.day);
    if (lover) {
      moderator(state, `${lover.name} dies of sorrow.`, { kind: "death", related: [lover.id] });
    }
    if (lynched.roleId === "tanner") {
      state.winners = tannerWin(state, lynched);
      state.phase = "gameOver";
      setPrompt(state, null);
      const roster = state.players
        .map((p) => `${p.name} — ${roleLabel(p.originalRoleId)}${p.isAlive ? "" : " †"}`)
        .join("\n");
      moderator(
        state,
        `Game over. ${state.winners.summary}\n\nRoles:\n${roster}`,
        { kind: "win", related: [lynched.id] },
      );
      return result(state);
    }
    if (lynched.roleId === "hunter" && !lynched.hunterHasShot) {
      const shotTargets = livingPlayers(state).map((p) => ({ id: p.id, name: p.name }));
      if (shotTargets.length) {
        state.phase = "hunterShot";
        state.pendingHunterId = lynched.id;
        if (lynched.isHuman) {
          setPrompt(state, {
            kind: "hunterShot",
            title: "Final shot",
            body: "You are dying. Take someone with you.",
            targets: shotTargets,
            allowSkip: false,
            cupidSecondPick: false,
          });
          whisper(state, lynched.id, "You are the Hunter. Choose someone to shoot.");
        } else {
          setPrompt(state, null);
        }
        return result(state);
      }
    }
  }
  if (applyWin(state)) return result(state);
  return beginNight(state);
}

export function maybeFinishHunterShot(state: GameState): EngineResult {
  if (state.phase !== "hunterShot") return result(state);
  const hunter = state.players.find((p) => p.id === state.pendingHunterId);
  if (!hunter || !hunter.hunterHasShot) return result(state);
  const shot = state.players.find(
    (p) => p.killedByPlayerId === hunter.id && p.deathCause === "hunterShot",
  );
  if (shot) {
    moderator(state, `With their last breath, ${hunter.name} shoots ${shot.name}.`, {
      kind: "death",
      related: [shot.id],
    });
    const lover = state.players.find(
      (p) => p.deathCause === "loverSorrow" && p.killedByPlayerId === shot.id,
    );
    if (lover) {
      moderator(state, `${lover.name} dies of sorrow.`, { kind: "death", related: [lover.id] });
    }
  }
  state.pendingHunterId = null;
  if (applyWin(state)) return result(state);
  return beginNight(state);
}

export function startGame(state: GameState): EngineResult {
  state.phase = "roleAssignment";
  state.day = 0;
  state.night = 0;
  moderator(
    state,
    `A ${state.settings.mode} game with ${state.players.length} players has begun.\n\nPlayers: ${state.players.map((p) => p.name).join(", ")}.`,
    { kind: "system" },
  );
  for (const p of state.players) {
    const view = buildPrivateView(state, p.id);
    whisper(state, p.id, roleCardText(view));
  }
  return beginNight(state);
}

export function applyEngineAction(state: GameState, action: EngineAction): EngineResult {
  const errors: string[] = [];
  const actor = state.players.find((p) => p.id === action.actorId);
  if (!actor) return result(state, ["Unknown actor"]);
  if (state.phase === "gameOver") return result(state, ["The game is over."]);

  if (action.type === "say") {
    if (!actor.isAlive) return result(state, ["The dead cannot speak."]);
    if (state.phase === "voting" && !actor.isHuman) {
      return result(state, ["NPCs do not speak during the vote."]);
    }
    if (!actor.isHuman && state.phase !== "discussion") {
      return result(state, ["NPCs only speak during discussion."]);
    }
    if (state.phase !== "discussion" && state.phase !== "day" && state.phase !== "voting") {
      return result(state, ["You can only speak during the day."]);
    }
    const text = (action.text ?? "").trim();
    if (!text) return result(state, ["Empty message"]);
    playerSay(state, actor.id, text.slice(0, 400));
    if (actor.isHuman) state.lastHumanStatement = text.slice(0, 400);
    return result(state);
  }

  if (action.type === "nightTarget" || action.type === "nightCupid") {
    const err = recordNightAction(state, {
      actorId: actor.id,
      type:
        actor.roleId === "cupid"
          ? "cupid"
          : actor.roleId === "werewolf"
            ? "wolfKill"
            : actor.roleId === "guardianAngel"
              ? "protect"
              : actor.roleId === "seer" || actor.roleId === "fool"
                ? "see"
                : actor.roleId === "serialKiller"
                  ? "skKill"
                  : actor.roleId === "cultist"
                    ? "convert"
                    : "skip",
      targetId: action.targetId ?? null,
      target2Id: action.target2Id ?? null,
    });
    if (err) return result(state, [err]);
    if (actor.isHuman) {
      whisper(state, actor.id, "Choice accepted. The night continues.");
      setPrompt(state, null);
    }
    return maybeFinishNight(state);
  }

  if (action.type === "skip") {
    if (state.phase === "night" && actor.isAlive) {
      const err = recordNightAction(state, {
        actorId: actor.id,
        type: "skip",
        targetId: null,
        target2Id: null,
      });
      if (err) return result(state, [err]);
      if (actor.isHuman) setPrompt(state, null);
      return maybeFinishNight(state);
    }
    if (state.phase === "discussion") {
      return beginVoting(state);
    }
    return result(state);
  }

  if (action.type === "vote") {
    const err = castVote(state, actor.id, action.targetId ?? "");
    if (err) return result(state, [err]);
    if (actor.isHuman) setPrompt(state, null);
    const mem = state.memories[actor.id];
    if (mem && action.targetId) mem.intendedVoteId = action.targetId;
    return maybeFinishVoting(state);
  }

  if (action.type === "hunterShot") {
    const err = hunterShoot(state, actor.id, action.targetId ?? "");
    if (err) return result(state, [err]);
    if (actor.isHuman) setPrompt(state, null);
    return maybeFinishHunterShot(state);
  }

  if (action.type === "advance") {
    if (state.phase === "discussion") return beginVoting(state);
    if (state.phase === "night") return maybeFinishNight(state);
    if (state.phase === "voting") return maybeFinishVoting(state);
    if (state.phase === "hunterShot") return maybeFinishHunterShot(state);
    return result(state);
  }

  return result(state, errors);
}

export function playersMissingNightAction(state: GameState): PlayerState[] {
  if (state.phase !== "night") return [];
  return anyoneNeedsNightAction(state).filter((p) => !p.hasUsedNightAction);
}

export function playersMissingVote(state: GameState): PlayerState[] {
  if (state.phase !== "voting") return [];
  return livingPlayers(state).filter((p) => !p.voteTargetId);
}

export function hunterNeedingShot(state: GameState): PlayerState | null {
  if (state.phase !== "hunterShot" || !state.pendingHunterId) return null;
  const h = state.players.find((p) => p.id === state.pendingHunterId);
  if (!h || h.hunterHasShot) return null;
  return h;
}

export { HUMAN_ID, roleCardText, buildPrivateView };
