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
  it("rejects duplicate email identities regardless of letter case", async () => {
    const users = new InMemoryUserRepository(hasher);
    await users.save({ id: 0, email: Email.of("pro@hogaria.test"), nombre: "Uno", rol: "profesional", profesion: "reformista", activo: false, createdAt: new Date() });
    await expect(users.save({ id: 0, email: Email.of("PRO@hogaria.test"), nombre: "Dos", rol: "profesional", profesion: "reformista", activo: false, createdAt: new Date() })).rejects.toThrow("Ya existe");
  });

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
    const professional = await users.save({ id: 0, email: Email.of("pro@hogaria.test"), nombre: "Profesional", rol: "profesional", profesion: "electricista", activo: false, accountStatus: "pending_activation", createdAt: new Date() }, "");
    configureActivationPasswordHasher(hasher.hash);
    let delivered = false, url = "";
    const email = { isConfigured: () => true, sendActivation: async (input: {activationUrl: string}) => { delivered = true; url=input.activationUrl; } };
    const useCases = new AccountActivationUseCases(users, new InMemoryActivationTokenRepository(users), email, "https://hogaria.test");
    await useCases.invite(admin.id, professional.id, { ip: "127.0.0.1", userAgent: "vitest" });
    expect(delivered).toBe(true);
    const token = new URLSearchParams(url.split("?")[1]).get("token")!;
    const previousSessionVersion = (await users.findById(professional.id))?.sessionVersion ?? 0;
    await useCases.activate(token, "ClaveSegura2026");
    expect((await users.verifyPassword(professional.email.value,"ClaveSegura2026"))?.id).toBe(professional.id);
    expect((await users.findById(professional.id))?.sessionVersion).toBe(previousSessionVersion + 1);
    await expect(useCases.activate(token,"OtraClaveSegura2026")).rejects.toThrow();
  });

  it("blocks a second invitation and keeps the original activation link valid", async () => {
    const users = new InMemoryUserRepository(hasher);
    const admin = await users.save({ id: 0, email: Email.of("admin3@hogaria.test"), nombre: "Admin", rol: "admin", activo: true, createdAt: new Date() }, "hash:admin");
    const client = await users.save({ id: 0, email: Email.of("resend@hogaria.test"), nombre: "Cliente", rol: "cliente", activo: false, createdAt: new Date() }, "");
    const tokens = new InMemoryActivationTokenRepository(users);
    let firstUrl = "";
    let attempts = 0;
    const email = {
      isConfigured: () => true,
      sendActivation: async (input: { activationUrl: string }) => {
        attempts += 1;
        if (attempts === 1) firstUrl = input.activationUrl;
        else throw new Error("a second email must never be attempted");
      },
    };
    configureActivationPasswordHasher(hasher.hash);
    const useCases = new AccountActivationUseCases(users, tokens, email, "https://hogaria.test");
    await useCases.invite(admin.id, client.id, { ip: "127.0.0.1", userAgent: "vitest" });
    await expect(useCases.invite(admin.id, client.id, { ip: "127.0.0.1", userAgent: "vitest" })).rejects.toThrow("ya fue enviada");
    expect(attempts).toBe(1);

    const firstToken = new URLSearchParams(firstUrl.split("?")[1]).get("token")!;
    await expect(useCases.activate(firstToken, "ClaveSegura2026")).resolves.toBeUndefined();
  });

  it("keeps a delivered activation link valid when token promotion fails", async () => {
    const users = new InMemoryUserRepository(hasher);
    const admin = await users.save({ id: 0, email: Email.of("admin4@hogaria.test"), nombre: "Admin", rol: "admin", activo: true, createdAt: new Date() }, "hash:admin");
    const client = await users.save({ id: 0, email: Email.of("promotion@hogaria.test"), nombre: "Cliente", rol: "cliente", activo: false, createdAt: new Date() }, "");
    const innerTokens = new InMemoryActivationTokenRepository(users);
    let deliveredUrl = "";
    const tokens = {
      hasIssued: innerTokens.hasIssued.bind(innerTokens),
      stage: innerTokens.stage.bind(innerTokens),
      promote: async () => { throw new Error("promotion unavailable"); },
      discard: innerTokens.discard.bind(innerTokens),
      findValid: innerTokens.findValid.bind(innerTokens),
      complete: innerTokens.complete.bind(innerTokens),
    };
    const email = {
      isConfigured: () => true,
      sendActivation: async (input: { activationUrl: string }) => { deliveredUrl = input.activationUrl; },
    };
    configureActivationPasswordHasher(hasher.hash);
    const useCases = new AccountActivationUseCases(users, tokens, email, "https://hogaria.test");

    await expect(useCases.invite(admin.id, client.id, { ip: "127.0.0.1", userAgent: "vitest" })).resolves.toMatchObject({ email: client.email.value });
    const deliveredToken = new URLSearchParams(deliveredUrl.split("?")[1]).get("token")!;
    await expect(useCases.activate(deliveredToken, "ClaveSegura2026")).resolves.toBeUndefined();
  });

  it("keeps the winner of two interleaved promotions and consumes every sibling link", async () => {
    const users = new InMemoryUserRepository(hasher);
    const client = await users.save({ id: 0, email: Email.of("concurrent@hogaria.test"), nombre: "Cliente", rol: "cliente", activo: false, createdAt: new Date() }, "");
    const tokens = new InMemoryActivationTokenRepository(users);
    await tokens.stage({ userId: client.id, tokenHash: "first", expiresAt: new Date(Date.now() + 60_000), usedAt: null });
    await tokens.stage({ userId: client.id, tokenHash: "second", expiresAt: new Date(Date.now() + 60_000), usedAt: null });

    await tokens.promote(client.id, "second");
    await tokens.promote(client.id, "first");
    expect(await tokens.findValid("first", new Date())).toBeNull();
    expect(await tokens.findValid("second", new Date())).not.toBeNull();

    await tokens.stage({ userId: client.id, tokenHash: "sibling", expiresAt: new Date(Date.now() + 60_000), usedAt: null });
    await tokens.complete("second", "hash:new");
    expect(await tokens.findValid("sibling", new Date())).toBeNull();
  });
});
