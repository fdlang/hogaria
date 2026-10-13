import { describe, expect, it, vi } from "vitest";
import { userNotificationController } from "./userNotificationController.js";

describe("user notification cursor", () => {
  it("rejects malformed cursors before reaching PostgreSQL", async () => {
    const list = vi.fn();
    const controller = userNotificationController({ list } as never);
    const response = await controller.list({ actorId: 1, params: {}, query: { cursor: "not-a-cursor" } });
    expect(response.status).toBe(422);
    expect(list).not.toHaveBeenCalled();
  });

  it("accepts a cursor created from an ISO timestamp and UUID", async () => {
    const list = vi.fn(async () => ({ items: [], nextCursor: null }));
    const controller = userNotificationController({ list } as never);
    const cursor = Buffer.from("2026-10-13T10:00:00.000Z|123e4567-e89b-42d3-a456-426614174000").toString("base64url");
    const response = await controller.list({ actorId: 1, params: {}, query: { cursor } });
    expect(response.status).toBe(200);
    expect(list).toHaveBeenCalledWith(1, cursor, 20);
  });
});
