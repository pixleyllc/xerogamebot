import { providerFromCompleter, type AIProvider } from "@/ai/provider.ts";

export interface OpenAiCompatibleConfig {
  apiKey: string;
  model: string;
  baseUrl: string;
  maxTokens?: number;
}

export function createOpenAiCompatibleProvider(
  config: OpenAiCompatibleConfig,
): AIProvider {
  const baseUrl = config.baseUrl.replace(/\/$/, "");
  return providerFromCompleter("openai-compatible", async (system, user) => {
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.model,
        temperature: 0.7,
        max_tokens: config.maxTokens ?? 220,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
    });
    if (!res.ok) throw new Error(`OpenAI-compatible error ${res.status}`);
    const body = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    return body.choices?.[0]?.message?.content ?? "";
  });
}
