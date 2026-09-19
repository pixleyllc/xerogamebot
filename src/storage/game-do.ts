import { EMPTY_RECORD, type GameRecord } from "@/storage/types.ts";
import { TelegramApi, parseUpdate } from "@/telegram/api.ts";
import { flushQueue, handleUpdate, type SessionEnv } from "@/telegram/session.ts";
import { log } from "@/utils/logger.ts";

const RECORD_KEY = "record";

export class GameDurableObject {
  private record: GameRecord | null = null;
  private ctx: DurableObjectState;
  private env: WorkerEnv;

  constructor(ctx: DurableObjectState, env: WorkerEnv) {
    this.ctx = ctx;
    this.env = env;
  }

  private sessionEnv(): SessionEnv {
    return this.env as unknown as SessionEnv;
  }

  private async load(): Promise<GameRecord> {
    if (this.record) return this.record;
    const stored = await this.ctx.storage.get<GameRecord>(RECORD_KEY);
    this.record = stored ?? EMPTY_RECORD(0);
    return this.record;
  }

  private async save() {
    if (this.record) await this.ctx.storage.put(RECORD_KEY, this.record);
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const record = await this.load();

    if (url.pathname.endsWith("/alarm-flush") || request.headers.get("x-do-alarm") === "1") {
      const api = new TelegramApi(this.env.TELEGRAM_BOT_TOKEN);
      await flushQueue(record, api);
      await this.save();
      await this.scheduleAlarm();
      return new Response("ok");
    }

    if (request.method !== "POST") {
      return new Response(JSON.stringify({ phase: record.state?.phase ?? "lobby" }), {
        headers: { "content-type": "application/json" },
      });
    }

    const body = await request.json().catch(() => null);
    const update = parseUpdate(body);
    if (!update) return new Response("invalid update", { status: 400 });

    const api = new TelegramApi(this.env.TELEGRAM_BOT_TOKEN);
    try {
      await handleUpdate(record, this.sessionEnv(), api, update);
    } catch (err) {
      log("error", "handleUpdate failed", { err: String(err) });
    }
    await this.save();
    await this.scheduleAlarm();
    return new Response("ok");
  }

  async alarm() {
    const record = await this.load();
    if (!this.env.TELEGRAM_BOT_TOKEN) return;
    const api = new TelegramApi(this.env.TELEGRAM_BOT_TOKEN);
    await flushQueue(record, api);
    await this.save();
    await this.scheduleAlarm();
  }

  private async scheduleAlarm() {
    const record = this.record;
    if (!record?.pendingMessages.length) {
      await this.ctx.storage.deleteAlarm();
      return;
    }
    const next = Math.min(...record.pendingMessages.map((m) => m.sendAt));
    await this.ctx.storage.setAlarm(next);
  }
}
