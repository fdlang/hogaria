import { describe, expect, it, vi } from "vitest";
import type { IUserRepository } from "@reformapro/domain/repositories";
import { LoginUseCase } from "./auth.use-cases.js";

describe("LoginUseCase abuse controls", () => {
  it("limits both the source IP and the normalized account", async () => {
    const keys: string[] = [];
    const gate = {
      check: vi.fn(async (key: string) => {
        keys.push(key);
        return !key.startsWith("login:ip:");
      }),
    };
    const users = { verifyPassword: vi.fn() } as unknown as IUserRepository;
    const login = new LoginUseCase(
      users,
      { sign: vi.fn(), verify: vi.fn() },
      { emit: vi.fn() },
      gate,
    );

    await expect(login.execute(" USER@Example.COM ", "password", { ip: "203.0.113.7", userAgent: "vitest" }))
      .rejects.toThrow("Demasiados intentos");
    expect(keys).toEqual([
      "login:ip:203.0.113.7",
      "login:account:user@example.com",
    ]);
    expect(users.verifyPassword).not.toHaveBeenCalled();
  });

  it("rejects passwords above bcrypt's byte limit before hashing", async () => {
    const users = { verifyPassword: vi.fn() } as unknown as IUserRepository;
    const login = new LoginUseCase(users, { sign: vi.fn(), verify: vi.fn() }, { emit: vi.fn() }, { check: vi.fn(async () => true) });
    await expect(login.execute("user@example.com", "ñ".repeat(37), { ip: "203.0.113.7", userAgent: "vitest" }))
      .rejects.toThrow("72 bytes");
    expect(users.verifyPassword).not.toHaveBeenCalled();
  });
});
