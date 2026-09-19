import { parseUpdate } from "@/telegram/api.ts";
import { log } from "@/utils/logger.ts";

export function verifyTelegramSecret(request: Request, secret: string | undefined): boolean {
  if (!secret) return true;
  const header = request.headers.get("X-Telegram-Bot-Api-Secret-Token");
  return header === secret;
}

export async function routeTelegramWebhook(
  request: Request,
  env: WorkerEnv,
): Promise<Response> {
  if (request.method !== "POST") {
    return new Response("method not allowed", { status: 405 });
  }
  if (!verifyTelegramSecret(request, env.TELEGRAM_WEBHOOK_SECRET)) {
    log("warn", "telegram webhook secret mismatch");
    return new Response("unauthorized", { status: 401 });
  }
  if (!env.TELEGRAM_BOT_TOKEN) {
    log("error", "TELEGRAM_BOT_TOKEN missing");
    return new Response("bot token missing", { status: 500 });
  }
  const body = await request.json().catch(() => null);
  const update = parseUpdate(body);
  if (!update) {
    log("warn", "telegram webhook body was not a valid update");
    return new Response("ok");
  }

  const from =
    update.message?.from?.id ??
    update.callback_query?.from.id ??
    update.edited_message?.from?.id;
  if (!from) {
    log("info", "telegram update ignored (no from)", { updateId: update.update_id });
    return new Response("ok");
  }

  log("info", "telegram update", {
    updateId: update.update_id,
    from,
    hasMessage: Boolean(update.message),
    hasCallback: Boolean(update.callback_query),
  });

  const id = env.GAME.idFromName(`user:${from}`);
  const stub = env.GAME.get(id);
  try {
    const res = await stub.fetch(new Request("https://do/telegram", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(update),
    }));
    if (!res.ok) {
      log("error", "durable object returned non-ok", { status: res.status });
    }
  } catch (err) {
    log("error", "durable object fetch failed", { err: String(err) });
    return new Response("ok");
  }
  return new Response("ok");
}
