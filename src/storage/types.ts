import type { GameSettings, GameState } from "@/game/types.ts";

export interface GameRecord {
  state: GameState | null;
  ownerTelegramId: number;
  pendingMessages: QueuedMessage[];
  lastUpdateId: number;
  processedUpdateIds: number[];
  sentChatIds: string[];
  draftSettings: Partial<GameSettings>;
  createdAt: number;
  cupidFirstId: string | null;
  lastDebug?: { at: number; error?: string; text?: string; updateId?: number };
}

export interface QueuedMessage {
  id: string;
  chatId: number;
  text: string;
  parseMode?: "HTML";
  keyboard?: unknown;
  sendAt: number;
  kind: "public" | "private";
  fromPlayerId?: string | null;
}

export const EMPTY_RECORD = (ownerTelegramId: number): GameRecord => ({
  state: null,
  ownerTelegramId,
  pendingMessages: [],
  lastUpdateId: 0,
  processedUpdateIds: [],
  sentChatIds: [],
  draftSettings: {},
  createdAt: Date.now(),
  cupidFirstId: null,
});
