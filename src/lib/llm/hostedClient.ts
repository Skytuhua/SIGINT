import { getHostedLlmConfig } from "../../config/llmConfig";

export function isHostedLlmAvailable(): boolean {
  return getHostedLlmConfig() !== null;
}

export async function generateHostedSummary(prompt: {
  system: string;
  user: string;
}): Promise<string> {
  const config = getHostedLlmConfig();
  if (!config) throw new Error("Hosted LLM not configured");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);

  try {
    const res = await fetch(`${config.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.modelId,
        messages: [
          { role: "system", content: prompt.system },
          { role: "user", content: prompt.user },
        ],
        max_tokens: 200,
        temperature: 0.3,
      }),
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (!res.ok) throw new Error(`Hosted LLM ${res.status}`);
    const json = (await res.json()) as any;
    return json.choices?.[0]?.message?.content ?? "";
  } catch (err) {
    clearTimeout(timer);
    throw err;
  }
}
