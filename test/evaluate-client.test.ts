import { afterEach, describe, expect, it, vi } from "vitest";
import { callEvaluate } from "../src/evaluate-client.js";
import { CircuitBreaker } from "../src/circuit-breaker.js";

const baseConfig = {
  apiKey: "cg8_sk_test",
  serverUrl: "https://example.com",
  agentId: "default",
  timeoutMs: 3000,
  failureMode: "open" as const,
};

function makeReq() {
  return {
    agent_id: "default",
    session: { id: "s_test" },
    tool_call: { tool_name: "send_email" },
  };
}

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

describe("callEvaluate retry behavior", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("retries once on 503 and succeeds", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 503,
        text: async () => "",
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          decision: "allow",
          mode: "normal",
          evaluation: { id: null, stored: false },
        }),
      });
    vi.stubGlobal("fetch", fetchMock);

    const breaker = new CircuitBreaker(5, 30_000);
    const result = await callEvaluate(baseConfig, makeReq(), { breaker });

    expect(result.decision).toBe("allow");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does NOT retry on 401", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce({
      ok: false,
      status: 401,
      text: async () => "unauthorized",
    });
    vi.stubGlobal("fetch", fetchMock);

    const breaker = new CircuitBreaker(5, 30_000);
    await expect(
      callEvaluate(baseConfig, makeReq(), { breaker }),
    ).rejects.toThrow(/HTTP 401/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does NOT retry on 500", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce({
      ok: false,
      status: 500,
      text: async () => "",
    });
    vi.stubGlobal("fetch", fetchMock);

    const breaker = new CircuitBreaker(5, 30_000);
    await expect(
      callEvaluate(baseConfig, makeReq(), { breaker }),
    ).rejects.toThrow(/HTTP 500/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("retries on ECONNRESET", async () => {
    const netErr = new Error("fetch failed");
    (netErr as Error & { cause: { code: string } }).cause = {
      code: "ECONNRESET",
    };
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(netErr)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          decision: "allow",
          mode: "normal",
          evaluation: { id: null, stored: false },
        }),
      });
    vi.stubGlobal("fetch", fetchMock);

    const breaker = new CircuitBreaker(5, 30_000);
    const result = await callEvaluate(baseConfig, makeReq(), { breaker });
    expect(result.decision).toBe("allow");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("propagates AbortError without retry when timeout fires mid-call", async () => {
    const abortErr = new Error("aborted");
    abortErr.name = "AbortError";
    const fetchMock = vi.fn().mockRejectedValueOnce(abortErr);
    vi.stubGlobal("fetch", fetchMock);

    const breaker = new CircuitBreaker(5, 30_000);
    await expect(
      callEvaluate(baseConfig, makeReq(), { breaker }),
    ).rejects.toThrow(/aborted/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("throws BreakerOpenError without calling fetch when breaker is open", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const breaker = new CircuitBreaker(2, 30_000);
    breaker.recordTransientFailure();
    breaker.recordTransientFailure();
    expect(breaker.isOpen()).toBe(true);

    await expect(
      callEvaluate(baseConfig, makeReq(), { breaker }),
    ).rejects.toThrow(/breaker_open/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
