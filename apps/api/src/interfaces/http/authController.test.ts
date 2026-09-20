import { describe, expect, it } from "vitest";
import { Email } from "@reformapro/domain/value-objects";
import { authController, requireAuth } from "./authController.js";

const user = { id: 7, email: Email.of("cliente@hogaria.test"), nombre: "Cliente", rol: "cliente" as const, activo: true, createdAt: new Date("2026-01-01T00:00:00.000Z") };

describe("authController", () => {
  it("returns the stable user DTO for login and session restoration", async () => {
    const controller = authController({
      loginUseCase: { execute: async () => ({ user, token: "token", expiresAt: 1 }) } as never,
      users: { findById: async () => user } as never,
      tokens: { verify: async () => ({ userId: user.id, sessionVersion: 0 }) } as never,
    });
    const request = { body: { email: user.email.value, password: "secret" }, headers: {}, ip: "127.0.0.1" };
    const login = await controller.login(request);
    const session = await controller.me({ ...request, headers: { authorization: "Bearer token" } });
    expect((login.body as { user: { email: string } }).user.email).toBe(user.email.value);
    expect((session.body as { email: string }).email).toBe(user.email.value);
  });
});

describe("requireAuth", () => {
  it("revokes an existing token when the account session version changes", async () => {
    const authenticate = requireAuth(
      { verify: async () => ({ userId: user.id, email: user.email.value, rol: user.rol, exp: Date.now() + 1000, sessionVersion: 1 }) } as never,
      { findById: async () => ({ ...user, sessionVersion: 2 }) } as never,
    );

    await expect(authenticate({ body: null, headers: { authorization: "Bearer old" }, ip: "test" })).resolves.toMatchObject({ status: 401 });
  });
});
