import { providerFromCompleter, type AIProvider } from "@/ai/provider.ts";

interface WorkersAiBinding {
  run(model: string, input: Record<string, unknown>): Promise<unknown>;
}

export function createWorkersAiProvider(
  ai: WorkersAiBinding,
  model = "@cf/meta/llama-3.1-8b-instruct",
): AIProvider {
  return providerFromCompleter("workers-ai", async (system, user) => {
    const out = await ai.run(model, {
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      max_tokens: 220,
    });
    if (typeof out === "string") return out;
    if (out && typeof out === "object") {
      const rec = out as { response?: string; result?: { response?: string } };
      return rec.response ?? rec.result?.response ?? JSON.stringify(out);
    }
    return "";
  });
}
