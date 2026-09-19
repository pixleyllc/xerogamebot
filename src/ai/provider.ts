import type { NpcMemory, PlayerView, RoleId } from "@/game/types.ts";
import { BOT_NAME } from "@/brand.ts";
import { rosterBlock, uniqueNonce } from "@/ai/spice.ts";

export type AiDecisionKind =
  | "discussion"
  | "accusation"
  | "defense"
  | "vote"
  | "night"
  | "deathReaction"
  | "revealReaction"
  | "plan"
  | "hunterShot";

export interface AiDecisionRequest {
  kind: AiDecisionKind;
  view: PlayerView;
  validTargets: string[];
  extraInstruction?: string;
  recentHumanStatement?: string | null;
  deathName?: string;
  entropyNonce?: string;
  angle?: string;
}

export interface AiDecision {
  action:
    | "speak"
    | "vote"
    | "night"
    | "skip"
    | "hunterShot"
    | "react";
  text: string;
  targetId: string | null;
  target2Id: string | null;
  confidence: number;
  reasoningSummary: string;
  updatedBeliefs?: Record<string, number>;
  intendedVoteId?: string | null;
  accusationTargetId?: string | null;
}

export interface AIProvider {
  readonly id: string;
  generatePlayerDecision(req: AiDecisionRequest): Promise<AiDecision>;
  generatePlayerDialogue(req: AiDecisionRequest): Promise<AiDecision>;
  generateNightAction(req: AiDecisionRequest): Promise<AiDecision>;
  generateVote(req: AiDecisionRequest): Promise<AiDecision>;
  summarizeMemory(view: PlayerView, memory: NpcMemory): Promise<string>;
}

function scrambleTarget(req: AiDecisionRequest): string | null {
  if (!req.validTargets.length) return null;
  const hunch = req.view.memory?.hunchTargetId;
  if (hunch && req.validTargets.includes(hunch) && Math.random() < 0.4) return hunch;
  return req.validTargets[Math.floor(Math.random() * req.validTargets.length)] ?? null;
}

function resolveTargetId(raw: unknown, req: AiDecisionRequest): string | null {
  if (typeof raw !== "string" || !raw.trim()) return null;
  const token = raw.trim();
  if (req.validTargets.includes(token)) return token;
  const lower = token.toLowerCase();
  const byId = req.view.players.find(
    (p) => p.id.toLowerCase() === lower || p.name.toLowerCase() === lower,
  );
  if (byId && req.validTargets.includes(byId.id)) return byId.id;
  const part = req.view.players.find(
    (p) =>
      p.name.toLowerCase().startsWith(lower) ||
      lower.includes(p.name.toLowerCase()) ||
      p.id.toLowerCase().startsWith(lower),
  );
  if (part && req.validTargets.includes(part.id)) return part.id;
  return null;
}

export function defaultDecision(req: AiDecisionRequest): AiDecision {
  const target = scrambleTarget(req);
  const target2 =
    req.validTargets.find((id) => id !== target) ??
    req.validTargets[1] ??
    null;
  return {
    action:
      req.kind === "vote"
        ? "vote"
        : req.kind === "night"
          ? "night"
          : req.kind === "hunterShot"
            ? "hunterShot"
            : "speak",
    text: "",
    targetId: target,
    target2Id: target2,
    confidence: 0.3,
    reasoningSummary: "fallback",
  };
}

export function parseDecisionJson(raw: string, req: AiDecisionRequest): AiDecision {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) return defaultDecision(req);
  try {
    const parsed = JSON.parse(raw.slice(start, end + 1)) as Partial<AiDecision>;
    const target = resolveTargetId(parsed.targetId, req) ?? scrambleTarget(req);
    const target2 =
      resolveTargetId(parsed.target2Id, req) ??
      req.validTargets.find((id) => id !== target) ??
      null;
    const intended = resolveTargetId(parsed.intendedVoteId, req) ?? target;
    const accused = resolveTargetId(parsed.accusationTargetId, req);
    const text =
      req.kind === "vote"
        ? ""
        : typeof parsed.text === "string"
          ? parsed.text.slice(0, 280).trim()
          : "";
    return {
      action: parsed.action ?? defaultDecision(req).action,
      text,
      targetId: target,
      target2Id: target2,
      confidence:
        typeof parsed.confidence === "number"
          ? Math.max(0, Math.min(1, parsed.confidence))
          : 0.5,
      reasoningSummary:
        typeof parsed.reasoningSummary === "string"
          ? parsed.reasoningSummary.slice(0, 240)
          : "",
      updatedBeliefs: parsed.updatedBeliefs,
      intendedVoteId: intended,
      accusationTargetId: accused,
    };
  } catch {
    return defaultDecision(req);
  }
}

