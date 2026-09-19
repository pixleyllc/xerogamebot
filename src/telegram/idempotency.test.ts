import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { EMPTY_RECORD } from "@/storage/types.ts";
import { handleUpdate, type SessionEnv } from "@/telegram/session.ts";
import type { TelegramApi } from "@/telegram/api.ts";
import { signPayload } from "@/utils/hmac.ts";
import { decodeCallback, encodeCallback } from "@/utils/hmac.ts";

function mockApi(): TelegramApi {
  const sent: unknown[] = [];
  return {
    sent,
    async sendMessage(req: unknown) {
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
  } as unknown as TelegramApi & { sent: unknown[] };
}

const env: SessionEnv = {
  TELEGRAM_BOT_TOKEN: "test-token",
  CALLBACK_SIGNING_SECRET: "callback-secret",
  AI_PROVIDER: "fallback",
};

describe("telegram idempotency and security", () => {
  it("ignores duplicate update ids", async () => {
    const record = EMPTY_RECORD(42);
    const api = mockApi() as TelegramApi & { sent: unknown[] };
    const update = {
      update_id: 9,
      message: {
        message_id: 1,
        date: 1,
        text: "/start",
        from: { id: 42, first_name: "Zack" },
        chat: { id: 42, type: "private" as const },
      },
    };
    await handleUpdate(record, env, api, update);
    const n = api.sent.length;
    await handleUpdate(record, env, api, update);
    assert.equal(api.sent.length, n);
  });

  it("rejects forged callback payloads", async () => {
    const ok = await encodeCallback(
      { gameId: "g", userId: 1, action: "vote", targetId: "npc-1" },
      "secret",
    );
    const forged = await decodeCallback(ok, "other-secret", 1);
    assert.equal(forged, null);
    const wrongUser = await decodeCallback(ok, "secret", 99);
    assert.equal(wrongUser, null);
    const real = await decodeCallback(ok, "secret", 1);
    assert.equal(real?.action, "vote");
  });

  it("hmac sign is stable", async () => {
    const a = await signPayload("hello", "k");
    const b = await signPayload("hello", "k");
    assert.equal(a, b);
  });
});
