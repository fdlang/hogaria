import { describe, expect, it, vi } from "vitest";
import { AuthStore, type AuthUser } from "./auth.store";
import type { ApiClient } from "@/shared/lib/api-client";

const user: AuthUser = {
  id: 12,
  email: "cliente@hogaria.design",
  nombre: "Cliente Hogaria",
  rol: "cliente",
  activo: true,
};

function createStorage(initialToken: string | null = null, initialExpiry: number | null = null) {
  const values = new Map<string, string>();
  if (initialToken) values.set("rp_token", initialToken);
  if (initialExpiry !== null) values.set("rp_expires_at", String(initialExpiry));
  return {
    getItem: vi.fn((key: string) => values.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => { values.set(key, value); }),
    removeItem: vi.fn((key: string) => { values.delete(key); }),
  } as unknown as Storage;
}

function createApi() {
  return {
    post: vi.fn(),
    get: vi.fn(),
    setToken: vi.fn(),
  } as unknown as ApiClient;
}

describe("AuthStore", () => {
  it("stores a successful session and exposes the authenticated user", async () => {
    const api = createApi();
    const storage = createStorage();
    vi.mocked(api.post).mockResolvedValue({ user, token: "signed-token", expiresAt: Date.now() + 60_000 });
    const store = new AuthStore(api, storage);

    await expect(store.signIn(user.email, "contraseña-segura")).resolves.toEqual(user);
    expect(api.setToken).toHaveBeenCalledWith("signed-token");
    expect(storage.setItem).toHaveBeenCalledWith("rp_token", "signed-token");
    expect(storage.setItem).toHaveBeenCalledWith("rp_expires_at", expect.any(String));
    expect(store.getState()).toMatchObject({ status: "authenticated", user, error: null });
    expect(store.getState()).not.toHaveProperty("token");
  });

  it("does not persist a failed login and returns a safe error message", async () => {
    const api = createApi();
    const storage = createStorage();
    vi.mocked(api.post).mockRejectedValue({ status: 401, message: "No revelar detalles" });
    const store = new AuthStore(api, storage);

    await expect(store.signIn(user.email, "incorrecta")).resolves.toBeNull();
    expect(storage.setItem).not.toHaveBeenCalled();
    expect(store.getState()).toMatchObject({ status: "unauthenticated", user: null });
    expect(store.getState().error).toBe("El email o la contraseña no son correctos.");
  });

  it("rejects a malformed login response without persisting it", async () => {
    const api = createApi();
    const storage = createStorage();
    vi.mocked(api.post).mockResolvedValue({ user, token: "signed-token" });
    const store = new AuthStore(api, storage);

    await expect(store.signIn(user.email, "contraseña-segura")).resolves.toBeNull();
    expect(storage.setItem).not.toHaveBeenCalled();
    expect(store.getState()).toMatchObject({ status: "unauthenticated", user: null });
  });

  it("fully clears a previous session when a new login attempt fails", async () => {
    const api = createApi();
    const storage = createStorage("previous-token");
    vi.mocked(api.get).mockResolvedValue(user);
    const store = new AuthStore(api, storage);
    await store.restore();
    vi.mocked(api.post).mockRejectedValue({ status: 401 });

    await store.signIn("other@hogaria.design", "incorrecta");

    expect(api.setToken).toHaveBeenLastCalledWith(null);
    expect(storage.removeItem).toHaveBeenCalledWith("rp_token");
    expect(store.getState()).toMatchObject({ status: "unauthenticated", user: null });
  });

  it("removes an expired persisted session during restore", async () => {
    const api = createApi();
    const storage = createStorage("expired-token", Date.now() - 1);
    const store = new AuthStore(api, storage);

    await store.restore();
    expect(api.get).not.toHaveBeenCalled();
    expect(api.setToken).toHaveBeenLastCalledWith(null);
    expect(storage.removeItem).toHaveBeenCalledWith("rp_token");
    expect(store.getState()).toMatchObject({ status: "unauthenticated", user: null });
  });

  it("revokes the server session and clears persisted data on sign out", async () => {
    const api = createApi();
    const storage = createStorage("token");
    const store = new AuthStore(api, storage);

    vi.mocked(api.get).mockResolvedValue(user);
    await store.restore();
    vi.mocked(api.post).mockResolvedValue(undefined);
    await store.signOut();
    expect(api.post).toHaveBeenCalledWith("/auth/logout", {});
    expect(api.setToken).toHaveBeenCalledWith(null);
    expect(storage.removeItem).toHaveBeenCalledWith("rp_token");
    expect(store.getState()).toMatchObject({ status: "unauthenticated", user: null });
  });

  it("explains an expired session instead of failing silently", () => {
    const api = createApi();
    const storage = createStorage("expired");
    const store = new AuthStore(api, storage);
    store.expireSession();
    expect(store.getState()).toMatchObject({ status: "unauthenticated", user: null, error: expect.stringContaining("caducado") });
  });

  it("expires the local session at the server-provided deadline", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-03T10:00:00Z"));
    const api = createApi();
    const storage = createStorage();
    vi.mocked(api.post).mockResolvedValue({ user, token: "signed-token", expiresAt: Date.now() + 1_000 });
    const store = new AuthStore(api, storage);

    await store.signIn(user.email, "contraseña-segura");
    await vi.advanceTimersByTimeAsync(1_001);

    expect(store.getState()).toMatchObject({ status: "unauthenticated", user: null, error: expect.stringContaining("caducado") });
    expect(api.setToken).toHaveBeenLastCalledWith(null);
    vi.useRealTimers();
  });
});
