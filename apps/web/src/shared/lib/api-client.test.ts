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

  it("aborts requests that exceed the configured timeout", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn((_url: string, init?: RequestInit) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
    }));
    vi.stubGlobal("fetch", fetchMock);
    const client = new ApiClient({ baseUrl: "/api", onUnauthorized: vi.fn(), timeoutMs: 100 });

    const request = client.get("/projects");
    const rejection = expect(request).rejects.toMatchObject({
      status: 0,
      code: "TIMEOUT",
    });
    await vi.advanceTimersByTimeAsync(101);
    await rejection;
    vi.useRealTimers();
  });

  it("honours an external abort signal without reporting a timeout", async () => {
    const fetchMock = vi.fn((_url: string, init?: RequestInit) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
    }));
    vi.stubGlobal("fetch", fetchMock);
    const client = new ApiClient({ baseUrl: "/api", onUnauthorized: vi.fn(), timeoutMs: 10_000 });
    const controller = new AbortController();

    const request = client.get("/projects", controller.signal);
    controller.abort();
    await expect(request).rejects.toMatchObject({ code: "ABORTED" });
  });
});
