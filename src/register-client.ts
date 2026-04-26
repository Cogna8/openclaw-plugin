// Keep in sync with package.json version on every release.
// MUST update both package.json version and this constant in the same commit.
export const PLUGIN_VERSION = "0.4.0";

export type RegisterAgentPayload = {
  agent: {
    external_id: string;
    name: string;
    source: "openclaw";
    plugin_version: string;
  };
  tools: Array<unknown>;
  catalog_hash: string;
};

export type RegisterAgentResponse = {
  agent: {
    id: string;
    status: "created" | "synced" | string;
  };
  tools_registered?: number;
  active_rules?: number;
};

export type RegisterClientDeps = {
  baseUrl: string;
  apiKey: string;
  agentId: string;
  pluginVersion: string;
  fetchImpl?: typeof fetch;
  logger?: {
    info: (msg: string) => void;
    warn: (msg: string) => void;
    error?: (msg: string) => void;
  };
};

export async function registerAgentOnce({
  baseUrl,
  apiKey,
  agentId,
  pluginVersion,
  fetchImpl = fetch,
  logger = console,
}: RegisterClientDeps): Promise<void> {
  const url = new URL("/api/v1/agents/register", baseUrl).toString();

  // catalog_hash is intentionally a fixed placeholder for v0.3.
  // A future release will compute this from the actual tool catalog.
  const payload: RegisterAgentPayload = {
    agent: {
      external_id: agentId,
      name: `OpenClaw Agent (${agentId})`,
      source: "openclaw",
      plugin_version: pluginVersion,
    },
    tools: [],
    catalog_hash: "empty-v0.3",
  };

  try {
    const res = await fetchImpl(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payload),
    });

    const text = await res.text();
    let data: RegisterAgentResponse | Record<string, unknown> | null = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = null;
    }

    if (!res.ok) {
      const detail =
        (data && typeof data === "object" && "error" in data
          ? String((data as { error: unknown }).error)
          : "") ||
        text ||
        `HTTP ${res.status}`;
      logger.warn(`[cogna8] Agent registration failed: ${detail}`);
      return;
    }

    const publicId =
      data &&
      typeof data === "object" &&
      "agent" in data &&
      (data as RegisterAgentResponse).agent?.id
        ? String((data as RegisterAgentResponse).agent.id)
        : "unknown";

    const status =
      data &&
      typeof data === "object" &&
      "agent" in data &&
      (data as RegisterAgentResponse).agent?.status
        ? String((data as RegisterAgentResponse).agent.status)
        : "unknown";

    logger.info(
      `[cogna8] Agent registered (external_id=${agentId}, public_id=${publicId}, status=${status})`,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.warn(`[cogna8] Agent registration failed: ${message}`);
  }
}
