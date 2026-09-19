import { GameDurableObject } from "@/storage/game-do.ts";
import { TelegramApi } from "@/telegram/api.ts";
import { routeTelegramWebhook } from "@/telegram/webhook.ts";
import { BOT_NAME } from "@/brand.ts";

export { GameDurableObject };

export default {
  async fetch(request: Request, env: WorkerEnv, _ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/health") {
      return Response.json({ ok: true, service: "solo-werewolf" });
    }

    if (url.pathname === "/telegram/webhook") {
      return routeTelegramWebhook(request, env);
    }

    if (url.pathname === "/telegram/setup" && request.method === "POST") {
      const header = request.headers.get("authorization");
      const expected = env.CALLBACK_SIGNING_SECRET || env.TELEGRAM_WEBHOOK_SECRET;
      if (!expected || header !== `Bearer ${expected}`) {
        return new Response("unauthorized", { status: 401 });
      }
      const api = new TelegramApi(env.TELEGRAM_BOT_TOKEN);
      const hookUrl = `${url.origin}/telegram/webhook`;
      const result = await api.setWebhook(hookUrl, env.TELEGRAM_WEBHOOK_SECRET);
      return Response.json({ ok: true, result, hookUrl });
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
