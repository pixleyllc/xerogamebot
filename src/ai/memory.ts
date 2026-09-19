import type {
  GameState,
  MemoryFact,
  NpcMemory,
  PlayerState,
  PublicEvent,
} from "@/game/types.ts";
import { randomId } from "@/game/ids.ts";

export function emptyMemory(playerId: string, otherIds: string[]): NpcMemory {
  const beliefs: Record<string, number> = {};
  const trust: Record<string, number> = {};
  for (const id of otherIds) {
    beliefs[id] = 0.35;
    trust[id] = 0.5;
  }
  return {
    playerId,
    beliefs,
    trust,
    facts: [],
    shortTerm: [],
    strategicSummary: "The game has just begun. No strong reads yet.",
    accusationHistory: [],
    voteHistory: [],
    intendedVoteId: null,
  };
}

export function rememberFact(memory: NpcMemory, fact: Omit<MemoryFact, "id">, cap = 24) {
  memory.facts.push({ id: randomId("fact"), ...fact });
  if (memory.facts.length > cap) {
    memory.facts = memory.facts.slice(-cap);
  }
}

export function bumpBelief(
  memory: NpcMemory,
  targetId: string,
  delta: number,
  strength: number,
) {
  const current = memory.beliefs[targetId] ?? 0.35;
  const next = current + delta * Math.max(0.15, strength);
  memory.beliefs[targetId] = Math.max(0.02, Math.min(0.98, next));
}

export function bumpTrust(
  memory: NpcMemory,
  targetId: string,
  delta: number,
  strength: number,
) {
  const current = memory.trust[targetId] ?? 0.5;
  memory.trust[targetId] = Math.max(
    0.02,
    Math.min(0.98, current + delta * Math.max(0.15, strength)),
  );
}

export function applyPublicEventToMemories(state: GameState, event: PublicEvent) {
  for (const player of state.players) {
    if (player.isHuman) continue;
    const memory = state.memories[player.id];
    if (!memory) continue;
    const str = player.personality.memoryStrength;

    rememberFact(memory, {
      day: event.day,
      night: event.night,
      text: event.text,
      kind:
        event.kind === "death"
          ? "death"
          : event.kind === "vote" || event.kind === "lynch"
            ? "vote"
            : event.kind === "statement"
              ? "statement"
              : event.kind === "roleReveal"
                ? "reveal"
                : "public",
      aboutPlayerIds: event.relatedPlayerIds,
    });

    memory.shortTerm.push(event.text);
    if (memory.shortTerm.length > 8) {
      memory.shortTerm = memory.shortTerm.slice(-8);
    }

    if (event.kind === "death") {
      for (const id of event.relatedPlayerIds) {
        if (id === player.id) continue;
        bumpBelief(memory, id, -0.04, str);
      }
    }
    if (event.kind === "vote" && event.speakerId && event.relatedPlayerIds[0]) {
      const target = event.relatedPlayerIds[0];
      if (event.speakerId === player.id) {
        memory.voteHistory.push({ day: event.day, targetId: target });
      } else if (target === player.id) {
        bumpTrust(memory, event.speakerId, -0.12, str);
        bumpBelief(memory, event.speakerId, 0.06, str);
      }
    }
  }
}

export function recordAccusation(
  state: GameState,
  speaker: PlayerState,
  targetId: string,
  text: string,
) {
  const memory = state.memories[speaker.id];
  if (!memory) return;
  memory.accusationHistory.push({ day: state.day, targetId, text });
  bumpBelief(memory, targetId, 0.08, speaker.personality.analytical);
}

export function pruneMemory(memory: NpcMemory) {
  if (memory.facts.length > 20) memory.facts = memory.facts.slice(-20);
  if (memory.shortTerm.length > 8) memory.shortTerm = memory.shortTerm.slice(-8);
  if (memory.accusationHistory.length > 12) {
    memory.accusationHistory = memory.accusationHistory.slice(-12);
  }
  if (memory.strategicSummary.length > 400) {
    memory.strategicSummary = memory.strategicSummary.slice(0, 400);
  }
}

export function summarizeMemoryForPrompt(memory: NpcMemory, nameOf: (id: string) => string) {
  const topSuspects = Object.entries(memory.beliefs)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([id, v]) => `${nameOf(id)}:${v.toFixed(2)}`)
    .join(", ");
  const facts = memory.facts
    .slice(-8)
    .map((f) => f.text)
    .join(" | ");
  return {
    beliefs: topSuspects,
    facts,
    shortTerm: memory.shortTerm.slice(-5),
    strategicSummary: memory.strategicSummary,
    intendedVoteId: memory.intendedVoteId,
  };
}
