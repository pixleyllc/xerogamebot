import { createGame } from "@/game/setup.ts";
import { applyEngineAction, startGame } from "@/game/engine.ts";
import { buildPrivateView, roleCardText } from "@/game/isolation.ts";
import { driveNpcsUntilHuman } from "@/ai/npc-engine.ts";
import { createProviderFromEnv, withFallback, type ProviderEnv } from "@/ai/index.ts";
import { BOT_NAME } from "@/brand.ts";
import type { PlayerCount } from "@/game/types.ts";
import { PLAYER_COUNTS } from "@/game/types.ts";
import type { GameRecord, QueuedMessage } from "@/storage/types.ts";
import type { TelegramApi } from "@/telegram/api.ts";
import type { TelegramCallbackQuery, TelegramMessage, TelegramUpdate } from "@/telegram/types.ts";
import {
  escapeHtml,
  formatHelp,
  formatLiving,
  formatPrompt,
  formatRoster,
  formatStatus,
  START_TEXT,
} from "@/telegram/format.ts";
import {
  inGameKeyboard,
  lobbyKeyboard,
  menuKeyboard,
  promptKeyboard,
  settingsKeyboard,
} from "@/telegram/keyboards.ts";
import { decodeCallback } from "@/utils/hmac.ts";
import { log, sleep } from "@/utils/logger.ts";
import { randomId } from "@/game/ids.ts";

export interface SessionEnv extends ProviderEnv {
  TELEGRAM_BOT_TOKEN: string;
  CALLBACK_SIGNING_SECRET?: string;
  TELEGRAM_WEBHOOK_SECRET?: string;
}

function secret(env: SessionEnv): string {
  return env.CALLBACK_SIGNING_SECRET || env.TELEGRAM_WEBHOOK_SECRET || env.TELEGRAM_BOT_TOKEN;
}

function seenUpdate(record: GameRecord, updateId: number): boolean {
  if (record.processedUpdateIds.includes(updateId)) return true;
  record.processedUpdateIds.push(updateId);
  if (record.processedUpdateIds.length > 200) {
    record.processedUpdateIds = record.processedUpdateIds.slice(-200);
  }
  record.lastUpdateId = Math.max(record.lastUpdateId, updateId);
  return false;
}

function enqueue(
  record: GameRecord,
  chatId: number,
  text: string,
  opts?: { keyboard?: unknown; delayMs?: number; parseMode?: "HTML" },
) {
  const msg: QueuedMessage = {
    id: randomId("q"),
    chatId,
    text,
    parseMode: opts?.parseMode ?? "HTML",
    keyboard: opts?.keyboard,
    sendAt: Date.now() + (opts?.delayMs ?? 0),
    kind: "public",
  };
  record.pendingMessages.push(msg);
}

function enqueueNewChat(record: GameRecord, chatId: number) {
  if (!record.state) return;
  for (const m of record.state.chat) {
    if (record.sentChatIds.includes(m.id)) continue;
    if (m.privateToPlayerId && m.privateToPlayerId !== record.state.humanPlayerId) continue;
    record.sentChatIds.push(m.id);
    if (record.sentChatIds.length > 400) {
      record.sentChatIds = record.sentChatIds.slice(-400);
    }
    const prefix =
      m.kind === "player" || m.kind === "moderator"
        ? `<b>${escapeHtml(m.authorName)}</b>\n`
        : "";
    enqueue(record, chatId, prefix + escapeHtml(m.text), {
      delayMs: m.kind === "player" ? record.state.settings.discussionMessageDelayMs : 0,
    });
  }
}

