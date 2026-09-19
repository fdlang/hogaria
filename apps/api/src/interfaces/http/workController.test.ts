import { describe, it, expect, vi } from "vitest";
import { workController } from "./workController.js";
import type { WorkTrackingUseCases } from "../../application/use-cases/work-tracking.use-cases.js";
describe("work HTTP boundary", () => {
  it("passes the authenticated actor, not a body-supplied identity", async () => {
    const start = vi.fn().mockResolvedValue({ id: "entry" });
    const c = workController({ start } as unknown as WorkTrackingUseCases);
    const response = await c.start({
      actorId: 2,
      body: { actorId: 99 },
      params: {},
      query: {},
      headers: {},
    });
    expect(start).toHaveBeenCalledWith(2, { actorId: 99 });
    expect(response.headers?.["Cache-Control"]).toBe("no-store");
  });
  it("rejects malformed JSON bodies and converts query numbers", async () => {
    const start = vi.fn(),
      list = vi.fn().mockResolvedValue({ items: [] });
    const c = workController({
      start,
      list,
    } as unknown as WorkTrackingUseCases);
    for (const body of [null, [], "x"])
      await expect(
        c.start({ actorId: 2, body, params: {}, query: {}, headers: {} }),
      ).rejects.toThrow();
    expect(start).not.toHaveBeenCalled();
    await c.list({
      actorId: 2,
      body: {},
      params: {},
      query: { page: "1", projectId: "2" },
      headers: {},
    });
    expect(list).toHaveBeenCalledWith(2, { page: 1, projectId: 2 });
  });
});
