import { describe, expect, it, vi } from "vitest";
import {
  registerAgentOnce,
  registerAgentOrThrow,
} from "../src/register-client.js";

const baseArgs = {
  baseUrl: "https://example.com",
  apiKey: "cg8_sk_test",
  agentId: "agent-a",
  pluginVersion: "0.5.0",
};

describe("registerAgentOrThrow", () => {
  it("resolves on successful registration", async () => {
    const info = vi.fn();
    const warn = vi.fn();

    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      text: async () =>
        JSON.stringify({
          agent: { id: "agt_test", status: "created" },
        }),
    });

    await registerAgentOrThrow({
      ...baseArgs,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      logger: { info, warn },
    });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(info).toHaveBeenCalledWith(
      "[cogna8] Agent registered (external_id=agent-a, public_id=agt_test, status=created)",
    );
  });

  it("throws on non-2xx response with service-provided detail", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      text: async () => JSON.stringify({ error: "Maximum agents reached" }),
    });

    await expect(
      registerAgentOrThrow({
        ...baseArgs,
        fetchImpl: fetchImpl as unknown as typeof fetch,
        logger: { info: vi.fn(), warn: vi.fn() },
      }),
    ).rejects.toThrow(/Maximum agents reached/);
  });

  it("throws on network failure", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error("network down"));

    await expect(
      registerAgentOrThrow({
        ...baseArgs,
        fetchImpl: fetchImpl as unknown as typeof fetch,
        logger: { info: vi.fn(), warn: vi.fn() },
      }),
    ).rejects.toThrow(/network down/);
  });
});

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

  it("logs and swallows registration failure on non-2xx", async () => {
    const info = vi.fn();
    const warn = vi.fn();

    const fetchImpl = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      text: async () => JSON.stringify({ error: "bad request" }),
    });

    await expect(
      registerAgentOnce({
        baseUrl: "https://example.com",
        apiKey: "cg8_sk_test",
        agentId: "default",
        pluginVersion: "0.2.0",
        fetchImpl: fetchImpl as unknown as typeof fetch,
        logger: { info, warn, error: warn },
      }),
    ).resolves.toBeUndefined();

    expect(warn).toHaveBeenCalled();
    expect(info).not.toHaveBeenCalled();
  });

  it("logs and swallows registration failure on fetch error", async () => {
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
      expect.stringContaining("network down"),
    );
    expect(info).not.toHaveBeenCalled();
  });
});
