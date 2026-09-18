import { describe, expect, it } from "vitest";
import { Email } from "@reformapro/domain/value-objects";
import { authController } from "./authController.js";

const user = { id: 7, email: Email.of("cliente@hogaria.test"), nombre: "Cliente", rol: "cliente" as const, activo: true, createdAt: new Date("2026-01-01T00:00:00.000Z") };

describe("authController", () => {
  it("returns the stable user DTO for login and session restoration", async () => {
    const controller = authController({
      loginUseCase: { execute: async () => ({ user, token: "token", expiresAt: 1 }) } as never,
      users: { findById: async () => user } as never,
      tokens: { verify: async () => ({ userId: user.id }) } as never,
    });
    const request = { body: { email: user.email.value, password: "secret" }, headers: {}, ip: "127.0.0.1" };
    const login = await controller.login(request);
    const session = await controller.me({ ...request, headers: { authorization: "Bearer token" } });
    expect((login.body as { user: { email: string } }).user.email).toBe(user.email.value);
    expect((session.body as { email: string }).email).toBe(user.email.value);
  });
});
