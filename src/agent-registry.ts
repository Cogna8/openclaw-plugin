export interface AgentRegistry {
  ensureRegistered(
    externalId: string,
    registrar: () => Promise<void>,
  ): Promise<void>;

  _reset(): void;
  registeredCount(): number;
}

export class InMemoryAgentRegistry implements AgentRegistry {
  private registered = new Set<string>();
  private inFlight = new Map<string, Promise<void>>();

  async ensureRegistered(
    externalId: string,
    registrar: () => Promise<void>,
  ): Promise<void> {
    if (this.registered.has(externalId)) return;

    const existing = this.inFlight.get(externalId);
    if (existing) return existing;

    const promise = (async () => {
      try {
        await registrar();
        this.registered.add(externalId);
      } finally {
        this.inFlight.delete(externalId);
      }
    })();

    this.inFlight.set(externalId, promise);
    return promise;
  }

  _reset(): void {
    this.registered.clear();
    this.inFlight.clear();
  }

  registeredCount(): number {
    return this.registered.size;
  }
}
