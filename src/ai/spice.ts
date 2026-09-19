import type { PlayerView } from "@/game/types.ts";
import type { Rng } from "@/game/rng.ts";

export const RHETORICAL_ANGLES = [
  "Ask one person a yes/no trap about last night. Do not speechify.",
  "Name the quietest living player and say why silence is a tell.",
  "Disagree with the last speaker even if you share a suspect.",
  "Defend someone who is not you, then slide suspicion elsewhere.",
  "Talk only about vote math — who benefits from today's lynch.",
  "Call out a pairing: two people who never push each other.",
  "Point at whoever changed the subject after the death.",
  "Push a name nobody in recentChat has mentioned yet.",
  "Sound unsure, then lock a name in the last clause.",
  "Be short and sharp. One sentence. A name. No hedging.",
  "Over-explain one tiny public fact until it sounds like a read.",
  "If village, do not sound like every other villager. Be weird.",
  "If evil, do not make a textbook wolf read. Misdirect sideways.",
  "Pretend you are tracking voting history, even if it is thin.",
  "Pick a second-choice suspect, not the obvious first name.",
  "Ask two people to explain their night in one sentence each.",
  "Claim a gut read and refuse to justify it cleanly.",
  "Mirror someone's tone, then accuse a different person.",
  "Talk like you already voted in your head.",
  "Bring up who would be a stupid wolf-kill if they died next.",
] as const;

export function pickAngle(rng: Rng, recentText: string): string {
  const used = recentText.toLowerCase();
  const fresh = RHETORICAL_ANGLES.filter((a) => {
    const key = a.slice(0, 18).toLowerCase();
    return !used.includes(key);
  });
  return rng.pick(fresh.length ? fresh : RHETORICAL_ANGLES);
}

export function rosterBlock(view: PlayerView): string {
  const lines = view.players.map((p) => {
    const tags = [
      p.isAlive ? "alive" : "dead",
      p.isHuman ? "human" : "npc",
      p.isLoverOfYou ? "your-lover" : "",
    ].filter(Boolean);
    return `- ${p.id} = ${p.name} (${tags.join(", ")})`;
  });
  return `ROSTER (targetId MUST be an id from this list, never a display name):\n${lines.join("\n")}`;
}

export function fingerprint(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 48);
}

export function saidFingerprints(view: PlayerView): Set<string> {
  const out = new Set<string>();
  for (const m of view.recentChat) {
    if (m.text) out.add(fingerprint(m.text));
  }
  for (const fp of view.memory?.saidFingerprints ?? []) out.add(fp);
  return out;
}

export function uniqueNonce(): string {
  const bytes = new Uint8Array(8);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}
