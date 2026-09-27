import { describe, expect, it, vi } from "vitest";
import { InMemoryEventEmitter } from "./inMemoryEventEmitter.js";

describe("InMemoryEventEmitter", () => {
  it("reports a subscriber failure without turning a committed operation into a false error", async () => {
    const report = vi.fn();
    const events = new InMemoryEventEmitter(report);
    const second = vi.fn();
    events.subscribe("ProjectUpdated", async () => { throw new Error("audit unavailable"); });
    events.subscribe("ProjectUpdated", second);

    await expect(events.emit({
      type: "ProjectUpdated",
      eventId: crypto.randomUUID(),
      occurredAt: new Date(),
      actorId: 1,
      actorName: "Admin",
    })).resolves.toBeUndefined();
    expect(second).toHaveBeenCalledOnce();
    expect(report).toHaveBeenCalledWith("ProjectUpdated", expect.any(Error));
  });

  it("fails closed when a security event cannot be audited", async () => {
    const events = new InMemoryEventEmitter(() => undefined);
    events.subscribe("LoginSuccess", async () => { throw new Error("audit unavailable"); });
    await expect(events.emit({
      type: "LoginSuccess",
      eventId: crypto.randomUUID(),
      occurredAt: new Date(),
      actorId: 1,
      actorName: "Admin",
    })).rejects.toThrow("No se pudo auditar");
  });
});
