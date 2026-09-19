import { providerFromCompleter, type AIProvider } from "@/ai/provider.ts";

export interface XaiConfig {
  apiKey: string;
  model?: string;
  baseUrl?: string;
  maxTokens?: number;
}

export function createXaiProvider(config: XaiConfig): AIProvider {
  const model = config.model ?? "grok-4.5";
  const baseUrl = (config.baseUrl ?? "https://api.x.ai/v1").replace(/\/$/, "");
  return providerFromCompleter("xai", async (system, user) => {
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model,
        temperature: 1.15,
        presence_penalty: 0.7,
        frequency_penalty: 0.45,
        max_tokens: config.maxTokens ?? 220,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
    });
    if (!res.ok) {
      throw new Error(`xAI error ${res.status}`);
    }
    const body = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    return body.choices?.[0]?.message?.content ?? "";
  });
}