export async function flushQueue(record: GameRecord, api: TelegramApi) {
  const now = Date.now();
  const ready = record.pendingMessages.filter((m) => m.sendAt <= now);
  record.pendingMessages = record.pendingMessages.filter((m) => m.sendAt > now);
  for (const m of ready) {
    try {
      await api.sendMessage({
        chat_id: m.chatId,
        text: m.text,
        parse_mode: m.parseMode,
        reply_markup: m.keyboard as never,
      });
      await sleep(40);
    } catch (err) {
      log("warn", "send failed", { err: String(err) });
      const why = String(err);
      if (/BUTTON_DATA_INVALID|reply_markup/i.test(why) && m.keyboard) {
        m.keyboard = undefined;
        m.sendAt = Date.now();
        record.pendingMessages.push(m);
        continue;
      }
      m.sendAt = Date.now() + 1500;
      record.pendingMessages.push(m);
    }
  }
}

function displayName(msgFrom: { first_name: string; last_name?: string; username?: string }): string {
  return [msgFrom.first_name, msgFrom.last_name].filter(Boolean).join(" ") || msgFrom.username || "Player";
}

async function sendHome(record: GameRecord, env: SessionEnv, chatId: number, userId: number) {
  try {
    const kb = await menuKeyboard(secret(env), userId, record.state?.id ?? "lobby");
    enqueue(record, chatId, START_TEXT, { keyboard: kb });
  } catch (err) {
    log("error", "menu keyboard failed", { err: String(err) });
    enqueue(record, chatId, START_TEXT);
  }
}

async function promptIfNeeded(record: GameRecord, env: SessionEnv, chatId: number, userId: number) {
  const state = record.state;
  if (!state?.humanPrompt) return;
  const kb = await promptKeyboard(secret(env), userId, state.id, state.humanPrompt);
  enqueue(record, chatId, formatPrompt(state.humanPrompt), { keyboard: kb });
}

async function afterEngine(record: GameRecord, env: SessionEnv, chatId: number, userId: number) {
  if (!record.state) return;
  const provider = withFallback(createProviderFromEnv(env));
  try {
    record.state = await driveNpcsUntilHuman(record.state, { provider });
  } catch (err) {
    log("error", "npc drive failed", { err: String(err) });
  }
  enqueueNewChat(record, chatId);
  await promptIfNeeded(record, env, chatId, userId);
}

async function startNewGame(
  record: GameRecord,
  env: SessionEnv,
  userId: number,
  chatId: number,
  name: string,
  mode: "classic" | "chaos",
  count: PlayerCount,
) {
  const state = createGame({
    humanName: name,
    humanTelegramId: userId,
    playerCount: count,
    mode,
    settings: record.draftSettings,
  });
  record.state = startGame(state).state;
  record.sentChatIds = [];
  record.cupidFirstId = null;
  await afterEngine(record, env, chatId, userId);
}

export async function handleUpdate(
  record: GameRecord,
  env: SessionEnv,
  api: TelegramApi,
  update: TelegramUpdate,
): Promise<void> {
  if (seenUpdate(record, update.update_id)) return;

  if (update.callback_query) {
    await handleCallback(record, env, api, update.callback_query);
    await flushQueue(record, api);
    return;
  }
  const msg = update.message;
  if (!msg?.from || !msg.text) return;
  if (msg.chat.type !== "private") {
    enqueue(record, msg.chat.id, `${BOT_NAME} only plays in a private chat.`);
    await flushQueue(record, api);
    return;
  }
  if (record.ownerTelegramId && record.ownerTelegramId !== msg.from.id) {
    return;
  }
  record.ownerTelegramId = msg.from.id;
  await handleMessage(record, env, msg);
  await flushQueue(record, api);
}

