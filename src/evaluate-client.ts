import type {
  Cogna8PluginConfig,
  EvaluateRequest,
  EvaluateResponse,
} from "./types.js";

export async function callEvaluate(
  config: Cogna8PluginConfig,
  request: EvaluateRequest,
): Promise<EvaluateResponse> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.timeoutMs);

  try {
    const response = await fetch(`${config.serverUrl}/api/v1/evaluate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify(request),
      signal: controller.signal,
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(
        `Cogna8 evaluate returned HTTP ${response.status}${body ? `: ${body}` : ""}`,
      );
    }

    return (await response.json()) as EvaluateResponse;
  } finally {
    clearTimeout(timer);
  }
}
