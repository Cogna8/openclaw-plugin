export class BreakerOpenError extends Error {
  constructor(message = "breaker_open") {
    super(message);
    this.name = "BreakerOpenError";
  }
}

export interface BreakerLogger {
  info: (msg: string) => void;
  warn: (msg: string) => void;
}

const BREAKER_THRESHOLD = 5;
const BREAKER_COOLDOWN_MS = 30_000;

export class CircuitBreaker {
  private failures = 0;
  private openedAt: number | null = null;
  private retryCount = 0;

  constructor(
    private readonly threshold: number,
    private readonly cooldownMs: number,
    private readonly logger?: BreakerLogger,
    private readonly now: () => number = Date.now,
  ) {}

  isOpen(): boolean {
    if (this.openedAt === null) return false;
    if (this.now() - this.openedAt >= this.cooldownMs) {
      this.logger?.info("[cogna8] Circuit breaker cooled down, closing");
      this.openedAt = null;
      this.failures = 0;
      return false;
    }
    return true;
  }

  recordSuccess(): void {
    this.failures = 0;
    if (this.openedAt !== null) {
      this.logger?.info("[cogna8] Circuit breaker closed after successful call");
      this.openedAt = null;
    }
  }

  recordTransientFailure(): void {
    this.retryCount += 1;
    this.failures += 1;
    if (this.failures >= this.threshold && this.openedAt === null) {
      this.openedAt = this.now();
      this.logger?.warn(
        `[cogna8] Circuit breaker opened after ${this.failures} consecutive transient failures; bypassing service for ${this.cooldownMs}ms`,
      );
    }
  }

  getRetryCount(): number {
    return this.retryCount;
  }

  _reset(): void {
    this.failures = 0;
    this.openedAt = null;
    this.retryCount = 0;
  }
}

export const defaultBreaker = new CircuitBreaker(
  BREAKER_THRESHOLD,
  BREAKER_COOLDOWN_MS,
  console,
);
