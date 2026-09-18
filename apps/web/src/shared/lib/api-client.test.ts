import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiClient } from "./api-client";

const jsonResponse = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { "Content-Type": "application/json" },
});

describe("ApiClient", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("serializes requests and includes the session token", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ id: 7 }));
    vi.stubGlobal("fetch", fetchMock);
    const client = new ApiClient({ baseUrl: "/api", onUnauthorized: vi.fn() });
    client.setToken("session-token");

    await expect(client.post<{ id: number }>("/projects", { nombre: "Pinto" })).resolves.toEqual({ id: 7 });
    expect(fetchMock).toHaveBeenCalledWith("/api/projects", expect.objectContaining({
      method: "POST",
      body: JSON.stringify({ nombre: "Pinto" }),
      headers: expect.objectContaining({
        "Content-Type": "application/json",
        Authorization: "Bearer session-token",
      }),
    }));
  });

  it("maps API errors and closes an expired authenticated session", async () => {
    const onUnauthorized = vi.fn();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ code: "UNAUTHORIZED", message: "Sesión caducada" }, 401)));
    const client = new ApiClient({ baseUrl: "/api", onUnauthorized });
    client.setToken("session-token");

    await expect(client.get("/projects")).rejects.toMatchObject({
      status: 401,
      code: "UNAUTHORIZED",
      message: "Sesión caducada",
    });
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
  });

  it("does not sign out after an expected failed login", async () => {
    const onUnauthorized = vi.fn();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ message: "Credenciales inválidas" }, 401)));
    const client = new ApiClient({ baseUrl: "/api", onUnauthorized });
    client.setToken("session-token");

    await expect(client.post("/auth/login", { email: "cliente@hogaria.design" })).rejects.toMatchObject({ status: 401 });
    expect(onUnauthorized).not.toHaveBeenCalled();
  });
});
