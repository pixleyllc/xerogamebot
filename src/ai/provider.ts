import type { NpcMemory, PlayerView, RoleId } from "@/game/types.ts";
import { BOT_NAME } from "@/brand.ts";

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

export function defaultDecision(req: AiDecisionRequest): AiDecision {
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
    targetId: req.validTargets[0] ?? null,
    target2Id: req.validTargets[1] ?? null,
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
    const target =
      typeof parsed.targetId === "string" && req.validTargets.includes(parsed.targetId)
        ? parsed.targetId
        : req.validTargets[0] ?? null;
    const target2 =
      typeof parsed.target2Id === "string" && req.validTargets.includes(parsed.target2Id)
        ? parsed.target2Id
        : req.validTargets.find((id) => id !== target) ?? null;
    const text = typeof parsed.text === "string" ? parsed.text.slice(0, 280).trim() : "";
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
      intendedVoteId:
        typeof parsed.intendedVoteId === "string" &&
        req.validTargets.includes(parsed.intendedVoteId)
          ? parsed.intendedVoteId
          : target,
      accusationTargetId:
        typeof parsed.accusationTargetId === "string" ? parsed.accusationTargetId : null,
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
    `You are ${view.viewerName}, a player in a solo Werewolf game.`,
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
      ? `Personality: ${view.personality.traits.join(", ")}. Style: ${view.personality.speakingStyle}`
      : "",
  ]
    .filter(Boolean)
    .join("\n");
}

function knowledgeBlock(view: PlayerView): string {
  const living = view.players.filter((p) => p.isAlive).map((p) => p.name);
  const dead = view.players.filter((p) => !p.isAlive).map((p) => p.name);
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
    recentChat: view.recentChat.slice(-8).map((m) => `${m.authorName}: ${m.text}`),
  });
}

function jsonContract(extra: string): string {
  return `Return ONLY JSON: {"action":string,"text":string,"targetId":string|null,"target2Id":string|null,"confidence":number,"reasoningSummary":string,"intendedVoteId":string|null,"accusationTargetId":string|null}
Rules:
- text is in-character, 1-2 sentences, no emojis unless rare, no stage directions.
- targetId must be one of the valid target ids or null.
- Never invent roles, deaths, or night results you were not given.
- Never claim to be ${BOT_NAME}
- Do not reveal your private role unless you are deliberately lying or the village already knows.
${extra}`;
}

function discussionPrompt(req: AiDecisionRequest) {
  return {
    system: `${identityBlock(req.view)}\nYou are speaking during the day discussion.\n${jsonContract("action must be speak. Be specific: name a person or a vote pattern.")}`,
    user: `Valid mention ids: ${req.validTargets.join(", ")}\nHuman just said: ${req.recentHumanStatement ?? "(nothing)"}\nSTATE:\n${knowledgeBlock(req.view)}`,
  };
}

function accusationPrompt(req: AiDecisionRequest) {
  return {
    system: `${identityBlock(req.view)}\nPush an accusation. Be pointed.\n${jsonContract("action=speak. accusationTargetId required.")}`,
    user: knowledgeBlock(req.view),
  };
}

function defensePrompt(req: AiDecisionRequest) {
  return {
    system: `${identityBlock(req.view)}\nYou were just accused. Defend yourself without breaking character.\n${jsonContract("action=speak.")}`,
    user: knowledgeBlock(req.view),
  };
}

function votePrompt(req: AiDecisionRequest) {
  return {
    system: `${identityBlock(req.view)}\nChoose who to vote to lynch.\n${jsonContract("action=vote. targetId is required and must be valid.")}`,
    user: `Valid vote ids: ${req.validTargets.join(", ")}\n${knowledgeBlock(req.view)}`,
  };
}

function nightPrompt(req: AiDecisionRequest) {
  return {
    system: `${identityBlock(req.view)}\nChoose your night action target. This is private.\n${jsonContract("action=night. If cupid, also set target2Id.")}`,
    user: `Valid target ids: ${req.validTargets.join(", ")}\n${req.extraInstruction ?? ""}\n${knowledgeBlock(req.view)}`,
  };
}

function deathPrompt(req: AiDecisionRequest) {
  return {
    system: `${identityBlock(req.view)}\nReact briefly to a death. Do not claim you saw the night privately unless you are seer and you did.\n${jsonContract("action=speak.")}`,
    user: `${req.deathName ?? "Someone"} died.\n${knowledgeBlock(req.view)}`,
  };
}

function revealPrompt(req: AiDecisionRequest) {
  return {
    system: `${identityBlock(req.view)}\nA role was revealed. React in character.\n${jsonContract("action=speak.")}`,
    user: knowledgeBlock(req.view),
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
    system: `${identityBlock(req.view)}\nYou are the Hunter, dying. Choose someone to shoot.\n${jsonContract("action=hunterShot. targetId required.")}`,
    user: `Valid ids: ${req.validTargets.join(", ")}\n${knowledgeBlock(req.view)}`,
  };
}

export type { RoleId };
