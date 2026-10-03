/**
 * Auth store — single source of truth for session state.
 * Plain pub/sub; swap for Zustand/Redux/Jotai without touching consumers.
 */

import { ApiClient } from "@/shared/lib/api-client";
import { ApiContractError, isRecord } from "@/shared/lib/contracts";

export interface AuthUser {
  id: number;
  email: string;
  nombre: string;
  rol: "admin" | "cliente" | "profesional";
  profesion?: string;
  activo: boolean;
}

const loginResponse = (value: unknown): { user: AuthUser; token: string; expiresAt: number } => {
  if (!isRecord(value) || !isRecord(value.user) ||
      !Number.isSafeInteger(value.user.id) || typeof value.user.email !== "string" ||
      typeof value.user.nombre !== "string" || !["admin", "cliente", "profesional"].includes(String(value.user.rol)) ||
      typeof value.user.activo !== "boolean" || typeof value.token !== "string" ||
      typeof value.expiresAt !== "number" || !Number.isFinite(value.expiresAt))
    throw new ApiContractError("el inicio de sesión");
  return value as unknown as { user: AuthUser; token: string; expiresAt: number };
};

export interface AuthState {
  status: "idle" | "authenticating" | "authenticated" | "unauthenticated" | "restoring";
  user: AuthUser | null;
  error: string | null;
}

type Listener = (state: AuthState) => void;

export class AuthStore {
  private state: AuthState = { status: "idle", user: null, error: null };
  private listeners = new Set<Listener>();
  private expiryTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly api: ApiClient, private readonly storage: Storage = sessionStorage) {
    // Inject ourselves into the client so it can notify us on 401
    // (the constructor option onUnauthorized is wired to AuthStore.signOut from app/bootstrap.ts)
  }

  getState(): AuthState { return this.state; }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private setState(patch: Partial<AuthState>): void {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach(l => l(this.state));
  }

  async signIn(email: string, password: string): Promise<AuthUser | null> {
    this.setState({ status: "authenticating", error: null });
    try {
      const { user, token, expiresAt } = loginResponse(await this.api.post<unknown>("/auth/login", { email, password }));
      this.api.setToken(token);
      this.storage.setItem("rp_token", token);
      this.storage.setItem("rp_expires_at", String(expiresAt));
      this.scheduleExpiry(expiresAt);
      this.setState({ status: "authenticated", user, error: null });
      return user;
    } catch (e) {
      const authError = e as { status?: number; message?: string };
      const msg = authError.status === 401
        ? "El email o la contraseña no son correctos."
        : authError.message ?? "No se ha podido iniciar sesión. Inténtalo de nuevo.";
      this.clearSession();
      this.setState({ status: "unauthenticated", user: null, error: msg });
      return null;
    }
  }

  async restore(): Promise<void> {
    const token = this.storage.getItem("rp_token");
    if (!token) { this.setState({ status: "unauthenticated" }); return; }
    const storedExpiry = Number(this.storage.getItem("rp_expires_at"));
    if (Number.isFinite(storedExpiry) && storedExpiry > 0 && storedExpiry <= Date.now()) {
      this.expireSession();
      return;
    }
    this.setState({ status: "restoring" });
    this.api.setToken(token);
    try {
      const user = await this.api.get<AuthUser>("/auth/me");
      if (Number.isFinite(storedExpiry) && storedExpiry > 0) this.scheduleExpiry(storedExpiry);
      this.setState({ status: "authenticated", user, error: null });
    } catch {
      if (this.state.status === "unauthenticated" && this.state.error) return;
      this.clearSession();
      this.setState({ status: "unauthenticated", user: null });
    }
  }

  async signOut(): Promise<void> {
    try {
      if (this.storage.getItem("rp_token")) await this.api.post("/auth/logout", {});
    } catch {
      // Local cleanup is still required when the network is unavailable.
    }
    this.clearSession();
    this.setState({ status: "unauthenticated", user: null, error: null });
  }

  expireSession(): void {
    this.clearSession();
    this.setState({ status: "unauthenticated", user: null, error: "Tu sesión ha caducado. Inicia sesión de nuevo para continuar." });
  }

  private scheduleExpiry(expiresAt: number): void {
    if (this.expiryTimer) clearTimeout(this.expiryTimer);
    const remaining = expiresAt - Date.now();
    if (remaining <= 0) { this.expireSession(); return; }
    this.expiryTimer = setTimeout(() => this.expireSession(), Math.min(remaining, 2_147_483_647));
  }

  private clearSession(): void {
    if (this.expiryTimer) clearTimeout(this.expiryTimer);
    this.expiryTimer = null;
    this.storage.removeItem("rp_token");
    this.storage.removeItem("rp_expires_at");
    this.api.setToken(null);
  }
}
