/**
 * InMemoryEventEmitter — pub/sub implementation of IEventEmitter.
 *
 * In production this would be a message bus (RabbitMQ, SNS, Redis pub/sub)
 * so events survive process restarts and can fan out to multiple consumers.
 *
 * Handlers run concurrently with isolated errors. This emitter is not durable;
 * critical client notifications and the business-write audit are persisted
 * transactionally by SQL triggers. These subscribers enrich that durable trail.
 */

import { IEventEmitter, DomainEvent } from "@reformapro/domain/events";

type Handler = (event: DomainEvent) => void | Promise<void>;

export class InMemoryEventEmitter implements IEventEmitter {
  private readonly handlers = new Map<DomainEvent["type"], Set<Handler>>();
  constructor(
    private readonly report: (eventType: string, error: unknown) => void =
      (eventType) => console.error("DOMAIN_EVENT_SUBSCRIBER_FAILED", eventType),
    private readonly blockingTypes = new Set<DomainEvent["type"]>([
      "LoginSuccess",
      "UserAccessResetRequested",
    ]),
  ) {}

  async emit(event: DomainEvent): Promise<void> {
    const subs = this.handlers.get(event.type);
    if (!subs) return;
    const results = await Promise.allSettled([...subs].map(h => Promise.resolve().then(() => h(event))));
    const failures: unknown[] = [];
    results.forEach((result) => {
      if (result.status === "rejected") this.report(event.type, result.reason);
      if (result.status === "rejected") failures.push(result.reason);
    });
    if (failures.length && this.blockingTypes.has(event.type))
      throw new AggregateError(failures, `No se pudo auditar ${event.type}`);
  }

  subscribe(type: DomainEvent["type"], handler: Handler): () => void {
    let set = this.handlers.get(type);
    if (!set) { set = new Set(); this.handlers.set(type, set); }
    set.add(handler);
    return () => set!.delete(handler);
  }
}
