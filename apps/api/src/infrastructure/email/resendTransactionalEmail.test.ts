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

  it("uses a bounded idempotent request and includes the privacy notice", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const email = new ResendTransactionalEmail("test-key", "Hogaria <info@hogaria.test>");
    await email.sendActivation({
      to: "cliente@hogaria.test", name: "Cliente",
      activationUrl: "https://hogaria.test/#/activar-cuenta?token=test",
      expiresAt: new Date("2026-09-22T10:00:00Z"),
    });
    const request = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const headers = request.headers as Record<string, string>;
    expect(headers["Idempotency-Key"]).toMatch(/^account-access\/[a-f0-9]{64}$/);
    expect(request.signal).toBeInstanceOf(AbortSignal);
    expect(String(request.body)).toContain("#/privacidad");
  });
});
