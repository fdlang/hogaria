import { describe, expect, it, vi } from "vitest";
import { authenticateBeforeBody } from "./requestPipeline.js";

describe("authenticateBeforeBody", () => {
  it("rejects a protected request before reading its untrusted body", async () => {
    const request = { body: {}, headers: {}, ip: "test" };
    const readBody = vi.fn(async () => { throw new Error("must not parse"); });
    const response = await authenticateBeforeBody(
      request,
      true,
      async () => ({ status: 401, body: { code: "UNAUTHORIZED" } }),
      readBody,
    );
    expect(response?.status).toBe(401);
    expect(readBody).not.toHaveBeenCalled();
  });

  it("parses the body after successful authentication and records the actor", async () => {
    const request = { body: {}, headers: {}, ip: "test", actorId: undefined as number | undefined };
    const response = await authenticateBeforeBody(request, true, async () => ({ actorId: 7 }), async () => ({ value: 1 }));
    expect(response).toBeNull();
    expect(request).toMatchObject({ actorId: 7, body: { value: 1 } });
  });
});
