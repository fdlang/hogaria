import { describe, expect, it, vi } from "vitest";
import { InMemoryEventEmitter } from "./inMemoryEventEmitter.js";

describe("InMemoryEventEmitter", () => {
  it("reports a critical subscriber failure after running every subscriber", async () => {
    const events = new InMemoryEventEmitter();
    const second = vi.fn();
    events.subscribe("LoginSuccess", async () => { throw new Error("audit unavailable"); });
    events.subscribe("LoginSuccess", second);

    await expect(events.emit({
      type: "LoginSuccess",
      eventId: crypto.randomUUID(),
      occurredAt: new Date(),
      actorId: 1,
      actorName: "Admin",
    })).rejects.toThrow("audit unavailable");
    expect(second).toHaveBeenCalledOnce();
  });
});
