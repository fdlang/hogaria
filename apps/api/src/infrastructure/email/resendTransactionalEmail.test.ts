import { afterEach, describe, expect, it, vi } from "vitest";
import { ResendTransactionalEmail } from "./resendTransactionalEmail.js";

describe("ResendTransactionalEmail", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("translates provider network failures into an actionable service error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("network unavailable")));
    const email = new ResendTransactionalEmail("test-key", "Hogaria <info@hogaria.test>");

    await expect(email.sendActivation({
      to: "cliente@hogaria.test",
      name: "Cliente",
      activationUrl: "https://hogaria.test/#/activar-cuenta?token=test",
      expiresAt: new Date("2026-09-22T10:00:00Z"),
    })).rejects.toMatchObject({ code: "SERVICE_UNAVAILABLE" });
  });
});
