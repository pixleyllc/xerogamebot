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
    return new Response("unauthorized", { status: 401 });
  }
  if (!env.TELEGRAM_BOT_TOKEN) {
    return new Response("bot token missing", { status: 500 });
  }
  const body = await request.json().catch(() => null);
  const update = parseUpdate(body);
  if (!update) return new Response("ok");

  const from =
    update.message?.from?.id ??
    update.callback_query?.from.id ??
    update.edited_message?.from?.id;
  if (!from) return new Response("ok");

  const id = env.GAME.idFromName(`user:${from}`);
  const stub = env.GAME.get(id);
  try {
    await stub.fetch(new Request("https://do/telegram", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(update),
    }));
  } catch (err) {
    log("error", "durable object fetch failed", { err: String(err) });
    return new Response("ok");
  }
  return new Response("ok");
}
