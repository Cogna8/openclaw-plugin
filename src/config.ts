import type { Cogna8PluginConfig, FailureMode } from "./types.js";

const DEFAULTS = {
  serverUrl: "https://openclaw-api.cogna8.ai",
  agentId: "default",
  timeoutMs: 3000,
  failureMode: "open" as FailureMode,
};

export function normalizeConfig(input: unknown): Cogna8PluginConfig {
  const cfg = (input ?? {}) as Record<string, unknown>;

  const apiKey = typeof cfg.apiKey === "string" ? cfg.apiKey.trim() : "";
  if (!apiKey) {
    throw new Error("Cogna8 plugin requires apiKey");
  }

  const serverUrl =
    typeof cfg.serverUrl === "string" && cfg.serverUrl.trim().length > 0
      ? cfg.serverUrl.trim().replace(/\/+$/, "")
      : DEFAULTS.serverUrl;

  const agentId =
    typeof cfg.agentId === "string" && cfg.agentId.trim().length > 0
      ? cfg.agentId.trim()
      : DEFAULTS.agentId;

  const timeoutMs =
    typeof cfg.timeoutMs === "number" &&
    Number.isInteger(cfg.timeoutMs) &&
    cfg.timeoutMs >= 100 &&
    cfg.timeoutMs <= 30000
      ? cfg.timeoutMs
      : DEFAULTS.timeoutMs;

  const failureMode =
    cfg.failureMode === "closed" ? "closed" : DEFAULTS.failureMode;

  return {
    apiKey,
    serverUrl,
    agentId,
    timeoutMs,
    failureMode,
  };
}
