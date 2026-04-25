import { afterEach, describe, expect, it, vi } from "vitest";
import { reportResolution } from "../src/resolve-client.js";
import type { PluginApprovalResolution } from "../src/types.js";

const baseConfig = {
  apiKey: "cg8_sk_test",
  serverUrl: "https://example.com",
  agentId: "default",
  timeoutMs: 3000,
  failureMode: "open" as const,
};

describe("reportResolution", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("posts to the correct URL with bearer auth and maps allow-once to allow_once", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, text: async () => "" });
    vi.stubGlobal("fetch", fetchMock);

    await reportResolution(baseConfig, "ev_abc", "allow-once");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://example.com/api/v1/decisions/ev_abc/resolve");
    expect(init.method).toBe("POST");
    expect(init.headers).toMatchObject({
      Authorization: "Bearer cg8_sk_test",
      "Content-Type": "application/json",
    });
    expect(JSON.parse(init.body)).toEqual({ resolution: "allow_once" });
  });

  it("maps all five resolution values to the underscore enum", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, text: async () => "" });
    vi.stubGlobal("fetch", fetchMock);

    const cases: Array<[PluginApprovalResolution, string]> = [
      ["allow-once", "allow_once"],
      ["allow-always", "allow_always"],
      ["deny", "deny"],
      ["timeout", "timeout"],
      ["cancelled", "cancelled"],
    ];

    for (const [input, expected] of cases) {
      fetchMock.mockClear();
      await reportResolution(baseConfig, "ev_x", input);
      const body = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(body.resolution).toBe(expected);
    }
  });

  it("does not throw when fetch rejects", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("network dead")),
    );

    await expect(
      reportResolution(baseConfig, "ev_abc", "deny"),
    ).resolves.toBeUndefined();
  });

  it("does not throw on non-2xx responses", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 500, text: async () => "boom" }),
    );

    await expect(
      reportResolution(baseConfig, "ev_abc", "deny"),
    ).resolves.toBeUndefined();
  });

  it("aborts fetch after the 3000ms timeout", async () => {
    vi.useFakeTimers();

    let capturedSignal: AbortSignal | undefined;
    const fetchMock = vi.fn((_url: string, init: RequestInit) => {
      capturedSignal = init.signal as AbortSignal;
      return new Promise((resolve) => {
        init.signal?.addEventListener("abort", () => {
          resolve({ ok: false, text: async () => "" });
        });
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const promise = reportResolution(baseConfig, "ev_abc", "timeout");

    await vi.advanceTimersByTimeAsync(2999);
    expect(capturedSignal?.aborted).toBe(false);

    await vi.advanceTimersByTimeAsync(1);
    await expect(promise).resolves.toBeUndefined();
    expect(capturedSignal?.aborted).toBe(true);
  });
});
