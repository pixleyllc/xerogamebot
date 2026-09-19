import { rngFromState, type Rng } from "@/game/rng.ts";
import { whisper } from "@/game/events.ts";
import {
  getRole,
  livingPlayers,
  needsNightAction,
  roleLabel,
  validNightTargets,
} from "@/roles/index.ts";
import type {
  DeathCause,
  GameState,
  NightAction,
  PlayerState,
  RoleId,
} from "@/game/types.ts";

const HUNTER_KILL_WOLF_BASE = 30;
const GA_VS_WOLF_DEATH = 50;
const SK_VS_WOLF_SURVIVE = 80;
const HUNTER_CULT_RESIST = 50;

function persistRng(state: GameState, rng: Rng) {
  state.rngState = rng.getState();
}

function byId(state: GameState, id: string): PlayerState {
  const p = state.players.find((x) => x.id === id);
  if (!p) throw new Error(`Unknown player ${id}`);
  return p;
}

export function resetNightFlags(state: GameState) {
  for (const p of state.players) {
    p.hasUsedNightAction = false;
    p.nightTargetId = null;
    p.nightTarget2Id = null;
    p.wasSavedLastNight = false;
    p.votesReceived = 0;
    p.voteTargetId = null;
  }
  state.nightActions = [];
}

export function recordNightAction(
  state: GameState,
  action: NightAction,
): string | null {
  const actor = byId(state, action.actorId);
  if (!actor.isAlive) return "Dead players cannot act.";
  if (state.phase !== "night") return "Night actions are only accepted at night.";
  if (!needsNightAction(actor, state.night) && action.type !== "skip") {
    return "You have no night action.";
  }
  if (action.type !== "skip") {
    const legal = validNightTargets(state, actor);
    if (action.targetId && !legal.includes(action.targetId)) {
      return "Invalid target.";
    }
    if (action.type === "cupid") {
      if (!action.targetId || !action.target2Id) return "Cupid must pick two players.";
      if (action.targetId === action.target2Id) return "Cupid must pick two different players.";
      if (!legal.includes(action.target2Id)) return "Invalid second target.";
    }
  }
  actor.hasUsedNightAction = true;
  actor.nightTargetId = action.targetId;
  actor.nightTarget2Id = action.target2Id;
  state.nightActions = state.nightActions.filter((a) => a.actorId !== actor.id);
  state.nightActions.push(action);
  return null;
}

function killPlayer(
  state: GameState,
  victim: PlayerState,
  cause: DeathCause,
  killerId: string | null,
  _rng: Rng,
  notes: string[],
) {
  if (!victim.isAlive) return;
  victim.isAlive = false;
  victim.diedAtNight = state.night;
  victim.diedAtDay = state.day;
  victim.deathCause = cause;
  victim.killedByPlayerId = killerId;

  const lover = victim.loverId ? state.players.find((p) => p.id === victim.loverId) : null;
  if (lover && lover.isAlive) {
    lover.isAlive = false;
    lover.diedAtNight = state.night;
    lover.diedAtDay = state.day;
    lover.deathCause = "loverSorrow";
    lover.killedByPlayerId = victim.id;
    notes.push(`${lover.name} dies of sorrow after ${victim.name} falls.`);
  }
}

