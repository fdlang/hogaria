/**
 * Auth store — single source of truth for session state.
 * Plain pub/sub; swap for Zustand/Redux/Jotai without touching consumers.
 */

import { ApiClient } from "@/shared/lib/api-client";

export interface AuthUser {
  id: number;
  email: string;
  nombre: string;
  rol: "admin" | "cliente" | "profesional";
  profesion?: string;
  activo: boolean;
}

export interface AuthState {
  status: "idle" | "authenticating" | "authenticated" | "unauthenticated" | "restoring";
  user: AuthUser | null;
  token: string | null;
  error: string | null;
}

type Listener = (state: AuthState) => void;

export class AuthStore {
  private state: AuthState = { status: "idle", user: null, token: null, error: null };
  private listeners = new Set<Listener>();

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
      const { user, token } = await this.api.post<{ user: AuthUser; token: string }>("/auth/login", { email, password });
      this.api.setToken(token);
      this.storage.setItem("rp_token", token);
      this.setState({ status: "authenticated", user, token, error: null });
      return user;
    } catch (e) {
      const msg = (e as { message?: string }).message ?? "Error de autenticación";
      this.setState({ status: "unauthenticated", user: null, token: null, error: msg });
      return null;
    }
  }

  async restore(): Promise<void> {
    const token = this.storage.getItem("rp_token");
    if (!token) { this.setState({ status: "unauthenticated" }); return; }
    this.setState({ status: "restoring" });
    this.api.setToken(token);
    try {
      const user = await this.api.get<AuthUser>("/auth/me");
      this.setState({ status: "authenticated", user, token, error: null });
    } catch {
      this.storage.removeItem("rp_token");
      this.api.setToken(null);
      this.setState({ status: "unauthenticated", user: null, token: null });
    }
  }

  signOut(): void {
    this.storage.removeItem("rp_token");
    this.api.setToken(null);
    this.setState({ status: "unauthenticated", user: null, token: null, error: null });
  }
}
