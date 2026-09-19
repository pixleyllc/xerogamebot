import { sleep } from "@/utils/logger.ts";
import type { InlineKeyboardMarkup, SendMessageRequest, TelegramUpdate } from "@/telegram/types.ts";

export class TelegramApi {
  private token: string;
  private fetchFn: typeof fetch;

  constructor(token: string, fetchFn: typeof fetch = fetch) {
    this.token = token;
    this.fetchFn = fetchFn;
  }

  private url(method: string): string {
    return `https://api.telegram.org/bot${this.token}/${method}`;
  }

  async call<T>(method: string, body?: unknown): Promise<T> {
    let lastErr: unknown = null;
    for (let i = 0; i < 3; i++) {
      try {
        const res = await this.fetchFn(this.url(method), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: body ? JSON.stringify(body) : undefined,
        });
        if (res.status === 429) {
          const retry = Number(res.headers.get("retry-after") ?? "1");
          await sleep(Math.min(5000, (retry + 1) * 1000));
          continue;
        }
        const json = (await res.json()) as { ok: boolean; result: T; description?: string };
        if (!json.ok) throw new Error(json.description ?? `Telegram ${method} failed`);
        return json.result;
      } catch (err) {
        lastErr = err;
        await sleep(250 * (i + 1));
      }
    }
    throw lastErr instanceof Error ? lastErr : new Error("Telegram API failed");
  }

  sendMessage(req: SendMessageRequest) {
    return this.call("sendMessage", { disable_web_page_preview: true, ...req });
  }

  answerCallback(id: string, text?: string) {
    return this.call("answerCallbackQuery", { callback_query_id: id, text });
  }

  setWebhook(url: string, secret?: string) {
    return this.call("setWebhook", {
      url,
      secret_token: secret,
      allowed_updates: ["message", "callback_query"],
      drop_pending_updates: false,
    });
  }

  deleteWebhook() {
    return this.call("deleteWebhook", { drop_pending_updates: false });
  }

  getMe() {
    return this.call<{ id: number; username: string; first_name: string }>("getMe");
  }
}

export function chunkButtons(
  buttons: Array<{ text: string; callback_data: string }>,
  perRow = 2,
): InlineKeyboardMarkup {
  const rows: Array<Array<{ text: string; callback_data: string }>> = [];
  for (let i = 0; i < buttons.length; i += perRow) {
    rows.push(buttons.slice(i, i + perRow));
  }
  return { inline_keyboard: rows };
}

export function parseUpdate(data: unknown): TelegramUpdate | null {
  if (!data || typeof data !== "object") return null;
  const rec = data as { update_id?: unknown };
  if (typeof rec.update_id !== "number") return null;
  return data as TelegramUpdate;
}