export function resolveNight(state: GameState): { deaths: PlayerState[]; notes: string[] } {
  const rng = rngFromState(state.rngState);
  const notes: string[] = [];
  const deaths: PlayerState[] = [];
  const protectedIds = new Set<string>();
  let gaTarget: PlayerState | null = null;
  let ga: PlayerState | null = null;

  const actionBy = (id: string) => state.nightActions.find((a) => a.actorId === id);

  if (state.night === 1) {
    const cupid = livingPlayers(state).find((p) => p.roleId === "cupid");
    if (cupid) {
      const act = actionBy(cupid.id);
      const a = act?.targetId ? byId(state, act.targetId) : null;
      const b = act?.target2Id ? byId(state, act.target2Id) : null;
      if (a && b && a.id !== b.id) {
        a.inLove = true;
        b.inLove = true;
        a.loverId = b.id;
        b.loverId = a.id;
        whisper(
          state,
          a.id,
          `You are madly in love with ${b.name}. You do not know their role. If they die, you die.`,
        );
        whisper(
          state,
          b.id,
          `You are madly in love with ${a.name}. You do not know their role. If they die, you die.`,
        );
        whisper(state, cupid.id, `Your arrows found ${a.name} and ${b.name}.`);
        notes.push("Cupid's arrows found their mark.");
      }
    }
  }

  ga = livingPlayers(state).find((p) => p.roleId === "guardianAngel") ?? null;
  if (ga) {
    const act = actionBy(ga.id);
    if (act?.targetId) {
      gaTarget = byId(state, act.targetId);
      if (gaTarget.isAlive) {
        protectedIds.add(gaTarget.id);
        gaTarget.wasSavedLastNight = true;
        ga.lastProtectedId = gaTarget.id;
      }
    }
  }

  const pendingKills: Array<{
    victim: PlayerState;
    cause: DeathCause;
    killerId: string | null;
  }> = [];

  const queueKill = (victim: PlayerState, cause: DeathCause, killerId: string | null) => {
    if (!victim.isAlive) return;
    if (protectedIds.has(victim.id) && (cause === "wolf" || cause === "serialKiller")) {
      notes.push(`${victim.name} was attacked but watched over.`);
      return;
    }
    pendingKills.push({ victim, cause, killerId });
  };

  const sk = livingPlayers(state).find((p) => p.roleId === "serialKiller") ?? null;
  if (sk) {
    const act = actionBy(sk.id);
    if (act?.targetId) {
      const target = byId(state, act.targetId);
      queueKill(target, "serialKiller", sk.id);
    }
  }

  const wolves = livingPlayers(state).filter((p) => p.roleId === "werewolf");
  let wolfTarget: PlayerState | null = null;
  if (wolves.length) {
    const votes = new Map<string, number>();
    for (const w of wolves) {
      const act = actionBy(w.id);
      if (act?.targetId) {
        votes.set(act.targetId, (votes.get(act.targetId) ?? 0) + 1);
      }
    }
    if (votes.size) {
      let best = 0;
      const tied: string[] = [];
      for (const [id, n] of votes) {
        if (n > best) {
          best = n;
          tied.length = 0;
          tied.push(id);
        } else if (n === best) tied.push(id);
      }
      const chosen = rng.pick(tied);
      wolfTarget = byId(state, chosen);
    }
  }

  if (wolfTarget) {
    if (wolfTarget.roleId === "serialKiller" && wolfTarget.isAlive) {
      if (protectedIds.has(wolfTarget.id)) {
        notes.push(`${wolfTarget.name} was attacked but watched over.`);
      } else if (rng.chance(100 - SK_VS_WOLF_SURVIVE)) {
        queueKill(wolfTarget, "wolf", wolves[0]?.id ?? null);
      } else {
        const victimWolf = rng.pick(wolves);
        notes.push(
          `The Serial Killer was attacked and killed ${victimWolf.name} instead.`,
        );
        queueKill(victimWolf, "serialKiller", wolfTarget.id);
      }
    } else if (wolfTarget.roleId === "hunter" && wolfTarget.isAlive) {
      const chance = HUNTER_KILL_WOLF_BASE + (wolves.length - 1) * 20;
      if (rng.chance(chance) && wolves.length) {
        const shot = rng.pick(wolves);
        notes.push(
          `The Hunter fired in the dark and took ${shot.name} down while being eaten.`,
        );
        queueKill(shot, "hunterRetaliation", wolfTarget.id);
      }
      queueKill(wolfTarget, "wolf", wolves[0]?.id ?? null);
    } else {
      queueKill(wolfTarget, "wolf", wolves[0]?.id ?? null);
    }
  }

  const cultists = livingPlayers(state).filter(
    (p) => p.roleId === "cultist" || p.convertedToCult,
  );
  if (cultists.length) {
    const acts = cultists.map((c) => actionBy(c.id)).find(Boolean);
    if (acts?.targetId) {
      const target = byId(state, acts.targetId);
      if (
        target.isAlive &&
        target.roleId !== "werewolf" &&
        target.roleId !== "serialKiller" &&
        target.roleId !== "cultist" &&
        !target.convertedToCult
      ) {
        let converted = true;
        if (target.roleId === "hunter" && rng.chance(HUNTER_CULT_RESIST)) {
          converted = false;
          notes.push(`${target.name} resisted the Cult.`);
        }
        if (converted) {
          target.convertedToCult = true;
          target.faction = "cult";
          target.roleId = "cultist";
          whisper(
            state,
            target.id,
            "A chant fills your mind. You have joined the Cult. The village is no longer your team.",
          );
          for (const c of cultists) {
            whisper(state, c.id, `${target.name} has joined the Cult.`);
          }
        }
      }
    }
  }

  for (const player of livingPlayers(state)) {
    if (player.roleId !== "seer" && player.roleId !== "fool") continue;
    const act = actionBy(player.id);
    if (!act?.targetId) continue;
    const target = byId(state, act.targetId);
    let shown: RoleId = getRole(target.roleId).seerSeesAs;
    let wasTrue = true;
    if (player.roleId === "fool") {
      const pool = [...new Set(state.players.map((p) => p.originalRoleId))];
      shown = rng.pick(pool);
      wasTrue = shown === target.roleId;
    }
    player.investigations.push({
      night: state.night,
      targetId: target.id,
      shownRoleId: shown,
      wasTrue,
    });
    const mem = state.memories[player.id];
    if (mem) {
      mem.facts.push({
        id: `see-${state.night}-${target.id}`,
        day: state.day,
        night: state.night,
        text: `Investigation: ${target.name} appeared to be ${roleLabel(shown)}.`,
        kind: "nightPrivate",
        aboutPlayerIds: [target.id],
      });
      if (shown === "werewolf" || shown === "serialKiller" || shown === "cultist") {
        mem.beliefs[target.id] = Math.min(0.98, (mem.beliefs[target.id] ?? 0.35) + 0.45);
      } else {
        mem.beliefs[target.id] = Math.max(0.05, (mem.beliefs[target.id] ?? 0.35) - 0.2);
      }
    }
    whisper(
      state,
      player.id,
      `You study ${target.name}... they appear to be ${roleLabel(shown)}.`,
    );
  }

  if (ga && ga.isAlive && gaTarget && gaTarget.isAlive) {
    if (gaTarget.roleId === "serialKiller") {
      notes.push(`${ga.name} watched the Serial Killer and was slain.`);
      pendingKills.push({ victim: ga, cause: "gaSerialKiller", killerId: gaTarget.id });
    } else if (gaTarget.roleId === "werewolf" && rng.chance(GA_VS_WOLF_DEATH)) {
      notes.push(`${ga.name} watched a werewolf and was slain.`);
      pendingKills.push({ victim: ga, cause: "gaWolf", killerId: gaTarget.id });
    }
  }

  const seen = new Set<string>();
  for (const k of pendingKills) {
    if (seen.has(k.victim.id) || !k.victim.isAlive) continue;
    seen.add(k.victim.id);
    killPlayer(state, k.victim, k.cause, k.killerId, rng, notes);
    deaths.push(k.victim);
    if (k.victim.loverId) {
      const lover = state.players.find((p) => p.id === k.victim.loverId);
      if (lover && !lover.isAlive && !deaths.includes(lover)) deaths.push(lover);
    }
  }

  persistRng(state, rng);
  return { deaths, notes };
}

