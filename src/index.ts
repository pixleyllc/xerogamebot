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

async function ensureTelegramWebhook(env: WorkerEnv, origin: string) {
  if (!env.TELEGRAM_BOT_TOKEN) {
    return { ok: false as const, error: "TELEGRAM_BOT_TOKEN missing" };
  }
  const api = new TelegramApi(env.TELEGRAM_BOT_TOKEN);
  const hookUrl = `${origin}/telegram/webhook`;
  const [me, current] = await Promise.all([api.getMe(), api.getWebhookInfo()]);
  if (current.url === hookUrl) {
    return { ok: true as const, me, webhook: current, hookUrl, updated: false };
  }
  const result = await api.setWebhook(hookUrl, env.TELEGRAM_WEBHOOK_SECRET);
  log("info", "telegram webhook registered", { hookUrl });
  const webhook = await api.getWebhookInfo();
  return { ok: true as const, me, webhook, hookUrl, result, updated: true };
}

export default {
  async fetch(request: Request, env: WorkerEnv, _ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/health") {
      let telegram: unknown = null;
      let last: unknown = null;
      try {
        telegram = await ensureTelegramWebhook(env, url.origin);
      } catch (err) {
        telegram = { ok: false, error: String(err) };
      }
      try {
        const res = await env.GAME.get(env.GAME.idFromName("ops:last")).fetch(
          new Request("https://do/debug"),
        );
        last = await res.json().catch(() => null);
      } catch (err) {
        last = { error: String(err) };
      }
      return Response.json({
        ok: true,
        service: "xerogamebot",
        bot: BOT_NAME,
        hasToken: Boolean(env.TELEGRAM_BOT_TOKEN),
        hasWebhookSecret: Boolean(env.TELEGRAM_WEBHOOK_SECRET),
        telegram,
        last,
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
        try {
          const registered = await ensureTelegramWebhook(env, url.origin);
          return Response.json(registered);
        } catch (err) {
          return Response.json({ ok: false, error: String(err) }, { status: 500 });
        }
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
