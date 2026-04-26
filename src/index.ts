import { definePluginEntry } from "openclaw/plugin-sdk/plugin-entry";
import type { OpenClawPluginApi } from "openclaw/plugin-sdk/plugin-entry";
import { InMemoryAgentRegistry } from "./agent-registry.js";
import { BreakerOpenError, CircuitBreaker } from "./circuit-breaker.js";
import { normalizeConfig } from "./config.js";
import { callEvaluate } from "./evaluate-client.js";
import { PLUGIN_VERSION, registerAgentOrThrow } from "./register-client.js";
import { reportResolution } from "./resolve-client.js";
import type {
  Cogna8PluginConfig,
  EvaluateRequest,
  PluginApprovalResolution,
} from "./types.js";
import { clampString, truncateRawInput } from "./utils.js";

export default definePluginEntry({
  id: "cogna8",
  name: "Cogna8 Action Authority",
  description: "Gate OpenClaw tool calls through Cogna8's action authority runtime",

  register(api: OpenClawPluginApi) {
    let config: Cogna8PluginConfig;
    try {
      config = normalizeConfig(api.pluginConfig);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      api.logger.warn(`[cogna8] Plugin loaded without valid config: ${message}`);
      return;
    }

    const breaker = new CircuitBreaker(5, 30_000, api.logger);
    const registry = new InMemoryAgentRegistry();

    function resolveEffectiveAgentId(ctx: { agentId?: string }): string {
      return typeof ctx.agentId === "string" && ctx.agentId.trim().length > 0
        ? ctx.agentId.trim()
        : config.agentId;
    }

    async function ensureAgentRegistered(agentId: string): Promise<void> {
      await registry.ensureRegistered(agentId, async () => {
        await registerAgentOrThrow({
          baseUrl: config.serverUrl,
          apiKey: config.apiKey,
          agentId,
          pluginVersion: PLUGIN_VERSION,
          logger: api.logger,
        });
      });
    }

    api.on("before_tool_call", async (event, ctx) => {
      const effectiveAgentId = resolveEffectiveAgentId(ctx);

      try {
        await ensureAgentRegistered(effectiveAgentId);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        api.logger.warn(
          `[cogna8] Lazy registration of agent ${effectiveAgentId} failed: ${message}; proceeding to evaluate so failureMode can apply if needed`,
        );
      }

      const request: EvaluateRequest = {
        agent_id: effectiveAgentId,
        session: {
          id: clampString(ctx.sessionId ?? ctx.sessionKey, "unknown", 256),
          ...(typeof ctx.sessionKey === "string" && ctx.sessionKey.length > 0
            ? { key: ctx.sessionKey.slice(0, 512) }
            : {}),
        },
        tool_call: {
          tool_name: clampString(event.toolName, "unknown_tool", 128),
          ...(() => {
            const rawInput = truncateRawInput(event.params);
            return rawInput ? { raw_input: rawInput } : {};
          })(),
        },
      };

      try {
        const result = await callEvaluate(config, request, {
          breaker,
          logger: api.logger,
        });

        if (result.decision === "confirm") {
          api.logger.info(
            `[cogna8] Approval required for ${request.tool_call.tool_name} (decision_id=${result.decision_id})`,
          );

          return {
            requireApproval: {
              title: result.prompt.title,
              description: result.prompt.description,
              severity: result.prompt.severity,
              timeoutMs: result.timeout_ms,
              timeoutBehavior: result.timeout_behavior,
              pluginId: "cogna8",
              onResolution: async (decision: PluginApprovalResolution) => {
                try {
                  await reportResolution(config, result.decision_id, decision);
                } catch (err: unknown) {
                  api.logger.warn(
                    `[cogna8] Failed to report resolution for ${result.decision_id}: ${err instanceof Error ? err.message : String(err)}`,
                  );
                }
              },
            },
          };
        }

        if (result.decision === "block") {
          api.logger.info(
            `[cogna8] Blocked tool call ${request.tool_call.tool_name} (rule: ${result.rule?.id ?? "unknown"}, reason: ${result.reason_code ?? "unspecified"})`,
          );

          return {
            block: true,
            blockReason:
              result.message ??
              `Blocked by Cogna8 (${result.reason_code ?? "policy"})`,
          };
        }

        return;
      } catch (error) {
        if (error instanceof BreakerOpenError) {
          api.logger.warn(
            "[cogna8] Breaker open, applying failureMode without calling service",
          );
        } else {
          const message =
            error instanceof Error ? error.message : String(error);
          api.logger.warn(`[cogna8] Evaluate failed: ${message}`);
        }

        if (config.failureMode === "closed") {
          return {
            block: true,
            blockReason: "Cogna8 unreachable, fail-closed mode active",
          };
        }

        return;
      }
    });

    api.on("gateway_start", async () => {
      try {
        await ensureAgentRegistered(config.agentId);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        api.logger.warn(
          `[cogna8] Default agent warm-up registration failed: ${message}`,
        );
      }
    });

    api.logger.info(
      `[cogna8] Registered. Evaluating tool calls against ${config.serverUrl} (agent: ${config.agentId}, failureMode: ${config.failureMode})`,
    );
  },
});
