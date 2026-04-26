import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import plugin from "../src/index.js";
import * as evaluateClient from "../src/evaluate-client.js";
import * as registerClient from "../src/register-client.js";
import * as resolveClient from "../src/resolve-client.js";
import type { PluginApprovalResolution } from "../src/types.js";

type HandlerFn = (event: any, ctx: any) => Promise<unknown>;

function makeFakeApi() {
  const handlers: Record<string, HandlerFn> = {};
  const logger = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
  const api = {
    pluginConfig: { apiKey: "cg8_sk_test", serverUrl: "https://example.com" },
    logger,
    on: (evt: string, fn: HandlerFn) => {
      handlers[evt] = fn;
    },
  };
  return { api, handlers, logger };
}

function registerPlugin(api: unknown) {
  const maybePlugin = plugin as unknown as { register?: (api: unknown) => void };
  if (typeof maybePlugin.register !== "function") {
    throw new Error("Plugin export does not expose register(api); inspect OpenClaw SDK definePluginEntry return shape");
  }
  maybePlugin.register(api);
}

const fakeCtx = { sessionId: "s_test", sessionKey: "k_test" };
const fakeEvent = { toolName: "run_shell", params: { cmd: "sudo rm -rf /" } };

describe("before_tool_call confirm branch", () => {
  let evaluateSpy: ReturnType<typeof vi.spyOn> & {
    mockResolvedValue: (v: unknown) => void;
  };
  let resolveSpy: ReturnType<typeof vi.spyOn> & {
    mockResolvedValue: (v: unknown) => void;
    mockRejectedValue: (v: unknown) => void;
  };

  beforeEach(() => {
    evaluateSpy = vi.spyOn(evaluateClient, "callEvaluate") as never;
    resolveSpy = vi.spyOn(resolveClient, "reportResolution") as never;
    resolveSpy.mockResolvedValue(undefined);
    vi.spyOn(registerClient, "registerAgentOrThrow").mockResolvedValue(
      undefined,
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns requireApproval when the service replies with decision=confirm", async () => {
    evaluateSpy.mockResolvedValue({
      decision: "confirm",
      decision_id: "ev_abc",
      mode: "normal",
      evaluation: { id: "ev_abc", stored: true },
      rule: { id: "rule_1", type: "confirm" },
      reason_code: "confirmation_required",
      prompt: {
        title: "Confirm sudo",
        description: "Agent is about to run: sudo rm -rf /",
        severity: "critical",
      },
      timeout_ms: 60000,
      timeout_behavior: "deny",
    });

    const { api, handlers } = makeFakeApi();
    registerPlugin(api);

    const result = (await handlers["before_tool_call"](
      fakeEvent,
      fakeCtx,
    )) as { requireApproval: Record<string, unknown> };

    expect(result.requireApproval).toMatchObject({
      title: "Confirm sudo",
      description: "Agent is about to run: sudo rm -rf /",
      severity: "critical",
      timeoutMs: 60000,
      timeoutBehavior: "deny",
      pluginId: "cogna8",
    });
    expect(typeof result.requireApproval.onResolution).toBe("function");
  });

  it("onResolution forwards decisionId + resolution to reportResolution", async () => {
    evaluateSpy.mockResolvedValue({
      decision: "confirm",
      decision_id: "ev_xyz",
      mode: "normal",
      evaluation: { id: "ev_xyz", stored: true },
      rule: { id: "rule_1", type: "confirm" },
      reason_code: "confirmation_required",
      prompt: { title: "t", description: "d", severity: "warning" },
      timeout_ms: 5000,
      timeout_behavior: "deny",
    });

    const { api, handlers } = makeFakeApi();
    registerPlugin(api);

    const result = (await handlers["before_tool_call"](fakeEvent, fakeCtx)) as {
      requireApproval: {
        onResolution: (r: PluginApprovalResolution) => Promise<void>;
      };
    };

    await result.requireApproval.onResolution("allow-once");
    expect(resolveSpy).toHaveBeenCalledWith(
      expect.objectContaining({ apiKey: "cg8_sk_test" }),
      "ev_xyz",
      "allow-once",
    );
  });

  it("onResolution does not throw when reportResolution rejects", async () => {
    resolveSpy.mockRejectedValue(new Error("audit post failed"));
    evaluateSpy.mockResolvedValue({
      decision: "confirm",
      decision_id: "ev_xyz",
      mode: "normal",
      evaluation: { id: "ev_xyz", stored: true },
      rule: { id: "rule_1", type: "confirm" },
      reason_code: "confirmation_required",
      prompt: { title: "t", description: "d", severity: "warning" },
      timeout_ms: 5000,
      timeout_behavior: "deny",
    });

    const { api, handlers, logger } = makeFakeApi();
    registerPlugin(api);

    const result = (await handlers["before_tool_call"](fakeEvent, fakeCtx)) as {
      requireApproval: {
        onResolution: (r: PluginApprovalResolution) => Promise<void>;
      };
    };

    await expect(
      result.requireApproval.onResolution("deny"),
    ).resolves.toBeUndefined();
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining("Failed to report resolution for ev_xyz"),
    );
  });

  it("block path still returns { block: true, blockReason }", async () => {
    evaluateSpy.mockResolvedValue({
      decision: "block",
      mode: "normal",
      evaluation: { id: "ev_1", stored: true },
      rule: { id: "rule_block", type: "block" },
      reason_code: "blocked_tool",
      message: "shell disallowed",
    });

    const { api, handlers } = makeFakeApi();
    registerPlugin(api);

    const result = await handlers["before_tool_call"](fakeEvent, fakeCtx);
    expect(result).toEqual({ block: true, blockReason: "shell disallowed" });
  });

  it("allow path returns undefined", async () => {
    evaluateSpy.mockResolvedValue({
      decision: "allow",
      mode: "normal",
      evaluation: { id: null, stored: false },
      rule: null,
      reason_code: null,
      message: null,
    });

    const { api, handlers } = makeFakeApi();
    registerPlugin(api);

    const result = await handlers["before_tool_call"](fakeEvent, fakeCtx);
    expect(result).toBeUndefined();
  });
});
