let engine: any = null;
let loadingPromise: Promise<void> | null = null;
let loadFailed = false;

const MODEL_ID = "SmolLM2-360M-Instruct-q4f16_1-MLC";

async function initEngine(): Promise<void> {
  if (engine) return;
  if (loadFailed) throw new Error("WebLLM init previously failed");
  if (loadingPromise) {
    await loadingPromise;
    return;
  }

  loadingPromise = (async () => {
    try {
      const webllm = await import("@mlc-ai/web-llm");
      engine = await webllm.CreateMLCEngine(MODEL_ID, {
        initProgressCallback: (report: any) => {
          if (typeof console !== "undefined")
            console.log("[webllm]", report.text ?? report);
        },
      });
    } catch (err) {
      loadFailed = true;
      engine = null;
      throw err;
    } finally {
      loadingPromise = null;
    }
  })();

  await loadingPromise;
}

export function isLocalLlmAvailable(): boolean {
  return !loadFailed;
}

export function isLocalLlmReady(): boolean {
  return engine != null;
}

export async function generateLocalSummary(prompt: {
  system: string;
  user: string;
}): Promise<string> {
  await initEngine();
  if (!engine) throw new Error("WebLLM engine not initialized");

  const reply = await engine.chat.completions.create({
    messages: [
      { role: "system", content: prompt.system },
      { role: "user", content: prompt.user },
    ],
    max_tokens: 200,
    temperature: 0.3,
  });

  return reply.choices?.[0]?.message?.content ?? "";
}
