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

export function matchRoute(routes: Route[], currentPath: string): Route | null {
  const rawPath = currentPath.split(/[?#]/)[0] || "/";
  const path = rawPath.length > 1 ? rawPath.replace(/\/+$/, "") : rawPath;
  const exact = routes.find(route => {
    const candidate = route.path.replace(/^#/, "");
    return !candidate.endsWith("/") && candidate === path;
  });
  if (exact) return exact;
  const candidates = routes
    .filter(route => {
      const candidate = route.path.replace(/^#/, "");
      if (candidate === "/" || !candidate.endsWith("/") || !path.startsWith(candidate)) return false;
      return /^\d+$/.test(path.slice(candidate.length));
    })
    .sort((left, right) => right.path.length - left.path.length);
  return candidates[0] ?? null;
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

export function Router({ routes, fallback, layout = (content) => content }: { routes: Route[]; fallback: ReactNode; layout?: (content: ReactNode) => ReactNode }) {
  const readPath = () => {
    if (window.location.hash.startsWith("#/")) {
      const legacyPath = window.location.hash.slice(1);
      if (!legacyPath.startsWith("/activar-cuenta?")) window.history.replaceState(null, "", legacyPath);
      return legacyPath;
    }
    return window.location.pathname || "/";
  };
  const [path, setPath] = useState<string>(readPath);
  const { user, status } = useAuth();

  useEffect(() => {
    const handle = () => setPath(readPath());
    window.addEventListener("popstate", handle);
    window.addEventListener("hashchange", handle);
    return () => {
      window.removeEventListener("popstate", handle);
      window.removeEventListener("hashchange", handle);
    };
  }, []);

  const navigate = useMemo(() => (newPath: string) => {
    const nextPath = newPath.replace(/^#/, "");
    window.history.pushState(null, "", nextPath);
    setPath(nextPath);
  }, []);

  const match = useMemo(() => matchRoute(routes, path), [routes, path]);

  // Still authenticating? Show nothing (prevents flashing the fallback)
  if (status === "authenticating" || status === "restoring") return null;

  // Route requires a role the user doesn't have
  const allowed = !match?.roles || (user && match.roles.includes(user.rol));

  return (
    <NavigationContext.Provider value={{ currentPath: path, navigate }}>
      {layout(allowed && match ? match.element : fallback)}
    </NavigationContext.Provider>
  );
}
