/**
 * HTTP client — transport-layer concerns (auth header, error mapping, retries).
 * The rest of the app sees typed API surfaces, NEVER raw fetch() calls.
 */

export type HttpMethod = "GET" | "POST" | "PATCH" | "DELETE";

export interface ApiError {
  status: number;
  code: string;       // matches DomainError.code for typed handling
  message: string;
  field?: string;
}

export class ApiClient {
  private token: string | null = null;
  private readonly baseUrl: string;
  private readonly onUnauthorized: () => void;
  private readonly timeoutMs: number;

  constructor(opts: { baseUrl: string; onUnauthorized: () => void; timeoutMs?: number }) {
    this.baseUrl = opts.baseUrl;
    this.onUnauthorized = opts.onUnauthorized;
    this.timeoutMs = opts.timeoutMs ?? 15_000;
  }

  setToken(token: string | null): void { this.token = token; }

  async request<T>(path: string, opts: { method?: HttpMethod; body?: unknown; signal?: AbortSignal } = {}): Promise<T> {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (this.token) headers.Authorization = `Bearer ${this.token}`;

    const request = this.requestSignal(opts.signal, this.timeoutMs);
    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}${path}`, {
        method: opts.method ?? "GET",
        headers,
        body: opts.body ? JSON.stringify(opts.body) : undefined,
        signal: request.signal,
      });
    } catch (cause) {
      throw this.transportError(cause, request.timedOut());
    } finally {
      request.cleanup();
    }

    if (res.status === 401) {
      // A failed login is expected form validation, not an expired session.
      if (this.token && path !== "/auth/login") this.onUnauthorized();
      throw this.mapError(res, await res.json().catch(() => ({})));
    }
    if (!res.ok) throw this.mapError(res, await res.json().catch(() => ({})));

    // 204 No Content
    if (res.status === 204) return undefined as T;
    return res.json() as Promise<T>;
  }

  get<T>(path: string, signal?: AbortSignal):                    Promise<T> { return this.request<T>(path, { method: "GET", signal }); }
  post<T>(path: string, body?: unknown, signal?: AbortSignal):   Promise<T> { return this.request<T>(path, { method: "POST", body, signal }); }
  patch<T>(path: string, body?: unknown, signal?: AbortSignal):  Promise<T> { return this.request<T>(path, { method: "PATCH", body, signal }); }
  delete<T>(path: string, signal?: AbortSignal):                 Promise<T> { return this.request<T>(path, { method: "DELETE", signal }); }

  async download(path: string): Promise<Blob> {
    const headers: Record<string, string> = {};
    if (this.token) headers.Authorization = `Bearer ${this.token}`;
    const request = this.requestSignal(undefined, 45_000);
    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}${path}`, { headers, signal: request.signal });
    } catch (cause) {
      throw this.transportError(cause, request.timedOut());
    } finally {
      request.cleanup();
    }
    if (res.status === 401 && this.token) this.onUnauthorized();
    if (!res.ok) throw this.mapError(res, await res.json().catch(() => ({})));
    return res.blob();
  }

  private mapError(res: Response, body: { code?: string; message?: string; field?: string }): ApiError {
    return {
      status: res.status,
      code: body.code ?? "UNKNOWN",
      message: body.message ?? res.statusText,
      field: body.field,
    };
  }

  private requestSignal(external: AbortSignal | undefined, timeoutMs: number) {
    const controller = new AbortController();
    let timedOut = false;
    const abortFromCaller = () => controller.abort(external?.reason);
    if (external?.aborted) abortFromCaller();
    else external?.addEventListener("abort", abortFromCaller, { once: true });
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);
    return {
      signal: controller.signal,
      timedOut: () => timedOut,
      cleanup: () => {
        clearTimeout(timer);
        external?.removeEventListener("abort", abortFromCaller);
      },
    };
  }

  private transportError(cause: unknown, timedOut: boolean): ApiError {
    if (timedOut) return { status: 0, code: "TIMEOUT", message: "La solicitud ha tardado demasiado. Inténtalo de nuevo." };
    if ((cause as { name?: string } | null)?.name === "AbortError")
      return { status: 0, code: "ABORTED", message: "La solicitud se ha cancelado." };
    return { status: 0, code: "NETWORK_ERROR", message: "No se ha podido conectar con el servidor." };
  }
}
