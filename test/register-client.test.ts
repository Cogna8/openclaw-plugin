import { describe, expect, it, vi } from "vitest";
import { registerAgentOnce } from "../src/register-client.js";

describe("registerAgentOnce", () => {
  it("logs success on 200", async () => {
    const info = vi.fn();
    const warn = vi.fn();

    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      text: async () =>
        JSON.stringify({
          agent: { id: "agt_123", status: "created" },
          tools_registered: 0,
          active_rules: 0,
        }),
    });

    await registerAgentOnce({
      baseUrl: "https://example.com",
      apiKey: "cg8_sk_test",
      agentId: "default",
      pluginVersion: "0.2.0",
      fetchImpl: fetchImpl as unknown as typeof fetch,
      logger: { info, warn, error: warn },
    });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(info).toHaveBeenCalledWith(
      "[cogna8] Agent registered (external_id=default, public_id=agt_123, status=created)",
    );
    expect(warn).not.toHaveBeenCalled();
  });

  it("logs failure on non-200", async () => {
    const info = vi.fn();
    const warn = vi.fn();

    const fetchImpl = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      text: async () => JSON.stringify({ error: "bad request" }),
    });

    await registerAgentOnce({
      baseUrl: "https://example.com",
      apiKey: "cg8_sk_test",
      agentId: "default",
      pluginVersion: "0.2.0",
      fetchImpl: fetchImpl as unknown as typeof fetch,
      logger: { info, warn, error: warn },
    });

    expect(warn).toHaveBeenCalled();
    expect(info).not.toHaveBeenCalled();
  });

  it("logs failure on fetch error", async () => {
    const info = vi.fn();
    const warn = vi.fn();

    const fetchImpl = vi.fn().mockRejectedValue(new Error("network down"));

    await registerAgentOnce({
      baseUrl: "https://example.com",
      apiKey: "cg8_sk_test",
      agentId: "default",
      pluginVersion: "0.2.0",
      fetchImpl: fetchImpl as unknown as typeof fetch,
      logger: { info, warn, error: warn },
    });

    expect(warn).toHaveBeenCalledWith(
      "[cogna8] Agent registration failed: network down",
    );
    expect(info).not.toHaveBeenCalled();
  });
});
