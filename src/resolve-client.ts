import type { Cogna8PluginConfig, PluginApprovalResolution } from "./types.js";

/**
 * Maps OpenClaw's hyphenated resolution values to the service's underscore enum.
 */
function mapResolution(r: PluginApprovalResolution): string {
  switch (r) {
    case "allow-once":
      return "allow_once";
    case "allow-always":
      return "allow_always";
    case "deny":
      return "deny";
    case "timeout":
      return "timeout";
    case "cancelled":
      return "cancelled";
  }
}

/**
 * Fire-and-forget audit call. Posts the resolution of an approval decision to
 * the Cogna8 service. Never throws — any error is swallowed.
 */
export async function reportResolution(
  config: Cogna8PluginConfig,
  decisionId: string,
  resolution: PluginApprovalResolution,
): Promise<void> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 3000);

  try {
    await fetch(`${config.serverUrl}/api/v1/decisions/${decisionId}/resolve`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ resolution: mapResolution(resolution) }),
      signal: controller.signal,
    });
  } catch {
    // Best-effort audit. Resolution reporting must never break tool handling.
  } finally {
    clearTimeout(timer);
  }
}
