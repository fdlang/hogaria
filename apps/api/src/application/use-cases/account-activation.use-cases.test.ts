import { describe, expect, it } from "vitest";
import { Email } from "@reformapro/domain/value-objects";
import { InMemoryUserRepository } from "../../infrastructure/database/inMemoryRepositories.js";
import { InMemoryActivationTokenRepository } from "../../infrastructure/database/activationTokenRepositories.js";
import { AccountActivationUseCases, configureActivationPasswordHasher } from "./account-activation.use-cases.js";

const hasher = {
  hash: async (value: string) => `hash:${value}`,
  verify: async (value: string, hash: string) => hash === `hash:${value}`,
};

describe("AccountActivationUseCases", () => {
  it("destroys an activation link after successful use", async () => {
    configureActivationPasswordHasher(hasher.hash);
    const users = new InMemoryUserRepository(hasher);
    const admin = await users.save({ id: 0, email: Email.of("admin@hogaria.test"), nombre: "Admin", rol: "admin", activo: true, createdAt: new Date() }, "hash:admin");
    const client = await users.save({ id: 0, email: Email.of("cliente@hogaria.test"), nombre: "Cliente", rol: "cliente", activo: false, createdAt: new Date() }, "");
    let url = "";
    const email = {
      isConfigured: () => true,
      sendActivation: async (input: { activationUrl: string }) => { url = input.activationUrl; },
    };
    const useCases = new AccountActivationUseCases(users, new InMemoryActivationTokenRepository(users), email, "https://hogaria.test");
    await useCases.invite(admin.id, client.id, { ip: "127.0.0.1", userAgent: "vitest" });
    const token = new URLSearchParams(url.split("?")[1]).get("token");
    expect(token).toBeTruthy();

    configureActivationPasswordHasher(async () => { throw new Error("hash unavailable"); });
    await expect(useCases.activate(token!, "ClaveSegura2026")).rejects.toThrow("hash unavailable");
    expect((await users.findById(client.id))?.activo).toBe(false);
    configureActivationPasswordHasher(hasher.hash);
    await useCases.activate(token!, "ClaveSegura2026");
    expect((await users.findById(client.id))?.activo).toBe(true);
    await expect(useCases.activate(token!, "OtraClave2026")).rejects.toThrow("caducado");
  });

  it("invites a professional through the same one-time activation flow", async () => {
    const users = new InMemoryUserRepository(hasher);
    const admin = await users.save({ id: 0, email: Email.of("admin2@hogaria.test"), nombre: "Admin", rol: "admin", activo: true, createdAt: new Date() }, "hash:admin");
    const professional = await users.save({ id: 0, email: Email.of("pro@hogaria.test"), nombre: "Profesional", rol: "profesional", profesion: "electricista", activo: true, createdAt: new Date() }, "");
    configureActivationPasswordHasher(hasher.hash);
    let delivered = false, url = "";
    const email = { isConfigured: () => true, sendActivation: async (input: {activationUrl: string}) => { delivered = true; url=input.activationUrl; } };
    const useCases = new AccountActivationUseCases(users, new InMemoryActivationTokenRepository(users), email, "https://hogaria.test");
    await useCases.invite(admin.id, professional.id, { ip: "127.0.0.1", userAgent: "vitest" });
    expect(delivered).toBe(true);
    const token = new URLSearchParams(url.split("?")[1]).get("token")!;
    await useCases.activate(token, "ClaveSegura2026");
    expect((await users.verifyPassword(professional.email.value,"ClaveSegura2026"))?.id).toBe(professional.id);
    await expect(useCases.activate(token,"OtraClaveSegura2026")).rejects.toThrow();
  });
});
