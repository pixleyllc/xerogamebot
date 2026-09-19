import { rngFromState } from "@/game/rng.ts";
import { livingPlayers, roleLabel, validHunterTargets, validVoteTargets } from "@/roles/index.ts";
import type { GameState, PlayerState } from "@/game/types.ts";

function byId(state: GameState, id: string): PlayerState {
  const p = state.players.find((x) => x.id === id);
  if (!p) throw new Error(`Unknown player ${id}`);
  return p;
}

export function resetVotes(state: GameState) {
  for (const p of state.players) {
    p.voteTargetId = null;
    p.votesReceived = 0;
  }
}

export function castVote(state: GameState, actorId: string, targetId: string): string | null {
  if (state.phase !== "voting") return "Voting is not open.";
  const actor = byId(state, actorId);
  if (!actor.isAlive) return "Dead players cannot vote.";
  const legal = validVoteTargets(state, actorId);
  if (!legal.includes(targetId)) return "Invalid vote target.";
  actor.voteTargetId = targetId;
  return null;
}

export function tallyVotes(state: GameState): {
  counts: Array<{ player: PlayerState; votes: number }>;
  lynched: PlayerState | null;
  tie: boolean;
  noVotes: boolean;
} {
  for (const p of state.players) p.votesReceived = 0;
  const alive = livingPlayers(state);
  for (const p of alive) {
    if (p.voteTargetId) {
      const t = state.players.find((x) => x.id === p.voteTargetId);
      if (t && t.isAlive) t.votesReceived += 1;
    }
  }
  const counts = alive
    .map((player) => ({ player, votes: player.votesReceived }))
    .sort((a, b) => b.votes - a.votes);
  const noVotes = alive.every((p) => !p.voteTargetId);
  if (noVotes) {
    return { counts, lynched: null, tie: false, noVotes: true };
  }
  const max = counts[0]?.votes ?? 0;
  const tied = counts.filter((c) => c.votes === max && max > 0);
  if (tied.length === 0) {
    return { counts, lynched: null, tie: false, noVotes: true };
  }
  if (tied.length > 1) {
    if (state.settings.tieBreak === "random") {
      const rng = rngFromState(state.rngState);
      const pick = rng.pick(tied).player;
      state.rngState = rng.getState();
      return { counts, lynched: pick, tie: true, noVotes: false };
    }
    return { counts, lynched: null, tie: true, noVotes: false };
  }
  return { counts, lynched: tied[0]!.player, tie: false, noVotes: false };
}

export function executeLynch(state: GameState, target: PlayerState) {
  target.isAlive = false;
  target.diedAtDay = state.day;
  target.diedAtNight = state.night;
  target.deathCause = "lynch";
  target.killedByPlayerId = null;

  const lover = target.loverId ? state.players.find((p) => p.id === target.loverId) : null;
  if (lover && lover.isAlive) {
    lover.isAlive = false;
    lover.diedAtDay = state.day;
    lover.diedAtNight = state.night;
    lover.deathCause = "loverSorrow";
    lover.killedByPlayerId = target.id;
  }
}

export function hunterShoot(state: GameState, hunterId: string, targetId: string): string | null {
  if (state.phase !== "hunterShot") return "The hunter is not firing.";
  const hunter = byId(state, hunterId);
  if (hunter.roleId !== "hunter") return "You are not the Hunter.";
  if (hunter.hunterHasShot) return "The Hunter already shot.";
  const legal = validHunterTargets(state, hunterId);
  if (!legal.includes(targetId)) return "Invalid shot.";
  const target = byId(state, targetId);
  hunter.hunterHasShot = true;
  target.isAlive = false;
  target.diedAtDay = state.day;
  target.diedAtNight = state.night;
  target.deathCause = "hunterShot";
  target.killedByPlayerId = hunter.id;
  const lover = target.loverId ? state.players.find((p) => p.id === target.loverId) : null;
  if (lover && lover.isAlive) {
    lover.isAlive = false;
    lover.diedAtDay = state.day;
    lover.diedAtNight = state.night;
    lover.deathCause = "loverSorrow";
    lover.killedByPlayerId = target.id;
  }
  return null;
}

export function voteSummary(state: GameState): string {
  const alive = livingPlayers(state);
  if (state.settings.voteVisibility === "hidden") {
    const voted = alive.filter((p) => p.voteTargetId).length;
    return `${voted}/${alive.length} votes in.`;
  }
  const lines = alive.map((p) => {
    if (!p.voteTargetId) return `${p.name} has not voted.`;
    const t = byId(state, p.voteTargetId);
    return `${p.name} votes ${t.name}`;
  });
  return lines.join("\n");
}

export function lynchAnnouncement(state: GameState, target: PlayerState | null, tie: boolean, noVotes: boolean): string {
  if (noVotes) return "No votes were cast. The village wastes the day.";
  if (tie && !target) return "The vote is tied. Nobody is lynched.";
  if (!target) return "Nobody is lynched.";
  const revealed = state.settings.showRolesOnDeath
    ? ` They were ${roleLabel(target.roleId)}.`
    : "";
  return `The village executes ${target.name}.${revealed}`;
}
