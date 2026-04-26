import { describe, it, expect } from "vitest";
import { CircuitBreaker } from "../src/circuit-breaker.js";

describe("CircuitBreaker", () => {
  it("opens after threshold consecutive transient failures", () => {
    const b = new CircuitBreaker(3, 1_000);
    expect(b.isOpen()).toBe(false);
    b.recordTransientFailure();
    b.recordTransientFailure();
    expect(b.isOpen()).toBe(false);
    b.recordTransientFailure();
    expect(b.isOpen()).toBe(true);
  });

  it("a single success resets the failure counter", () => {
    const b = new CircuitBreaker(3, 1_000);
    b.recordTransientFailure();
    b.recordTransientFailure();
    b.recordSuccess();
    b.recordTransientFailure();
    b.recordTransientFailure();
    expect(b.isOpen()).toBe(false);
  });

  it("closes automatically after cooldown elapses", () => {
    let now = 1_000;
    const b = new CircuitBreaker(2, 30_000, undefined, () => now);
    b.recordTransientFailure();
    b.recordTransientFailure();
    expect(b.isOpen()).toBe(true);

    now = 1_000 + 29_999;
    expect(b.isOpen()).toBe(true);

    now = 1_000 + 30_000;
    expect(b.isOpen()).toBe(false);
  });

  it("retry counter is monotonic across opens and closes", () => {
    const b = new CircuitBreaker(2, 1_000);
    b.recordTransientFailure();
    b.recordTransientFailure();
    expect(b.getRetryCount()).toBe(2);
    b.recordSuccess();
    expect(b.getRetryCount()).toBe(2);
    b.recordTransientFailure();
    expect(b.getRetryCount()).toBe(3);
  });

  it("opening is idempotent — recording more failures while open does not reset cooldown", () => {
    let now = 1_000;
    const b = new CircuitBreaker(2, 30_000, undefined, () => now);
    b.recordTransientFailure();
    b.recordTransientFailure();
    now = 1_000 + 10_000;
    b.recordTransientFailure();
    now = 1_000 + 30_000;
    expect(b.isOpen()).toBe(false);
  });
});
