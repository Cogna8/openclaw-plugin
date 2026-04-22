import { afterEach, describe, expect, it, vi } from "vitest";
import { callEvaluate } from "../src/evaluate-client.js";

const baseConfig = {
  apiKey: "cg8_sk_test",
  serverUrl: "https://example.com",
  agentId: "default",
  timeoutMs: 3000,
  failureMode: "open" as const,
};

describe("callEvaluate", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("posts evaluate requests and returns the parsed decision", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        decision: "allow",
        mode: "normal",
        rule: null,
        reason_code: null,
        message: null,
        evaluation: { id: "ev_test", stored: true },
      }),
    });

    vi.stubGlobal("fetch", fetchMock);

    const result = await callEvaluate(baseConfig, {
      agent_id: "default",
      session: { id: "s_test" },
      tool_call: { tool_name: "send_email" },
    });

    expect(result.decision).toBe("allow");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://example.com/api/v1/evaluate",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer cg8_sk_test",
        }),
      }),
    );
  });

  it("throws on non-200 responses", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => '{"error":"unauthorized"}',
    });

    vi.stubGlobal("fetch", fetchMock);

    await expect(
      callEvaluate(baseConfig, {
        agent_id: "default",
        session: { id: "s_test" },
        tool_call: { tool_name: "send_email" },
      }),
    ).rejects.toThrow(/HTTP 401/);
  });
});
