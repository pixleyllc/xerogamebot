import type {
  GameState,
  MemoryFact,
  NpcMemory,
  PlayerState,
  PublicEvent,
} from "@/game/types.ts";
import { randomId } from "@/game/ids.ts";
import type { Rng } from "@/game/rng.ts";

export function emptyMemory(
  playerId: string,
  otherIds: string[],
  rng?: Rng,
): NpcMemory {
  const beliefs: Record<string, number> = {};
  const trust: Record<string, number> = {};
  for (const id of otherIds) {
    beliefs[id] = rng ? 0.06 + rng.next() * 0.58 : 0.35;
    trust[id] = rng ? 0.16 + rng.next() * 0.68 : 0.5;
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
    privateHunch: "No read yet.",
    hunchTargetId: null,
    saidFingerprints: [],
  };
}

/**
 * Give every NPC a unique opening mind so they do not all pile onto
 * the first living player with a 0.35 belief.
 */
export function seedNpcMinds(state: GameState, rng: Rng) {
  for (const player of state.players) {
    if (player.isHuman) continue;
    const memory = state.memories[player.id];
    if (!memory) continue;
    const others = state.players.filter((p) => p.id !== player.id);
    if (!others.length) continue;

    const villageOthers = others.filter((p) => p.roleId !== player.roleId);

    if (player.roleId === "werewolf") {
      for (const o of others) {
        if (o.roleId === "werewolf") {
          memory.beliefs[o.id] = 0.02;
          memory.trust[o.id] = 0.9 + rng.next() * 0.08;
        }
      }
      const framePool = villageOthers.length ? villageOthers : others;
      const frame = rng.pick(framePool);
      memory.beliefs[frame.id] = Math.min(
        0.92,
        (memory.beliefs[frame.id] ?? 0.4) + 0.18 + rng.next() * 0.28,
      );
      memory.hunchTargetId = frame.id;
      memory.privateHunch = rng.pick([
        `Dump heat on ${frame.name}. Keep the pack boring.`,
        `${frame.name} is the story we sell. Do not oversell it.`,
        `If the village wants a name, make it ${frame.name}.`,
        `Ride whoever else names ${frame.name}. Don't be first unless you have to.`,
      ]);
    } else if (player.roleId === "serialKiller") {
      const prey = rng.pick(others);
      memory.hunchTargetId = prey.id;
      memory.beliefs[prey.id] = Math.min(0.8, (memory.beliefs[prey.id] ?? 0.4) + 0.1);
      memory.privateHunch = rng.pick([
        `Make ${prey.name}'s death look like wolves if the night goes that way.`,
        `Stay small. Let the wolves eat each other. ${prey.name} is convenient.`,
        `Do not look like the loudest killer. ${prey.name} is just meat.`,
      ]);
    } else if (player.roleId === "tanner") {
      const foil = rng.pick(others);
      memory.hunchTargetId = foil.id;
      memory.privateHunch = rng.pick([
        `Get yourself lynched without begging. Use ${foil.name} as contrast.`,
        `Look sloppy enough to hang. Do not confess. Needles toward ${foil.name} then back to you.`,
        `If they want a wolf, make them waste a day on you.`,
      ]);
    } else if (player.roleId === "seer" || player.roleId === "fool") {
      const curious = rng.pick(others);
      memory.hunchTargetId = curious.id;
      memory.privateHunch = rng.pick([
        `Night 1 read on ${curious.name}. Do not claim unless the table is dying.`,
        `${curious.name} is first on the glass. Keep the result close.`,
        `Look village, poke ${curious.name}, do not speech-claim seer day 1.`,
      ]);
    } else if (player.roleId === "cultist") {
      const convert = rng.pick(villageOthers.length ? villageOthers : others);
      memory.hunchTargetId = convert.id;
      memory.privateHunch = `Recruit ${convert.name} if the night allows. Don't look coordinated.`;
    } else if (player.roleId === "cupid") {
      const a = rng.pick(others);
      const b = rng.pick(others.filter((o) => o.id !== a.id).length ? others.filter((o) => o.id !== a.id) : others);
      memory.hunchTargetId = a.id;
      memory.privateHunch = `Pair ${a.name} with ${b.name}. Then play like a villager.`;
    } else {
      const hot = rng.pick(others);
      const coldPool = others.filter((o) => o.id !== hot.id);
      const cold = coldPool.length ? rng.pick(coldPool) : hot;
      memory.beliefs[hot.id] = Math.min(
        0.9,
        (memory.beliefs[hot.id] ?? 0.35) + 0.12 + rng.next() * 0.32,
      );
      memory.beliefs[cold.id] = Math.max(
        0.04,
        (memory.beliefs[cold.id] ?? 0.35) - 0.08 - rng.next() * 0.22,
      );
      memory.trust[cold.id] = Math.min(0.88, (memory.trust[cold.id] ?? 0.5) + 0.12);
      memory.hunchTargetId = hot.id;
      memory.privateHunch = rng.pick([
        `${hot.name} already feels like they want a name in the air.`,
        `First gut is ${hot.name}. I might dump it. ${cold.name} feels softer.`,
        `${hot.name} sat too still on intros. Could be nothing.`,
        `If anyone is wolf, start at ${hot.name} or whoever defends them.`,
        `I do not like ${hot.name}'s energy. Need a second tell before I lock.`,
        `${cold.name} can wait. ${hot.name} is the itch.`,
      ]);
    }
    memory.strategicSummary = memory.privateHunch;
  }
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
  if (memory.saidFingerprints.length > 24) {
    memory.saidFingerprints = memory.saidFingerprints.slice(-24);
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
    privateHunch: memory.privateHunch,
  };
}
