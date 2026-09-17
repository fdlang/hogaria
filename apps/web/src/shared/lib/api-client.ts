/**
 * HTTP client — transport-layer concerns (auth header, error mapping, retries).
 * The rest of the app sees typed API surfaces, NEVER raw fetch() calls.
 */

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

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

  constructor(opts: { baseUrl: string; onUnauthorized: () => void }) {
    this.baseUrl = opts.baseUrl;
    this.onUnauthorized = opts.onUnauthorized;
  }

  setToken(token: string | null): void { this.token = token; }
  getToken(): string | null            { return this.token; }

  async request<T>(path: string, opts: { method?: HttpMethod; body?: unknown; signal?: AbortSignal } = {}): Promise<T> {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (this.token) headers.Authorization = `Bearer ${this.token}`;

    const res = await fetch(`${this.baseUrl}${path}`, {
      method: opts.method ?? "GET",
      headers,
      body: opts.body ? JSON.stringify(opts.body) : undefined,
      signal: opts.signal,
    });

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
  put<T>(path: string, body?: unknown, signal?: AbortSignal):    Promise<T> { return this.request<T>(path, { method: "PUT", body, signal }); }
  patch<T>(path: string, body?: unknown, signal?: AbortSignal):  Promise<T> { return this.request<T>(path, { method: "PATCH", body, signal }); }
  delete<T>(path: string, signal?: AbortSignal):                 Promise<T> { return this.request<T>(path, { method: "DELETE", signal }); }

  async download(path: string): Promise<Blob> {
    const headers: Record<string, string> = {};
    if (this.token) headers.Authorization = `Bearer ${this.token}`;
    const res = await fetch(`${this.baseUrl}${path}`, { headers });
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
}
