import { GameDurableObject } from "@/storage/game-do.ts";
import { TelegramApi } from "@/telegram/api.ts";
import { routeTelegramWebhook } from "@/telegram/webhook.ts";
import { BOT_NAME } from "@/brand.ts";
import { log } from "@/utils/logger.ts";

export { GameDurableObject };

function authorizeSetup(request: Request, env: WorkerEnv): boolean {
  const expected = env.CALLBACK_SIGNING_SECRET || env.TELEGRAM_WEBHOOK_SECRET;
  if (!expected) return false;
  const header = request.headers.get("authorization");
  return header === `Bearer ${expected}`;
}

export default {
  async fetch(request: Request, env: WorkerEnv, _ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/health") {
      return Response.json({
        ok: true,
        service: "xerogamebot",
        bot: BOT_NAME,
        hasToken: Boolean(env.TELEGRAM_BOT_TOKEN),
        hasWebhookSecret: Boolean(env.TELEGRAM_WEBHOOK_SECRET),
      });
    }

    if (url.pathname === "/telegram/webhook") {
      return routeTelegramWebhook(request, env);
    }

    if (url.pathname === "/telegram/setup") {
      if (!authorizeSetup(request, env)) {
        return new Response("unauthorized", { status: 401 });
      }
      if (!env.TELEGRAM_BOT_TOKEN) {
        return Response.json({ ok: false, error: "TELEGRAM_BOT_TOKEN missing" }, { status: 500 });
      }
      const api = new TelegramApi(env.TELEGRAM_BOT_TOKEN);
      if (request.method === "GET") {
        const [me, webhook] = await Promise.all([api.getMe(), api.getWebhookInfo()]);
        return Response.json({ ok: true, me, webhook });
      }
      if (request.method === "POST") {
        const hookUrl = `${url.origin}/telegram/webhook`;
        const result = await api.setWebhook(hookUrl, env.TELEGRAM_WEBHOOK_SECRET);
        log("info", "telegram webhook registered", { hookUrl });
        return Response.json({ ok: true, result, hookUrl });
      }
      return new Response("method not allowed", { status: 405 });
    }

    if (url.pathname === "/") {
      return new Response(
        `${BOT_NAME} Telegram bot. POST /telegram/webhook · GET /health`,
        { headers: { "content-type": "text/plain; charset=utf-8" } },
      );
    }

    return new Response("not found", { status: 404 });
  },
};
