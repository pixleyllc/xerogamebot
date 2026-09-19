import { BOT_NAME } from "@/brand.ts";
import { randomId } from "@/game/ids.ts";
import type {
  ChatMessage,
  GameState,
  Phase,
  PublicEvent,
} from "@/game/types.ts";
import { applyPublicEventToMemories } from "@/ai/memory.ts";

export function stamp(state: GameState) {
  state.updatedAt = Date.now();
  state.version += 1;
}

export function pushEvent(
  state: GameState,
  partial: Omit<PublicEvent, "id" | "at" | "day" | "night"> & {
    day?: number;
    night?: number;
  },
): PublicEvent {
  const event: PublicEvent = {
    id: randomId("ev"),
    at: Date.now(),
    day: partial.day ?? state.day,
    night: partial.night ?? state.night,
    phase: partial.phase,
    kind: partial.kind,
    text: partial.text,
    speakerId: partial.speakerId,
    speakerName: partial.speakerName,
    relatedPlayerIds: partial.relatedPlayerIds,
    meta: partial.meta,
  };
  state.events.push(event);
  applyPublicEventToMemories(state, event);
  return event;
}

export function pushChat(
  state: GameState,
  msg: Omit<ChatMessage, "id" | "at">,
): ChatMessage {
  const full: ChatMessage = {
    id: randomId("msg"),
    at: Date.now(),
    ...msg,
  };
  state.chat.push(full);
  return full;
}

export function moderator(
  state: GameState,
  text: string,
  extra?: { privateTo?: string; phase?: Phase; kind?: PublicEvent["kind"]; related?: string[] },
): ChatMessage {
  if (!extra?.privateTo) {
    pushEvent(state, {
      phase: extra?.phase ?? state.phase,
      kind: extra?.kind ?? "system",
      text,
      speakerId: "moderator",
      speakerName: BOT_NAME,
      relatedPlayerIds: extra?.related ?? [],
    });
  }
  return pushChat(state, {
    authorId: "moderator",
    authorName: BOT_NAME,
    kind: extra?.privateTo ? "whisper" : "moderator",
    text,
    privateToPlayerId: extra?.privateTo ?? null,
  });
}

export function playerSay(
  state: GameState,
  playerId: string,
  text: string,
): ChatMessage {
  const player = state.players.find((p) => p.id === playerId);
  if (!player) throw new Error("Unknown speaker");
  pushEvent(state, {
    phase: state.phase,
    kind: "statement",
    text: `${player.name}: ${text}`,
    speakerId: player.id,
    speakerName: player.name,
    relatedPlayerIds: [player.id],
  });
  return pushChat(state, {
    authorId: player.id,
    authorName: player.name,
    kind: "player",
    text,
    privateToPlayerId: null,
  });
}

export function whisper(
  state: GameState,
  playerId: string,
  text: string,
): ChatMessage {
  return pushChat(state, {
    authorId: "moderator",
    authorName: BOT_NAME,
    kind: "whisper",
    text,
    privateToPlayerId: playerId,
  });
}
