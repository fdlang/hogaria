/**
 * React binding for the application authentication store.
 */

import { createContext, useCallback, useContext, useSyncExternalStore } from "react";
import { AuthStore, AuthState } from "../auth.store";

const AuthStoreContext = createContext<AuthStore | null>(null);

export const AuthStoreProvider = AuthStoreContext.Provider;

export function useAuth() {
  const store = useContext(AuthStoreContext);
  if (!store) throw new Error("useAuth must be used within <AuthStoreProvider>");

  const state = useSyncExternalStore<AuthState>(
    callback => store.subscribe(callback),
    () => store.getState(),
    () => store.getState(),
  );

  const signIn = useCallback((email: string, password: string) => store.signIn(email, password), [store]);
  const signOut = useCallback(() => store.signOut(), [store]);
  const restore = useCallback(() => store.restore(), [store]);

  return { ...state, signIn, signOut, restore };
}
