import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import plugin from "../src/index.js";
import * as evaluateClient from "../src/evaluate-client.js";
import * as registerClient from "../src/register-client.js";

type HandlerFn = (event: any, ctx: any) => Promise<unknown>;

function makeFakeApi() {
  const handlers: Record<string, HandlerFn> = {};
  const logger = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
  const api = {
    pluginConfig: {
      apiKey: "cg8_sk_test",
      serverUrl: "https://example.com",
      agentId: "default",
    },
    logger,
    on: (evt: string, fn: HandlerFn) => {
      handlers[evt] = fn;
    },
  };
  return { api, handlers, logger };
}

function registerPlugin(api: unknown) {
  const maybePlugin = plugin as unknown as {
    register?: (api: unknown) => void;
  };
  if (typeof maybePlugin.register !== "function") {
    throw new Error(
      "Plugin export does not expose register(api); inspect OpenClaw SDK definePluginEntry return shape",
    );
  }
  maybePlugin.register(api);
}

const fakeEvent = { toolName: "send_email", params: { to: "x@y.z" } };

const allowResponse = {
  decision: "allow" as const,
  mode: "normal" as const,
  evaluation: { id: null, stored: false },
  rule: null,
  reason_code: null,
  message: null,
};

describe("multi-agent identity in before_tool_call", () => {
  let evaluateSpy: ReturnType<typeof vi.spyOn> & {
    mockResolvedValue: (v: unknown) => void;
  };
  let registerSpy: ReturnType<typeof vi.spyOn> & {
    mockResolvedValue: (v: unknown) => void;
    mockRejectedValueOnce: (v: unknown) => unknown;
    mockResolvedValueOnce: (v: unknown) => unknown;
  };

  beforeEach(() => {
    evaluateSpy = vi.spyOn(evaluateClient, "callEvaluate") as never;
    evaluateSpy.mockResolvedValue(allowResponse);
    registerSpy = vi.spyOn(registerClient, "registerAgentOrThrow") as never;
    registerSpy.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("uses ctx.agentId as evaluate agent_id when present", async () => {
    const { api, handlers } = makeFakeApi();
    registerPlugin(api);

    await handlers["before_tool_call"](fakeEvent, {
      sessionId: "s_test",
      agentId: "agent-x",
    });

    expect(evaluateSpy).toHaveBeenCalledTimes(1);
    const [, request] = (evaluateSpy as unknown as { mock: { calls: any[][] } })
      .mock.calls[0];
    expect(request.agent_id).toBe("agent-x");
  });

  it("falls back to config.agentId when ctx.agentId is undefined", async () => {
    const { api, handlers } = makeFakeApi();
    registerPlugin(api);

    await handlers["before_tool_call"](fakeEvent, { sessionId: "s_test" });

    const [, request] = (evaluateSpy as unknown as { mock: { calls: any[][] } })
      .mock.calls[0];
    expect(request.agent_id).toBe("default");
  });

  it("falls back to config.agentId when ctx.agentId is empty", async () => {
    const { api, handlers } = makeFakeApi();
    registerPlugin(api);

    await handlers["before_tool_call"](fakeEvent, {
      sessionId: "s_test",
      agentId: "",
    });

    const [, request] = (evaluateSpy as unknown as { mock: { calls: any[][] } })
      .mock.calls[0];
    expect(request.agent_id).toBe("default");
  });

  it("falls back to config.agentId when ctx.agentId is whitespace", async () => {
    const { api, handlers } = makeFakeApi();
    registerPlugin(api);

    await handlers["before_tool_call"](fakeEvent, {
      sessionId: "s_test",
      agentId: "   ",
    });

    const [, request] = (evaluateSpy as unknown as { mock: { calls: any[][] } })
      .mock.calls[0];
    expect(request.agent_id).toBe("default");
  });

  it("registers an agent only once across repeat calls with the same ctx.agentId", async () => {
    const { api, handlers } = makeFakeApi();
    registerPlugin(api);

    await handlers["before_tool_call"](fakeEvent, {
      sessionId: "s_test",
      agentId: "agent-x",
    });
    await handlers["before_tool_call"](fakeEvent, {
      sessionId: "s_test",
      agentId: "agent-x",
    });

    const calls = (registerSpy as unknown as { mock: { calls: any[][] } }).mock
      .calls;
    const xCalls = calls.filter((c) => c[0].agentId === "agent-x");
    expect(xCalls).toHaveLength(1);
  });

  it("registers each distinct ctx.agentId independently", async () => {
    const { api, handlers } = makeFakeApi();
    registerPlugin(api);

    await handlers["before_tool_call"](fakeEvent, {
      sessionId: "s_test",
      agentId: "agent-a",
    });
    await handlers["before_tool_call"](fakeEvent, {
      sessionId: "s_test",
      agentId: "agent-b",
    });

    const calls = (registerSpy as unknown as { mock: { calls: any[][] } }).mock
      .calls;
    const externalIds = calls.map((c) => c[0].agentId).sort();
    expect(externalIds).toEqual(["agent-a", "agent-b"]);
  });

  it("does not cache failed registration; next call retries registration", async () => {
    registerSpy.mockReset();
    registerSpy.mockRejectedValueOnce(new Error("Maximum agents reached"));
    registerSpy.mockResolvedValueOnce(undefined);

    const { api, handlers } = makeFakeApi();
    registerPlugin(api);

    await handlers["before_tool_call"](fakeEvent, {
      sessionId: "s_test",
      agentId: "agent-c",
    });
    await handlers["before_tool_call"](fakeEvent, {
      sessionId: "s_test",
      agentId: "agent-c",
    });

    const calls = (registerSpy as unknown as { mock: { calls: any[][] } }).mock
      .calls;
    const cCalls = calls.filter((c) => c[0].agentId === "agent-c");
    expect(cCalls).toHaveLength(2);
  });
});