export interface ChatCompleteFn {
  (system: string, user: string): Promise<string>;
}

export function providerFromCompleter(id: string, complete: ChatCompleteFn): AIProvider {
  const decide = async (req: AiDecisionRequest): Promise<AiDecision> => {
    const { system, user } = buildPrompt(req);
    try {
      const raw = await complete(system, user);
      return parseDecisionJson(raw, req);
    } catch {
      return defaultDecision(req);
    }
  };
  return {
    id,
    generatePlayerDecision: decide,
    generatePlayerDialogue: decide,
    generateNightAction: decide,
    generateVote: decide,
    async summarizeMemory(view, memory) {
      try {
        const raw = await complete(
          "You compress a werewolf player's private notes. Return one short paragraph. No secrets you were not given.",
          JSON.stringify({
            name: view.viewerName,
            role: view.shownRoleId,
            summary: memory.strategicSummary,
            facts: memory.facts.slice(-8).map((f) => f.text),
          }),
        );
        return raw.slice(0, 400);
      } catch {
        return memory.strategicSummary;
      }
    },
  };
}

export function buildPrompt(req: AiDecisionRequest): { system: string; user: string } {
  switch (req.kind) {
    case "discussion":
      return discussionPrompt(req);
    case "accusation":
      return accusationPrompt(req);
    case "defense":
      return defensePrompt(req);
    case "vote":
      return votePrompt(req);
    case "night":
      return nightPrompt(req);
    case "deathReaction":
      return deathPrompt(req);
    case "revealReaction":
      return revealPrompt(req);
    case "plan":
      return planPrompt(req);
    case "hunterShot":
      return hunterPrompt(req);
    default:
      return discussionPrompt(req);
  }
}

