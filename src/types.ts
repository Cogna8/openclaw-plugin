export type FailureMode = "open" | "closed";

export interface Cogna8PluginConfig {
  apiKey: string;
  serverUrl: string;
  agentId: string;
  timeoutMs: number;
  failureMode: FailureMode;
}

export interface EvaluateRequest {
  agent_id: string;
  session: {
    id: string;
    key?: string;
  };
  tool_call: {
    tool_name: string;
    raw_input?: Record<string, unknown>;
  };
}

export type RuleRef = { id: string; type: string };
export type EvalMode = "normal" | "degraded";
export type EvalEnvelope = { id: string | null; stored: boolean };

export type EvaluateResponse =
  | {
      decision: "allow";
      mode: EvalMode;
      evaluation: EvalEnvelope;
      rule?: RuleRef | null;
      reason_code?: string | null;
      message?: string | null;
    }
  | {
      decision: "block";
      mode: EvalMode;
      evaluation: EvalEnvelope;
      rule?: RuleRef | null;
      reason_code?: string | null;
      message?: string | null;
    }
  | {
      decision: "confirm";
      decision_id: string;
      mode: EvalMode;
      evaluation: { id: string; stored: true };
      rule: RuleRef;
      reason_code: "confirmation_required";
      prompt: {
        title: string;
        description: string;
        severity: "warning" | "critical";
      };
      timeout_ms: number;
      timeout_behavior: "deny";
    };

export type PluginApprovalResolution =
  | "allow-once"
  | "allow-always"
  | "deny"
  | "timeout"
  | "cancelled";
