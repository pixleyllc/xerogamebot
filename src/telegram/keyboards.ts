import type { InlineKeyboardMarkup } from "@/telegram/types.ts";
import { chunkButtons } from "@/telegram/api.ts";
import type { HumanPrompt } from "@/game/types.ts";
import { encodeCallback, type CallbackPayload } from "@/utils/hmac.ts";

export async function signedButtonRows(
  secret: string,
  base: Omit<CallbackPayload, "action" | "targetId" | "target2Id">,
  buttons: Array<{ text: string; action: string; targetId?: string; target2Id?: string }>,
  perRow = 2,
): Promise<InlineKeyboardMarkup> {
  const packed = await Promise.all(
    buttons.map(async (b) => ({
      text: b.text,
      callback_data: await encodeCallback(
        {
          gameId: base.gameId,
          userId: base.userId,
          action: b.action,
          targetId: b.targetId,
          target2Id: b.target2Id,
        },
        secret,
      ),
    })),
  );
  return chunkButtons(packed, perRow);
}

export async function menuKeyboard(secret: string, userId: number, gameId: string) {
  return signedButtonRows(secret, { gameId, userId }, [
    { text: "New Game", action: "menu:new" },
    { text: "How To Play", action: "menu:help" },
    { text: "Settings", action: "menu:settings" },
  ]);
}

export async function lobbyKeyboard(secret: string, userId: number, gameId: string) {
  return signedButtonRows(secret, { gameId, userId }, [
    { text: "Classic · 10", action: "start:classic:10" },
    { text: "Chaos · 10", action: "start:chaos:10" },
    { text: "Classic · 8", action: "start:classic:8" },
    { text: "Classic · 12", action: "start:classic:12" },
    { text: "Chaos · 12", action: "start:chaos:12" },
    { text: "Classic · 15", action: "start:classic:15" },
  ]);
}

export async function inGameKeyboard(secret: string, userId: number, gameId: string) {
  return signedButtonRows(secret, { gameId, userId }, [
    { text: "Players", action: "game:players" },
    { text: "My Role", action: "game:role" },
    { text: "History", action: "game:history" },
    { text: "Leave", action: "game:leave" },
  ]);
}

export async function promptKeyboard(
  secret: string,
  userId: number,
  gameId: string,
  prompt: HumanPrompt,
) {
  const buttons: Array<{ text: string; action: string; targetId?: string; target2Id?: string }> =
    prompt.targets.map((t) => ({
      text: t.name,
      action: `pick:${prompt.kind}`,
      targetId: t.id,
    }));
  if (prompt.allowSkip) {
    buttons.push({
      text: prompt.kind === "discussion" ? "Call the vote" : "Skip",
      action: "skip",
    });
  }
  return signedButtonRows(secret, { gameId, userId }, buttons, 2);
}

export async function settingsKeyboard(secret: string, userId: number, gameId: string) {
  return signedButtonRows(secret, { gameId, userId }, [
    { text: "Votes: public", action: "set:votes:public" },
    { text: "Votes: hidden", action: "set:votes:hidden" },
    { text: "Ties: no lynch", action: "set:tie:none" },
    { text: "Ties: random", action: "set:tie:random" },
    { text: "Back", action: "menu:home" },
  ]);
}
