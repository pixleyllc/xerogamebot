import { createServerFn } from "@tanstack/react-start";
import { createXaiProvider } from "@/ai/xai.ts";
import { fallbackProvider } from "@/ai/fallback.ts";
import type { AiDecision, AiDecisionKind, AiDecisionRequest } from "@/ai/provider.ts";
import type { PlayerView } from "@/game/types.ts";

async function decide(req: AiDecisionRequest, useLlm: boolean): Promise<AiDecision> {
  if (!useLlm) return fallbackProvider.generatePlayerDecision(req);
  const apiKey = process.env.XAI_API_KEY;
  if (!apiKey) return fallbackProvider.generatePlayerDecision(req);
  const provider = createXaiProvider({ apiKey, maxTokens: 180 });
  try {
    return await provider.generatePlayerDecision(req);
  } catch {
    return fallbackProvider.generatePlayerDecision(req);
  }
}

export const generateNpcDecision = createServerFn({ method: "POST" })
  .validator((input: { req: AiDecisionRequest; useLlm: boolean }) => input)
  .handler(async ({ data }): Promise<AiDecision> => decide(data.req, data.useLlm));

export const generateNpcBatch = createServerFn({ method: "POST" })
  .validator(
    (input: {
      kind: AiDecisionKind;
      views: Array<{ view: PlayerView; validTargets: string[] }>;
      useLlm: boolean;
      recentHumanStatement?: string | null;
    }) => input,
  )
  .handler(async ({ data }): Promise<AiDecision[]> => {
    const limited = data.views.slice(0, 6);
    const out: AiDecision[] = [];
    for (const item of limited) {
      out.push(
        await decide(
          {
            kind: data.kind,
            view: item.view,
            validTargets: item.validTargets,
            recentHumanStatement: data.recentHumanStatement,
          },
          data.useLlm,
        ),
      );
    }
    return out;
  });