export function dawnText(state: GameState, deaths: PlayerState[], notes: string[]): string {
  const lines = [`Day ${state.day}. The village wakes.`];
  const nightDeaths = deaths.filter((d) => d.deathCause !== "loverSorrow");
  const sorrow = deaths.filter((d) => d.deathCause === "loverSorrow");
  if (!nightDeaths.length) {
    lines.push("The night passes without a confirmed kill.");
  } else {
    for (const d of nightDeaths) {
      const revealed = state.settings.showRolesOnDeath
        ? ` They were ${roleLabel(d.roleId)}.`
        : "";
      if (d.deathCause === "wolf") {
        lines.push(`${d.name} was found dead. The wolves fed.${revealed}`);
      } else if (d.deathCause === "serialKiller") {
        lines.push(`${d.name} was found dead, killed with cruel precision.${revealed}`);
      } else if (d.deathCause === "gaWolf" || d.deathCause === "gaSerialKiller") {
        lines.push(`${d.name} died protecting someone in the dark.${revealed}`);
      } else if (d.deathCause === "hunterRetaliation") {
        lines.push(`${d.name} was shot during the attack.${revealed}`);
      } else {
        lines.push(`${d.name} did not survive the night.${revealed}`);
      }
    }
  }
  for (const d of sorrow) {
    lines.push(`${d.name} collapsed in grief. The other lover is gone.`);
  }
  for (const n of notes) {
    if (n.includes("Serial Killer was attacked") || n.includes("Hunter fired")) {
      lines.push(n);
    }
  }
  const living = livingPlayers(state);
  lines.push(`Still alive (${living.length}): ${living.map((p) => p.name).join(", ")}.`);
  return lines.join("\n\n");
}

export function anyoneNeedsNightAction(state: GameState): PlayerState[] {
  return livingPlayers(state).filter((p) => needsNightAction(p, state.night));
}

export function autoSkipIfNoTargets(state: GameState, actor: PlayerState) {
  const targets = validNightTargets(state, actor);
  if (!targets.length) {
    recordNightAction(state, {
      actorId: actor.id,
      type: "skip",
      targetId: null,
      target2Id: null,
    });
  }
}

export { HUNTER_KILL_WOLF_BASE, GA_VS_WOLF_DEATH, SK_VS_WOLF_SURVIVE };