async function handleMessage(record: GameRecord, env: SessionEnv, msg: TelegramMessage) {
  const text = (msg.text ?? "").trim();
  const userId = msg.from!.id;
  const chatId = msg.chat.id;
  const name = displayName(msg.from!);
  const [cmd, ...rest] = text.split(/\s+/);
  const command = (cmd ?? "").split("@")[0]!.toLowerCase();

  if (command === "/start") {
    if (record.state && record.state.phase !== "gameOver") {
      enqueue(record, chatId, "A game is already in progress. /status to peek, /endgame to abandon.");
      await promptIfNeeded(record, env, chatId, userId);
      return;
    }
    await sendHome(record, env, chatId, userId);
    return;
  }
  if (command === "/help") {
    enqueue(record, chatId, formatHelp());
    return;
  }
  if (command === "/newgame" || command === "/solo") {
    if (record.state && record.state.phase !== "gameOver") {
      enqueue(record, chatId, "Finish or /endgame the current table first.");
      return;
    }
    const kb = await lobbyKeyboard(secret(env), userId, "lobby");
    enqueue(record, chatId, "Choose a mode and table size.", { keyboard: kb });
    return;
  }
  if (command === "/endgame") {
    record.state = null;
    enqueue(record, chatId, "Game abandoned.");
    await sendHome(record, env, chatId, userId);
    return;
  }
  if (command === "/status") {
    if (!record.state) {
      enqueue(record, chatId, "No game in progress. /solo to start.");
      return;
    }
    enqueue(record, chatId, formatStatus(record.state));
    return;
  }
  if (command === "/players") {
    if (!record.state) {
      enqueue(record, chatId, "No game in progress.");
      return;
    }
    enqueue(record, chatId, formatRoster(record.state.players, record.state.phase === "gameOver"));
    return;
  }
  if (command === "/role") {
    if (!record.state) {
      enqueue(record, chatId, "No game in progress.");
      return;
    }
    const view = buildPrivateView(record.state, record.state.humanPlayerId);
    enqueue(record, chatId, escapeHtml(roleCardText(view)));
    return;
  }
  if (command === "/say") {
    if (!record.state) return;
    const said = rest.join(" ").trim();
    if (!said) {
      enqueue(record, chatId, "Usage: /say I think Mateo is lying.");
      return;
    }
    applyEngineAction(record.state, {
      type: "say",
      actorId: record.state.humanPlayerId,
      text: said,
    });
    await afterEngine(record, env, chatId, userId);
    return;
  }
  if (command === "/vote" || command === "/night") {
    if (!record.state) return;
    await promptIfNeeded(record, env, chatId, userId);
    return;
  }

  if (
    record.state &&
    record.state.phase === "discussion" &&
    record.state.settings.allowOrdinaryTextAsSay &&
    !command.startsWith("/")
  ) {
    applyEngineAction(record.state, {
      type: "say",
      actorId: record.state.humanPlayerId,
      text,
    });
    await afterEngine(record, env, chatId, userId);
    return;
  }

  if (!record.state) {
    await sendHome(record, env, chatId, userId);
    return;
  }

  enqueue(record, chatId, formatLiving(record.state));
  const kb = await inGameKeyboard(secret(env), userId, record.state.id);
  enqueue(record, chatId, formatStatus(record.state), { keyboard: kb });
}

