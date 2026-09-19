# xero. — Solo Werewolf

Repo: [pixleyllc/xerogamebot](https://github.com/pixleyllc/xerogamebot)

A **solo** Telegram Werewolf game: one human player, a table of AI villagers, and a moderator bot named **xero.** (the period is part of the name). Built for **Cloudflare Workers** with **Durable Objects**, a deterministic game engine, and a swappable LLM provider.

This is not a wrapper around [@werewolfbot](https://github.com/GreyWolfDev/Werewolf). It is a new engine that follows that project's documented rules for the v1 role set. Intentional differences: [docs/DIFFERENCES.md](docs/DIFFERENCES.md).

You can play the same engine in the web table or deploy the Worker and talk to it in Telegram.

---

## 1. What the bot is

- Display name: **xero.** — the trailing period is intentional.
- Telegram **username** cannot include a period and must end in `bot` (use something like `xero_bot`).
- Private-chat Telegram bot (`/start`, `/solo`, inline keyboards).
- Classic and Chaos modes.
- Tables of 8–15 (default 10: you + 9 NPCs).
- Roles: Villager, Werewolf, Seer, Guardian Angel, Hunter, Tanner, Fool, Cultist, Serial Killer, Cupid.
- NPCs have personalities, memory, votes, and night actions.
- The engine owns legality. The LLM only chooses among legal options and writes dialogue.

---

## 2. Architecture

```
Telegram
  → Cloudflare Worker          src/index.ts
  → Telegram update router     src/telegram/webhook.ts
  → Game Durable Object        src/storage/game-do.ts
  → Session / commands         src/telegram/session.ts
  → Game engine                src/game/*
  → Role registry              src/roles/*
  → AI player engine           src/ai/npc-engine.ts
  → AIProvider                 xAI / Workers AI / OpenAI-compatible / fallback
```

The web client (`src/routes`, `src/store/game-store.ts`) uses the **same** engine and role registry. Smart NPCs call xAI from a server function when a key is present.

Game state is JSON and survives Worker restarts inside the Durable Object.

---

## 3. Requirements

- Node 22+
- A Telegram bot token from [@BotFather](https://t.me/BotFather)
- Cloudflare account (Workers + Durable Objects)
- Optional: xAI API key, Workers AI, or any OpenAI-compatible endpoint

---

## 4. Telegram BotFather setup

1. Open [@BotFather](https://t.me/BotFather).
2. `/newbot` — set the **name** to `xero.` (BotFather allows the period in the display name). The **username** must end in `bot` and cannot contain a `.` — `xero_bot` works.
3. Copy the token. Never commit it.
4. Suggested `/setcommands`:

```
start - Open the menu
solo - Start a solo game
newgame - Start a solo game
help - How to play
status - Current phase
players - The table
role - Your secret role
say - Speak during the day
vote - Open the vote
night - Night action reminder
endgame - Abandon the game
```

5. Keep **Group Privacy** however you like; v1 only plays in **private chat**.

---

## 5. Cloudflare setup

```bash
npm i -g wrangler
npx wrangler login
```

Create a Worker project from this repo (`wrangler.jsonc` is already here). Durable Objects and a Workers AI binding are declared in that file.

---

## 6. Durable Objects setup

`wrangler.jsonc` binds:

- `GAME` → class `GameDurableObject` (SQLite-backed, migration tag `v1`)

Each Telegram user maps to `idFromName("user:<telegramId>")`. One active game per user. State stored under key `record`.

No extra dashboard steps beyond deploying with that config. The first deploy applies migration `v1`.

---

## 7. AI provider setup

Providers implement `AIProvider` in `src/ai/provider.ts`.

| `AI_PROVIDER` | Behavior |
|---|---|
| `auto` (default) | xAI if `XAI_API_KEY`, else Workers AI if bound, else heuristic fallback |
| `xai` | `https://api.x.ai/v1` (`grok-4.5` unless `AI_MODEL` is set) |
| `workers-ai` | Cloudflare `AI` binding |
| `openai` / `openai-compatible` | `AI_BASE_URL` + `AI_API_KEY` or `OPENAI_*` |
| `fallback` | Deterministic heuristics, no network |

If the model errors, the game **does not crash**. Night targets, votes, and lines fall back to heuristics.

---

## 8. Local development

Web table (this preview):

```bash
npm install
npm run dev
```

Engine tests:

```bash
npm test
```

Worker (needs wrangler):

```bash
npx wrangler dev
```

`wrangler dev` does not receive Telegram updates until a public webhook exists (use a tunnel or deploy).

---

## 9. Deployment

```bash
npx wrangler deploy
```

Then set secrets (next section) and register the webhook.

---

## 10. Webhook registration

After deploy, `https://<your-worker>/telegram/webhook` must be the bot's webhook.

```bash
curl -X POST "https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/setWebhook" \
  -H "content-type: application/json" \
  -d '{
    "url": "https://<your-worker>/telegram/webhook",
    "secret_token": "<TELEGRAM_WEBHOOK_SECRET>",
    "allowed_updates": ["message", "callback_query"]
  }'
```

Or, with `CALLBACK_SIGNING_SECRET` set, POST to `/telegram/setup` with
`Authorization: Bearer <CALLBACK_SIGNING_SECRET>`.

Health check: `GET /health`.

Retries: Telegram may POST the same `update_id` twice. Duplicate IDs are ignored.

---

## 11. Environment variables

Set with `npx wrangler secret put <NAME>`.

| Name | Required | Purpose |
|---|---|---|
| `TELEGRAM_BOT_TOKEN` | yes (bot) | BotFather token |
| `TELEGRAM_WEBHOOK_SECRET` | recommended | `X-Telegram-Bot-Api-Secret-Token` |
| `CALLBACK_SIGNING_SECRET` | recommended | HMAC for inline button payloads |
| `AI_PROVIDER` | no | `auto` / `xai` / `workers-ai` / `openai` / `fallback` |
| `XAI_API_KEY` | no | xAI / Grok |
| `AI_API_KEY` | no | OpenAI-compatible key |
| `AI_BASE_URL` | no | OpenAI-compatible base, including `/v1` |
| `AI_MODEL` | no | Override model id |
| `OPENAI_API_KEY` | no | Alias |
| `OPENAI_BASE_URL` | no | Alias |

Never put tokens in source. The web preview uses the platform-injected `XAI_API_KEY` for Smart NPCs only after you start a game.

---

## 12. Commands

| Command | Action |
|---|---|
| `/start` | Menu: New Game, How To Play, Settings |
| `/solo` `/newgame` | Mode + size keyboards |
| `/help` | Rules and commands |
| `/status` | Phase, living players, your shown role |
| `/players` | The table |
| `/role` | Private role card |
| `/say <text>` | Public discussion line |
| `/vote` | Vote keyboard |
| `/night` | Night-action keyboard |
| `/endgame` | Abandon |

Ordinary text during discussion is treated as speech (`allowOrdinaryTextAsSay`, default on).

---

## 13. Role system

Each role in `src/roles/index.ts` defines `id`, `displayName`, `emoji`, `faction`, `description`, `winCondition`, `nightAction`, `dayAction`, `passiveAbilities`, `knowledgeRules`, `targetRules`, `priority`, `deathBehavior`.

Classic tables live in `src/game/setup.ts`. Chaos samples extra roles then **validates** so the game cannot start in an immediate wolf win, a Fool without a Seer, or a Cult with no convert targets.

Night resolution order (engine-owned): Cupid (night 1) → Guardian Angel protect → Serial Killer kill → wolf kill (Hunter / SK specials) → cult convert → Seer/Fool see → GA death on wolf/SK.

---

## 14. How AI NPCs work

1. The engine lists **legal** targets for that character.
2. `buildPrivateView` builds a prompt-sized object with only what they would know.
3. `AIProvider.generatePlayerDecision` returns JSON (`action`, `targetId`, `text`, `confidence`, `reasoningSummary`).
4. Chain-of-thought is never shown in Telegram or the web table. Only a short strategic summary is stored on `NpcMemory`.
5. Discussion is capped (`maxDiscussionMessages`, default 5) with delays (`DISCUSSION_MESSAGE_DELAY_MS` equivalent: `settings.discussionMessageDelayMs`).

---

## 15. How to add a new role

1. Add an id to `RoleId` in `src/game/types.ts`.
2. Add a `RoleDefinition` in `src/roles/index.ts`.
3. Extend `validNightTargets` / `nightActionKind` if it acts at night.
4. Teach `src/game/night.ts` how to resolve that action. Do not put this in the LLM.
5. Update `classicRoles` / Chaos pools and `validateRoleDistribution`.
6. Add tests in `src/roles/abilities.test.ts` and a night/win case.
7. Document any rule that is not identical to upstream in `docs/DIFFERENCES.md`.

---

## 16. How to add another AI provider

```ts
import { providerFromCompleter } from "./provider.ts";

export function createMyProvider(apiKey: string) {
  return providerFromCompleter("my-provider", async (system, user) => {
    // return the model text, preferably JSON
  });
}
```

Wire it in `createProviderFromEnv` (`src/ai/index.ts`). Wrap with `withFallback` so a timeout never stalls the night.

---

## 17. Troubleshooting

| Symptom | What to check |
|---|---|
| Bot ignores chats | Webhook URL, `TELEGRAM_WEBHOOK_SECRET` header, `/health` |
| Duplicate replies | Duplicate `update_id` handling; inspect Durable Object `processedUpdateIds` |
| Buttons say invalid | `CALLBACK_SIGNING_SECRET` must be stable across deploys; payload is HMAC'd |
| NPCs silent / generic | Provider error → fallback. Set `AI_PROVIDER=xai` and a key |
| Game stuck at night | Human still has a night action; tap the target keyboard or `/night` |
| Typecheck / tests fail | `npm test` uses `scripts/alias-register.mjs` so `@/` resolves under `node:test` |
| Worker cannot find DO | Confirm `wrangler.jsonc` class name `GameDurableObject` exported from `src/index.ts` |

---

## Layout

```
src/index.ts              Worker fetch handler
src/game/*                Engine, phases, isolation, setup
src/roles/*               Role registry
src/ai/*                  Providers, prompts, NPC driver, memory
src/telegram/*            API, keyboards, session, webhook
src/storage/*             Durable Object + memory store
src/utils/*               HMAC, logging
src/routes/*              Web table
wrangler.jsonc
```

## License

Use freely. Role names and emoji match the public Telegram Werewolf vernacular; this is an independent implementation.
