export interface HostedLlmConfig {
  baseUrl: string;
  apiKey: string;
  modelId: string;
}

export function getHostedLlmConfig(): HostedLlmConfig | null {
  const baseUrl =
    typeof process !== "undefined"
      ? process.env.NEXT_PUBLIC_FREE_LLM_BASE_URL ?? ""
      : (typeof window !== "undefined"
          ? (window as any).__NEXT_PUBLIC_FREE_LLM_BASE_URL ?? ""
          : "");
  const apiKey =
    typeof process !== "undefined"
      ? process.env.NEXT_PUBLIC_FREE_LLM_API_KEY ?? ""
      : (typeof window !== "undefined"
          ? (window as any).__NEXT_PUBLIC_FREE_LLM_API_KEY ?? ""
          : "");
  const modelId =
    typeof process !== "undefined"
      ? process.env.NEXT_PUBLIC_FREE_LLM_MODEL_ID ?? ""
      : (typeof window !== "undefined"
          ? (window as any).__NEXT_PUBLIC_FREE_LLM_MODEL_ID ?? ""
          : "");

  if (!baseUrl || !apiKey) return null;
  return { baseUrl, apiKey, modelId: modelId || "default" };
}