async function handleCallback(
  record: GameRecord,
  env: SessionEnv,
  api: TelegramApi,
  q: TelegramCallbackQuery,
) {
  const chatId = q.message?.chat.id ?? q.from.id;
  const userId = q.from.id;
  try {
    await api.answerCallback(q.id);
  } catch {
    /* already answered */
  }
  const payload = await decodeCallback(q.data ?? "", secret(env), userId);
  if (!payload) {
    enqueue(record, chatId, "That button expired. Open a fresh one with /status.");
    return;
  }
  const action = payload.action;
  const targetId = payload.targetId;
  const target2Id = payload.target2Id;

  if (action === "menu:new") {
    if (record.state && record.state.phase !== "gameOver") {
      enqueue(record, chatId, "Finish or /endgame the current table first.");
      return;
    }
    const kb = await lobbyKeyboard(secret(env), userId, "lobby");
    enqueue(record, chatId, "Choose a mode and table size.", { keyboard: kb });
    return;
  }
  if (action === "menu:help") {
    enqueue(record, chatId, formatHelp());
    return;
  }
  if (action === "menu:settings") {
    const kb = await settingsKeyboard(secret(env), userId, "lobby");
    enqueue(record, chatId, "Settings.", { keyboard: kb });
    return;
  }
  if (action === "menu:home") {
    if (record.state && record.state.phase !== "gameOver") {
      enqueue(record, chatId, formatStatus(record.state));
      await promptIfNeeded(record, env, chatId, userId);
      return;
    }
    await sendHome(record, env, chatId, userId);
    return;
  }

  if (action.startsWith("start:")) {
    const parts = action.split(":");
    const mode = parts[1] === "chaos" ? "chaos" : "classic";
    const n = Number(parts[2]) as PlayerCount;
    if (!PLAYER_COUNTS.includes(n)) return;
    if (record.state && record.state.phase !== "gameOver") {
      enqueue(record, chatId, "Finish or /endgame the current table first.");
      return;
    }
    await startNewGame(record, env, userId, chatId, displayName(q.from), mode, n);
    return;
  }

  if (action.startsWith("set:")) {
    const parts = action.split(":");
    if (parts[1] === "votes" && (parts[2] === "public" || parts[2] === "hidden")) {
      record.draftSettings = { ...record.draftSettings, voteVisibility: parts[2] };
    }
    if (parts[1] === "tie" && (parts[2] === "none" || parts[2] === "random")) {
      record.draftSettings = { ...record.draftSettings, tieBreak: parts[2] };
    }
    const kb = await settingsKeyboard(secret(env), userId, "lobby");
    enqueue(record, chatId, "Saved.", { keyboard: kb });
    return;
  }

  if (action === "game:leave") {
    record.state = null;
    record.cupidFirstId = null;
    enqueue(record, chatId, "Game abandoned.");
    await sendHome(record, env, chatId, userId);
    return;
  }

  if (!record.state) {
    enqueue(record, chatId, "No game in progress. /solo to start.");
    return;
  }

  if (action === "game:players") {
    enqueue(record, chatId, formatRoster(record.state.players, record.state.phase === "gameOver"));
    return;
  }
  if (action === "game:role") {
    const view = buildPrivateView(record.state, record.state.humanPlayerId);
    enqueue(record, chatId, escapeHtml(roleCardText(view)));
    return;
  }
  if (action === "game:history") {
    const lines = record.state.events.slice(-12).map((e) => e.text).join("\n\n");
    enqueue(record, chatId, lines || "Nothing yet.");
    return;
  }

  if (action === "skip") {
    applyEngineAction(record.state, {
      type: record.state.phase === "discussion" ? "advance" : "skip",
      actorId: record.state.humanPlayerId,
    });
    await afterEngine(record, env, chatId, userId);
    return;
  }

  if (action.startsWith("pick:") && targetId) {
    const kind = action.slice("pick:".length);
    if (kind === "cupid") {
      if (!record.cupidFirstId) {
        record.cupidFirstId = targetId;
        enqueue(record, chatId, "First lover chosen. Pick the second.");
        await promptIfNeeded(record, env, chatId, userId);
        return;
      }
      applyEngineAction(record.state, {
        type: "nightCupid",
        actorId: record.state.humanPlayerId,
        targetId: record.cupidFirstId,
        target2Id: target2Id || targetId,
      });
      record.cupidFirstId = null;
    } else if (kind === "night") {
      applyEngineAction(record.state, {
        type: "nightTarget",
        actorId: record.state.humanPlayerId,
        targetId,
      });
    } else if (kind === "vote") {
      applyEngineAction(record.state, {
        type: "vote",
        actorId: record.state.humanPlayerId,
        targetId,
      });
    } else if (kind === "hunterShot") {
      applyEngineAction(record.state, {
        type: "hunterShot",
        actorId: record.state.humanPlayerId,
        targetId,
      });
    } else if (kind === "discussion" || kind === "continue") {
      applyEngineAction(record.state, {
        type: "advance",
        actorId: record.state.humanPlayerId,
      });
    }
    await afterEngine(record, env, chatId, userId);
  }
}
