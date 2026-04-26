import { describe, it, expect, vi } from "vitest";
import { InMemoryAgentRegistry } from "../src/agent-registry.js";

describe("InMemoryAgentRegistry", () => {
  it("calls registrar exactly once per externalId", async () => {
    const r = new InMemoryAgentRegistry();
    const fn = vi.fn().mockResolvedValue(undefined);

    await r.ensureRegistered("agent-a", fn);
    await r.ensureRegistered("agent-a", fn);
    await r.ensureRegistered("agent-a", fn);

    expect(fn).toHaveBeenCalledTimes(1);
    expect(r.registeredCount()).toBe(1);
  });

  it("calls registrar separately per distinct externalId", async () => {
    const r = new InMemoryAgentRegistry();
    const fn = vi.fn().mockResolvedValue(undefined);

    await r.ensureRegistered("agent-a", fn);
    await r.ensureRegistered("agent-b", fn);

    expect(fn).toHaveBeenCalledTimes(2);
    expect(r.registeredCount()).toBe(2);
  });

  it("coalesces concurrent first-sight registrations onto one promise", async () => {
    const r = new InMemoryAgentRegistry();

    let resolveInner!: () => void;
    const inner = new Promise<void>((resolve) => {
      resolveInner = resolve;
    });

    const fn = vi.fn().mockReturnValue(inner);

    const callers = [
      r.ensureRegistered("agent-a", fn),
      r.ensureRegistered("agent-a", fn),
      r.ensureRegistered("agent-a", fn),
      r.ensureRegistered("agent-a", fn),
      r.ensureRegistered("agent-a", fn),
    ];

    expect(fn).toHaveBeenCalledTimes(1);

    resolveInner();
    await Promise.all(callers);

    expect(fn).toHaveBeenCalledTimes(1);
    expect(r.registeredCount()).toBe(1);
  });

  it("does not cache failed registrations; next call retries", async () => {
    const r = new InMemoryAgentRegistry();
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValueOnce(undefined);

    await expect(r.ensureRegistered("agent-a", fn)).rejects.toThrow("boom");
    expect(r.registeredCount()).toBe(0);

    await r.ensureRegistered("agent-a", fn);

    expect(fn).toHaveBeenCalledTimes(2);
    expect(r.registeredCount()).toBe(1);
  });

  it("_reset clears all state", async () => {
    const r = new InMemoryAgentRegistry();
    const fn = vi.fn().mockResolvedValue(undefined);

    await r.ensureRegistered("agent-a", fn);
    expect(r.registeredCount()).toBe(1);

    r._reset();

    await r.ensureRegistered("agent-a", fn);
    expect(fn).toHaveBeenCalledTimes(2);
    expect(r.registeredCount()).toBe(1);
  });
});
