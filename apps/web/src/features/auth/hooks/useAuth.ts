/**
 * useAuth — thin React binding over the AuthStore.
 * Component trees ONLY talk to this hook; they never touch the store directly.
 */

import { useSyncExternalStore, useCallback, useContext, createContext } from "react";
import { AuthStore, AuthState } from "../auth.store";

const AuthStoreContext = createContext<AuthStore | null>(null);
export const AuthStoreProvider = AuthStoreContext.Provider;

export function useAuth() {
  const store = useContext(AuthStoreContext);
  if (!store) throw new Error("useAuth must be used within <AuthStoreProvider>");

  const state = useSyncExternalStore<AuthState>(
    cb => store.subscribe(cb),
    () => store.getState(),
    () => store.getState(),
  );

  const signIn  = useCallback((email: string, password: string) => store.signIn(email, password), [store]);
  const signOut = useCallback(() => store.signOut(), [store]);
  const restore = useCallback(() => store.restore(), [store]);

  return { ...state, signIn, signOut, restore };
}

// Role-based guards — keep permission checks declarative at the UI boundary.
export function useIsAdmin(): boolean {
  const { user } = useAuth();
  return user?.rol === "admin";
}

export function useRequireRole(role: "admin" | "cliente" | "profesional" | Array<"admin"|"cliente"|"profesional">): boolean {
  const { user } = useAuth();
  if (!user) return false;
  return Array.isArray(role) ? role.includes(user.rol) : user.rol === role;
}
