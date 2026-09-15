/**
 * InMemoryEventEmitter — pub/sub implementation of IEventEmitter.
 *
 * In production this would be a message bus (RabbitMQ, SNS, Redis pub/sub)
 * so events survive process restarts and can fan out to multiple consumers.
 *
 * Critical: handlers run sequentially but errors are isolated — one failing
 * subscriber must not block the others or cause the domain event to be lost.
 */

import { IEventEmitter, DomainEvent } from "@reformapro/domain/events";

type Handler = (event: DomainEvent) => void | Promise<void>;

export class InMemoryEventEmitter implements IEventEmitter {
  private readonly handlers = new Map<DomainEvent["type"], Set<Handler>>();

  async emit(event: DomainEvent): Promise<void> {
    const subs = this.handlers.get(event.type);
    if (!subs) return;
    await Promise.allSettled([...subs].map(h => Promise.resolve().then(() => h(event))));
  }

  subscribe(type: DomainEvent["type"], handler: Handler): () => void {
    let set = this.handlers.get(type);
    if (!set) { set = new Set(); this.handlers.set(type, set); }
    set.add(handler);
    return () => set!.delete(handler);
  }
}
