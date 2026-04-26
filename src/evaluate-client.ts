import {
  BreakerOpenError,
  CircuitBreaker,
  defaultBreaker,
} from "./circuit-breaker.js";
import type {
  Cogna8PluginConfig,
  EvaluateRequest,
  EvaluateResponse,
} from "./types.js";

const RETRY_DELAY_MS = 200;
const TRANSIENT_HTTP_CODES = new Set([502, 503, 504]);
const TRANSIENT_NETWORK_CODES = new Set([
  "ECONNRESET",
  "ETIMEDOUT",
  "EAI_AGAIN",
  "ENETUNREACH",
]);

type FailureClass = "transient" | "final";

interface Logger {
  debug?: (msg: string) => void;
  info?: (msg: string) => void;
  warn?: (msg: string) => void;
}

export interface CallEvaluateDeps {
  breaker: CircuitBreaker;
  logger?: Logger;
}

function classifyError(err: unknown): FailureClass {
  if (err instanceof Error && err.name === "AbortError") return "final";

  if (err && typeof err === "object" && "cause" in err) {
    const cause = (err as { cause?: unknown }).cause;
    if (cause && typeof cause === "object" && "code" in cause) {
      const code = String((cause as { code: unknown }).code);
      if (TRANSIENT_NETWORK_CODES.has(code)) return "transient";
    }
  }

  return "final";
}

function classifyHttp(status: number): FailureClass {
  return TRANSIENT_HTTP_CODES.has(status) ? "transient" : "final";
}

function isHttpError(err: unknown): err is Error & { httpStatus: number } {
  return (
    err instanceof Error &&
    typeof (err as { httpStatus?: unknown }).httpStatus === "number"
  );
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new Error("aborted during retry delay"));
      return;
    }
    const timer = setTimeout(resolve, ms);
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(new Error("aborted during retry delay"));
      },
      { once: true },
    );
  });
}

async function attemptOnce(
  config: Cogna8PluginConfig,
  request: EvaluateRequest,
  signal: AbortSignal,
): Promise<EvaluateResponse> {
  const response = await fetch(`${config.serverUrl}/api/v1/evaluate`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify(request),
    signal,
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    const err = new Error(
      `Cogna8 evaluate returned HTTP ${response.status}${body ? `: ${body}` : ""}`,
    ) as Error & { httpStatus: number };
    err.httpStatus = response.status;
    throw err;
  }

  return (await response.json()) as EvaluateResponse;
}

export async function callEvaluate(
  config: Cogna8PluginConfig,
  request: EvaluateRequest,
  deps: CallEvaluateDeps = { breaker: defaultBreaker },
): Promise<EvaluateResponse> {
  if (deps.breaker.isOpen()) {
    throw new BreakerOpenError("breaker_open");
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.timeoutMs);

  try {
    try {
      const result = await attemptOnce(config, request, controller.signal);
      deps.breaker.recordSuccess();
      return result;
    } catch (err) {
      const cls = isHttpError(err)
        ? classifyHttp(err.httpStatus)
        : classifyError(err);

      if (cls === "final") {
        throw err;
      }

      deps.breaker.recordTransientFailure();
      deps.logger?.debug?.(
        `[cogna8] Transient failure, retrying once: ${(err as Error).message}`,
      );

      if (controller.signal.aborted) {
        throw err;
      }

      await sleep(RETRY_DELAY_MS, controller.signal);

      try {
        const result = await attemptOnce(config, request, controller.signal);
        deps.breaker.recordSuccess();
        return result;
      } catch (retryErr) {
        const retryCls = isHttpError(retryErr)
          ? classifyHttp(retryErr.httpStatus)
          : classifyError(retryErr);
        if (retryCls === "transient") {
          deps.breaker.recordTransientFailure();
        }
        throw retryErr;
      }
    }
  } finally {
    clearTimeout(timer);
  }
}
