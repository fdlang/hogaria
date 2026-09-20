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

function createStorage(initialToken: string | null = null) {
  let token = initialToken;
  return {
    getItem: vi.fn(() => token),
    setItem: vi.fn((_key: string, value: string) => { token = value; }),
    removeItem: vi.fn(() => { token = null; }),
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
    vi.mocked(api.post).mockResolvedValue({ user, token: "signed-token" });
    const store = new AuthStore(api, storage);

    await expect(store.signIn(user.email, "contraseña-segura")).resolves.toEqual(user);
    expect(api.setToken).toHaveBeenCalledWith("signed-token");
    expect(storage.setItem).toHaveBeenCalledWith("rp_token", "signed-token");
    expect(store.getState()).toMatchObject({ status: "authenticated", user, token: "signed-token", error: null });
  });

  it("does not persist a failed login and returns a safe error message", async () => {
    const api = createApi();
    const storage = createStorage();
    vi.mocked(api.post).mockRejectedValue({ status: 401, message: "No revelar detalles" });
    const store = new AuthStore(api, storage);

    await expect(store.signIn(user.email, "incorrecta")).resolves.toBeNull();
    expect(storage.setItem).not.toHaveBeenCalled();
    expect(store.getState()).toMatchObject({ status: "unauthenticated", user: null, token: null });
    expect(store.getState().error).toBe("El email o la contraseña no son correctos.");
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
    expect(store.getState()).toMatchObject({ status: "unauthenticated", user: null, token: null });
  });

  it("removes an expired persisted session during restore", async () => {
    const api = createApi();
    const storage = createStorage("expired-token");
    vi.mocked(api.get).mockRejectedValue(new Error("expired"));
    const store = new AuthStore(api, storage);

    await store.restore();
    expect(api.setToken).toHaveBeenNthCalledWith(1, "expired-token");
    expect(api.setToken).toHaveBeenLastCalledWith(null);
    expect(storage.removeItem).toHaveBeenCalledWith("rp_token");
    expect(store.getState()).toMatchObject({ status: "unauthenticated", user: null, token: null });
  });

  it("clears the token and persisted data on sign out", () => {
    const api = createApi();
    const storage = createStorage("token");
    const store = new AuthStore(api, storage);

    store.signOut();
    expect(api.setToken).toHaveBeenCalledWith(null);
    expect(storage.removeItem).toHaveBeenCalledWith("rp_token");
    expect(store.getState()).toMatchObject({ status: "unauthenticated", user: null, token: null });
  });
});
