import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createGame } from "@/game/setup.ts";
import { applyEngineAction, beginDiscussion, startGame } from "@/game/engine.ts";
import { EMPTY_RECORD } from "@/storage/types.ts";
import { flushQueue, handleUpdate, type SessionEnv } from "@/telegram/session.ts";
import type { TelegramApi } from "@/telegram/api.ts";
import { encodeCallback } from "@/utils/hmac.ts";
import { BOT_NAME } from "@/brand.ts";

function mockApi(): TelegramApi & { sent: Array<{ text?: string }> } {
  const sent: Array<{ text?: string }> = [];
  return {
    sent,
    async sendMessage(req: { text?: string }) {
      sent.push(req);
      return { message_id: sent.length };
    },
    async answerCallback() {
      return true;
    },
    async call() {
      return {} as never;
    },
    async setWebhook() {
      return true;
    },
    async deleteWebhook() {
      return true;
    },
    async getMe() {
      return { id: 1, username: "bot", first_name: "Bot" };
    },
  } as unknown as TelegramApi & { sent: Array<{ text?: string }> };
}

const env: SessionEnv = {
  TELEGRAM_BOT_TOKEN: "test-token",
  CALLBACK_SIGNING_SECRET: "callback-secret",
  AI_PROVIDER: "fallback",
};

function npcNames(record: ReturnType<typeof EMPTY_RECORD>): Set<string> {
  return new Set((record.state?.players ?? []).filter((p) => !p.isHuman).map((p) => p.name));
}

function sentNpcTalk(api: { sent: Array<{ text?: string }> }, names: Set<string>): string[] {
  return api.sent
    .map((m) => m.text ?? "")
    .filter((t) => {
      const bold = t.match(/^<b>([^<]+)<\/b>\n/);
      return Boolean(bold && names.has(bold[1]!));
    });
}

describe("telegram silence during vote and day-end report", () => {
  it("drops leftover NPC chatter when the vote opens and stays quiet through the report", async () => {
    const record = EMPTY_RECORD(42);
    record.ownerTelegramId = 42;
    let state = createGame({
      playerCount: 8,
      mode: "classic",
      seed: "tg-silence",
      humanName: "Zack",
      humanTelegramId: 42,
      forcedRoles: [
        "villager",
        "werewolf",
        "seer",
        "guardianAngel",
        "hunter",
        "villager",
        "villager",
        "villager",
      ],
    });
    state = startGame(state).state;
    for (const p of state.players) {
      p.isAlive = true;
      p.hasUsedNightAction = true;
    }
    state = beginDiscussion(state).state;
    const npc = state.players.find((p) => !p.isHuman)!;
    state = applyEngineAction(state, {
      type: "say",
      actorId: npc.id,
      text: "Lynch them before the report.",
    }).state;
    record.state = state;
    record.pendingMessages.push({
      id: "q-late",
      chatId: 42,
      text: `<b>${npc.name}</b>\nLynch them before the report.`,
      parseMode: "HTML",
      sendAt: Date.now() + 60_000,
      kind: "public",
      fromPlayerId: npc.id,
    });

    const api = mockApi();
    const skipData = await encodeCallback(
      { gameId: state.id, userId: 42, action: "skip" },
      env.CALLBACK_SIGNING_SECRET!,
    );
    await handleUpdate(record, env, api, {
      update_id: 101,
      callback_query: {
        id: "cb1",
        from: { id: 42, first_name: "Zack" },
        data: skipData,
        message: {
          message_id: 2,
          date: 2,
          chat: { id: 42, type: "private" },
        },
      },
    });

    assert.equal(record.state?.phase, "voting");
    assert.equal(
      record.pendingMessages.filter((m) => m.fromPlayerId === npc.id).length,
      0,
      "delayed NPC lines must be dropped when the vote opens",
    );
    const names = npcNames(record);
    assert.equal(sentNpcTalk(api, names).length, 0, "no NPC speeches on the vote-open turn");

    const target = record.state!.humanPrompt!.targets[0]!;
    const voteData = await encodeCallback(
      {
        gameId: record.state!.id,
        userId: 42,
        action: "pick:vote",
        targetId: target.id,
      },
      env.CALLBACK_SIGNING_SECRET!,
    );
    const sentBeforeVote = api.sent.length;
    await handleUpdate(record, env, api, {
      update_id: 102,
      callback_query: {
        id: "cb2",
        from: { id: 42, first_name: "Zack" },
        data: voteData,
        message: {
          message_id: 3,
          date: 3,
          chat: { id: 42, type: "private" },
        },
      },
    });

    const afterVote = api.sent.slice(sentBeforeVote).map((m) => m.text ?? "");
    assert.equal(sentNpcTalk({ sent: afterVote.map((text) => ({ text })) }, names).length, 0);
    assert.ok(
      afterVote.some((t) => /vote is open|votes |executes|wastes the day|tied|Night /i.test(t)),
      "moderator still posts the end-of-day report",
    );
    assert.ok(
      afterVote.every((t) => !t.includes("Lynch them before the report.")),
      "discussion leftover must not leak into the report",
    );
    assert.ok(record.state?.phase !== "voting");
  });

  it("flushQueue never delivers NPC talk outside discussion", async () => {
    const record = EMPTY_RECORD(42);
    let state = createGame({
      playerCount: 8,
      mode: "classic",
      seed: "flush-quiet",
      humanName: "Zack",
    });
    state = startGame(state).state;
    state.phase = "voting";
    const npc = state.players.find((p) => !p.isHuman)!;
    record.state = state;
    record.pendingMessages.push({
      id: "q-npc",
      chatId: 42,
      text: `<b>${npc.name}</b>\nWait I still have a take.`,
      parseMode: "HTML",
      sendAt: Date.now() - 10,
      kind: "public",
      fromPlayerId: npc.id,
    });
    record.pendingMessages.push({
      id: "q-mod",
      chatId: 42,
      text: `<b>${BOT_NAME}</b>\nThe vote is open. Who should be executed?`,
      parseMode: "HTML",
      sendAt: Date.now() - 10,
      kind: "public",
      fromPlayerId: null,
    });
    const api = mockApi();
    await flushQueue(record, api);
    assert.equal(api.sent.length, 1);
    assert.match(api.sent[0]!.text ?? "", /vote is open/);
  });
});
