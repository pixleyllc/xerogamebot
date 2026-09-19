import { fallbackProvider } from "@/ai/fallback.ts";
import { createOpenAiCompatibleProvider } from "@/ai/openai-compatible.ts";
import { createWorkersAiProvider } from "@/ai/workers-ai.ts";
import { createXaiProvider } from "@/ai/xai.ts";
import type { AIProvider } from "@/ai/provider.ts";

export * from "@/ai/provider.ts";
export * from "@/ai/fallback.ts";
export * from "@/ai/xai.ts";
export * from "@/ai/openai-compatible.ts";
export * from "@/ai/workers-ai.ts";
export * from "@/ai/npc-engine.ts";
export * from "@/ai/memory.ts";

export interface ProviderEnv {
  AI_PROVIDER?: string;
  AI_API_KEY?: string;
  AI_BASE_URL?: string;
  AI_MODEL?: string;
  XAI_API_KEY?: string;
  OPENAI_API_KEY?: string;
  OPENAI_BASE_URL?: string;
  AI?: { run(model: string, input: Record<string, unknown>): Promise<unknown> };
}

export function createProviderFromEnv(env: ProviderEnv): AIProvider {
  const kind = (env.AI_PROVIDER ?? "auto").toLowerCase();

  if (kind === "fallback" || kind === "heuristic") return fallbackProvider;

  if (kind === "xai" || (kind === "auto" && env.XAI_API_KEY)) {
    if (env.XAI_API_KEY) {
      return createXaiProvider({
        apiKey: env.XAI_API_KEY,
        model: env.AI_MODEL,
        baseUrl: env.AI_BASE_URL,
      });
    }
  }

  if (kind === "openai" || kind === "openai-compatible") {
    const key = env.AI_API_KEY || env.OPENAI_API_KEY;
    const base = env.AI_BASE_URL || env.OPENAI_BASE_URL || "https://api.openai.com/v1";
    if (key) {
      return createOpenAiCompatibleProvider({
        apiKey: key,
        model: env.AI_MODEL || "gpt-4o-mini",
        baseUrl: base,
      });
    }
  }

  if ((kind === "workers-ai" || kind === "auto") && env.AI) {
    return createWorkersAiProvider(env.AI, env.AI_MODEL);
  }

  if (env.AI_API_KEY && env.AI_BASE_URL) {
    return createOpenAiCompatibleProvider({
      apiKey: env.AI_API_KEY,
      model: env.AI_MODEL || "gpt-4o-mini",
      baseUrl: env.AI_BASE_URL,
    });
  }

  return fallbackProvider;
}

export function withFallback(primary: AIProvider): AIProvider {
  const wrap = async <T>(fn: () => Promise<T>, fb: () => Promise<T>): Promise<T> => {
    try {
      return await fn();
    } catch {
      return fb();
    }
  };
  return {
    id: `${primary.id}+fallback`,
    generatePlayerDecision: (req) =>
      wrap(
        () => primary.generatePlayerDecision(req),
        () => fallbackProvider.generatePlayerDecision(req),
      ),
    generatePlayerDialogue: (req) =>
      wrap(
        () => primary.generatePlayerDialogue(req),
        () => fallbackProvider.generatePlayerDialogue(req),
      ),
    generateNightAction: (req) =>
      wrap(
        () => primary.generateNightAction(req),
        () => fallbackProvider.generateNightAction(req),
      ),
    generateVote: (req) =>
      wrap(
        () => primary.generateVote(req),
        () => fallbackProvider.generateVote(req),
      ),
    summarizeMemory: (view, memory) =>
      wrap(
        () => primary.summarizeMemory(view, memory),
        () => fallbackProvider.summarizeMemory(view, memory),
      ),
  };
}
