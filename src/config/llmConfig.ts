/**
 * Server-only LLM configuration.
 * Keys are read from process.env WITHOUT the NEXT_PUBLIC_ prefix
 * so they are never bundled into the client JS.
 */

export interface HostedLlmConfig {
  baseUrl: string;
  apiKey: string;
  modelId: string;
}

export function getHostedLlmConfig(): HostedLlmConfig | null {
  const baseUrl = process.env.FREE_LLM_BASE_URL ?? "";
  const apiKey = process.env.FREE_LLM_API_KEY ?? "";
  const modelId = process.env.FREE_LLM_MODEL_ID ?? "";

  if (!baseUrl || !apiKey) return null;
  return { baseUrl, apiKey, modelId: modelId || "default" };
}
