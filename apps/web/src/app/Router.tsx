/**
 * Router — minimal hash-based routing with role guards.
 *
 * Replace with react-router-dom in production. Kept minimal here to avoid
 * locking consumers into a specific router. The `Route` shape is stable.
 */

import { useEffect, useState, useMemo, ReactNode, createContext, useContext } from "react";
import { useAuth } from "@/features/auth/hooks/useAuth";

export interface Route {
  path: string;                      // matches window.location.hash (e.g. "#/admin/projects")
  element: ReactNode;
  roles?: Array<"admin" | "cliente" | "profesional">;  // undefined = public
}

interface NavCtx {
  currentPath: string;
  navigate: (path: string) => void;
}

const NavigationContext = createContext<NavCtx | null>(null);

export function useNavigation() {
  const ctx = useContext(NavigationContext);
  if (!ctx) throw new Error("useNavigation must be used within <Router>");
  return ctx;
}

export function Router({ routes, fallback }: { routes: Route[]; fallback: ReactNode }) {
  const [path, setPath] = useState<string>(() => window.location.hash || "#/");
  const { user, status } = useAuth();

  useEffect(() => {
    const handle = () => setPath(window.location.hash || "#/");
    window.addEventListener("hashchange", handle);
    return () => window.removeEventListener("hashchange", handle);
  }, []);

  const navigate = useMemo(() => (newPath: string) => { window.location.hash = newPath; }, []);

  const match = useMemo(() => {
    // Exact match first
    const exact = routes.find(r => r.path === path);
    if (exact) return exact;
    // Otherwise, match longest prefix — ensures "#/admin/projects/" beats "#/admin/projects"
    // when the URL is "#/admin/projects/123"
    const candidates = routes
      .filter(r => path.startsWith(r.path))
      .sort((a, b) => b.path.length - a.path.length);
    return candidates[0] ?? null;
  }, [routes, path]);

  // Still authenticating? Show nothing (prevents flashing the fallback)
  if (status === "authenticating" || status === "restoring") return null;

  // Route requires a role the user doesn't have
  if (match?.roles && (!user || !match.roles.includes(user.rol))) {
    return <>{fallback}</>;
  }

  return (
    <NavigationContext.Provider value={{ currentPath: path, navigate }}>
      {match ? match.element : fallback}
    </NavigationContext.Provider>
  );
}