function identityBlock(view: PlayerView): string {
  const shown = view.shownRoleId;
  return [
    `You are ${view.viewerName}, a player in a solo Werewolf game. You are NOT anyone else at the table.`,
    `Your role (as you know it): ${shown}.`,
    `Faction you are playing for: ${view.faction}.`,
    view.inLove ? `You are in love with ${view.loverName}.` : "",
    view.packMates.length
      ? `Your wolf pack: ${view.packMates.map((p) => p.name).join(", ")}.`
      : "",
    view.cultMates.length
      ? `Fellow cultists: ${view.cultMates.map((p) => p.name).join(", ")}.`
      : "",
    view.personality
      ? `Personality: ${view.personality.traits.join(", ")}.`
      : "",
    view.personality
      ? `Speaking style (mandatory): ${view.personality.speakingStyle}`
      : "",
    view.personality?.agenda ? `Private agenda: ${view.personality.agenda}` : "",
    view.memory?.privateHunch ? `Private hunch: ${view.memory.privateHunch}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

function uniquenessBlock(req: AiDecisionRequest): string {
  const nonce = req.entropyNonce ?? uniqueNonce();
  const angle = req.angle ?? "Say something only you would say.";
  const recent = req.view.recentChat
    .filter((m) => m.kind === "player")
    .slice(-6)
    .map((m) => `${m.authorName}: ${m.text}`);
  return [
    `UNIQUE DRAW ${nonce}. This prompt is for ${req.view.viewerName} only.`,
    `Rhetorical angle this turn: ${angle}`,
    `Forbidden: copy, paraphrase, or echo any line in recentChat.`,
    recent.length ? `Already said (do not reuse):\n${recent.join("\n")}` : "No one has spoken yet. Do not open with a generic 'I don't love how X has been playing'.",
    "Do not use stock phrases like 'the votes around them don't add up' or 'that's not how a villager talks when they're clean'.",
    "Name a person. Be specific. 1-2 sentences max. Sound like a human at a table, not a prompt.",
  ].join("\n");
}

function knowledgeBlock(view: PlayerView): string {
  const living = view.players.filter((p) => p.isAlive).map((p) => `${p.name} [${p.id}]`);
  const dead = view.players.filter((p) => !p.isAlive).map((p) => `${p.name} [${p.id}]`);
  const events = view.publicEvents.slice(-12).map((e) => e.text);
  const investigations = view.investigations.map(
    (i) => `Night ${i.night}: ${i.targetName} looked like ${i.shownRoleId}`,
  );
  const mem = view.memory;
  return JSON.stringify({
    day: view.day,
    night: view.night,
    phase: view.phase,
    living,
    dead,
    publicEvents: events,
    investigations,
    beliefs: mem?.beliefs ?? {},
    trust: mem?.trust ?? {},
    facts: mem?.facts.slice(-8).map((f) => f.text) ?? [],
    shortTerm: mem?.shortTerm ?? [],
    strategicSummary: mem?.strategicSummary ?? "",
    privateHunch: mem?.privateHunch ?? "",
    hunchTargetId: mem?.hunchTargetId ?? null,
    recentChat: view.recentChat.slice(-8).map((m) => `${m.authorName}: ${m.text}`),
  });
}

function jsonContract(extra: string): string {
  return `Return ONLY JSON: {"action":string,"text":string,"targetId":string|null,"target2Id":string|null,"confidence":number,"reasoningSummary":string,"intendedVoteId":string|null,"accusationTargetId":string|null}
Rules:
- text is in-character, 1-2 sentences, no emojis unless rare, no stage directions.
- targetId MUST be a roster id (human, npc-1, npc-2, ...) never a display name.
- Never invent roles, deaths, or night results you were not given.
- Never claim to be ${BOT_NAME}
- Do not reveal your private role unless you are deliberately lying or the village already knows.
- Your line must be unique to you. If it could have been said by any villager, rewrite it.
${extra}`;
}

function discussionPrompt(req: AiDecisionRequest) {
  return {
    system: `${identityBlock(req.view)}\nYou are speaking during the day discussion.\n${uniquenessBlock(req)}\n${jsonContract("action must be speak. Be specific: name a person or a vote pattern.")}`,
    user: `${rosterBlock(req.view)}\nValid mention ids: ${req.validTargets.join(", ")}\nHuman just said: ${req.recentHumanStatement ?? "(nothing)"}\n${req.extraInstruction ?? ""}\nSTATE:\n${knowledgeBlock(req.view)}`,
  };
}

function accusationPrompt(req: AiDecisionRequest) {
  return {
    system: `${identityBlock(req.view)}\nPush an accusation. Be pointed. Do not copy the last accuser.\n${uniquenessBlock(req)}\n${jsonContract("action=speak. accusationTargetId required (a roster id).")}`,
    user: `${rosterBlock(req.view)}\n${req.extraInstruction ?? ""}\n${knowledgeBlock(req.view)}`,
  };
}

function defensePrompt(req: AiDecisionRequest) {
  return {
    system: `${identityBlock(req.view)}\nYou were just accused. Defend yourself without breaking character.\n${uniquenessBlock(req)}\n${jsonContract("action=speak.")}`,
    user: `${rosterBlock(req.view)}\n${knowledgeBlock(req.view)}`,
  };
}

function votePrompt(req: AiDecisionRequest) {
  return {
    system: `${identityBlock(req.view)}\nCast a silent lynch vote. Do not speak, narrate, or justify. text MUST be an empty string.\nDo not default to the first id. Use your private hunch.\n${jsonContract("action=vote. targetId is required and must be a roster id. text must be \"\".")}`,
    user: `${rosterBlock(req.view)}\nValid vote ids: ${req.validTargets.join(", ")}\n${knowledgeBlock(req.view)}`,
  };
}

function nightPrompt(req: AiDecisionRequest) {
  return {
    system: `${identityBlock(req.view)}\nChoose your night action target. This is private. Do not pick the first id by habit.\n${uniquenessBlock(req)}\n${jsonContract("action=night. If cupid, also set target2Id.")}`,
    user: `${rosterBlock(req.view)}\nValid target ids: ${req.validTargets.join(", ")}\n${req.extraInstruction ?? ""}\n${knowledgeBlock(req.view)}`,
  };
}

function deathPrompt(req: AiDecisionRequest) {
  return {
    system: `${identityBlock(req.view)}\nReact briefly to a death. Do not claim you saw the night privately unless you are seer and you did.\n${uniquenessBlock(req)}\n${jsonContract("action=speak.")}`,
    user: `${rosterBlock(req.view)}\n${req.deathName ?? "Someone"} died.\n${knowledgeBlock(req.view)}`,
  };
}

function revealPrompt(req: AiDecisionRequest) {
  return {
    system: `${identityBlock(req.view)}\nA role was revealed. React in character.\n${uniquenessBlock(req)}\n${jsonContract("action=speak.")}`,
    user: `${rosterBlock(req.view)}\n${knowledgeBlock(req.view)}`,
  };
}

function planPrompt(req: AiDecisionRequest) {
  return {
    system: `${identityBlock(req.view)}\nUpdate your private plan. text is NOT said aloud; keep it short.\n${jsonContract("action=speak.")}`,
    user: knowledgeBlock(req.view),
  };
}

function hunterPrompt(req: AiDecisionRequest) {
  return {
    system: `${identityBlock(req.view)}\nYou are the Hunter, dying. Choose someone to shoot. Not automatically the first id.\n${uniquenessBlock(req)}\n${jsonContract("action=hunterShot. targetId required.")}`,
    user: `${rosterBlock(req.view)}\nValid ids: ${req.validTargets.join(", ")}\n${knowledgeBlock(req.view)}`,
  };
}

export type { RoleId };
