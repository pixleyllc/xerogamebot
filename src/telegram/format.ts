import { APP_NAME, BOT_NAME } from "@/brand.ts";
import { getRole, roleLabel } from "@/roles/index.ts";
import type { GameState, HumanPrompt, PlayerState } from "@/game/types.ts";
import { livingPlayers } from "@/roles/index.ts";

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "\u0026amp;")
    .replace(/</g, "\u0026lt;")
    .replace(/>/g, "\u0026gt;");
}

export function formatPrompt(prompt: HumanPrompt): string {
  return `<b>${escapeHtml(prompt.title)}</b>\n\n${escapeHtml(prompt.body)}`;
}

export function formatLiving(state: GameState): string {
  return livingPlayers(state)
    .map((p) => `• ${p.name}${p.isHuman ? " (you)" : ""}`)
    .join("\n");
}

export function formatStatus(state: GameState): string {
  const you = state.players.find((p) => p.isHuman)!;
  const role = getRole(you.roleId === "fool" ? "seer" : you.roleId);
  return [
    `<b>${escapeHtml(BOT_NAME)}</b> — ${state.settings.mode} · ${state.players.length} players`,
    `Phase: ${state.phase} · Night ${state.night} · Day ${state.day}`,
    `You: ${you.isAlive ? "alive" : "dead"} · ${role.emoji} ${role.displayName}`,
    "",
    "<b>Living</b>",
    formatLiving(state),
  ].join("\n");
}

export function formatHelp(): string {
  return [
    `<b>${escapeHtml(BOT_NAME)}</b>`,
    `One human. Nine (or more) AI villagers. Roles are dealt by ${BOT_NAME} You play the classic Telegram Werewolf game against a full table of NPCs.`,
    "",
    "<b>Commands</b>",
    "/start — open the menu",
    "/newgame or /solo — start a game",
    "/status — phase, living players",
    "/players — the table",
    "/role — your private role",
    "/say message — speak during the day",
    "/vote — open the vote keyboard",
    "/night — remind your night action",
    "/endgame — abandon the current game",
    "/help — this text",
    "",
    "Ordinary messages during discussion are treated as speech unless you disable that in settings.",
  ].join("\n");
}

export function formatRoster(players: PlayerState[], revealRoles: boolean): string {
  return players
    .map((p) => {
      const mark = p.isAlive ? "●" : "†";
      const role = revealRoles ? ` — ${roleLabel(p.originalRoleId)}` : "";
      return `${mark} ${p.name}${p.isHuman ? " (you)" : ""}${role}`;
    })
    .join("\n");
}

export const START_TEXT = [
  `<b>${escapeHtml(BOT_NAME)}</b>`,
  "",
  `${APP_NAME}. A full table. One human. The rest are AI with roles, secrets, and votes.`,
  "",
  `Run by ${BOT_NAME}`,
  "",
  "Classic follows the original Telegram Werewolf balance.",
  "Chaos randomizes a legal role mix.",
].join("\n");
