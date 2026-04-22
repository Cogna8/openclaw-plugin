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

export interface EvaluateResponse {
  decision: "allow" | "block";
  mode: "normal" | "degraded";
  rule: null | { id: string; type: string };
  reason_code: string | null;
  message: string | null;
  evaluation: { id: string | null; stored: boolean };
}
