/**
 * App bootstrap — composition root (Dependency Injection wiring).
 * This is the ONLY place where concrete implementations are instantiated.
 * Every other file receives dependencies via interfaces/props/context.
 */

import "./global.css";
import React from "react";
import ReactDOM from "react-dom/client";
import { ApiClient } from "@/shared/lib/api-client";
import { AuthStore } from "@/features/auth/auth.store";
import { AuthStoreProvider } from "@/features/auth/hooks/useAuth";
import { ProjectsApi }    from "@/features/projects/api/projects.api";
import { UsersApi }       from "@/features/users/api/users.api";
import { FilesApi }       from "@/features/files/api/files.api";
import { AuditApi }       from "@/features/audit/api/audit.api";
import { SolicitudesApi } from "@/features/solicitudes/api/solicitudes.api";
import { AdminSolicitudesApi } from "@/features/solicitudes/api/admin-solicitudes.api";
import { SalesApi } from "@/features/sales/api/sales.api";
import { App } from "./App";
import { WorkApi } from "@/features/work/work.api";
import { NotificationsProvider } from "@/shared/ui/notifications";
import { ConfirmProvider } from "@/shared/ui/confirm";
import { ErrorBoundary } from "@/shared/ui/error-boundary";
import { UserNotificationsApi } from "@/features/notifications/api/notifications.api";

// 1) Transport layer — single instance, shared across features
//    Forward-declare authStore so onUnauthorized can reference it
let authStore: AuthStore;
const api = new ApiClient({
  baseUrl: import.meta.env.VITE_API_URL ?? "/api",
  onUnauthorized: () => {
    authStore?.expireSession();
    window.location.hash = "#/login";
  },
});

// 2) Auth store — owns session state
const salesApi = new SalesApi(api);
authStore = new AuthStore(api);

// 3) Feature APIs — each receives the shared transport
const apis = {
  work:             new WorkApi(api),
  projects:         new ProjectsApi(api),
  users:            new UsersApi(api),
  files:            new FilesApi(api),
  audit:            new AuditApi(api),
  solicitudes:      new SolicitudesApi(api),
  adminSolicitudes: new AdminSolicitudesApi(api),
  sales:            salesApi,
  notifications:    new UserNotificationsApi(api),
};

let cachedUserId: number | null = null;
authStore.subscribe(state => {
  const userId = state.status === "authenticated" ? state.user?.id ?? null : null;
  if (userId !== cachedUserId) {
    salesApi.clearPdfCache();
    cachedUserId = userId;
  }
});

// 4) Restore session on boot (best-effort; failures silently sign out)
authStore.restore().catch(() => { /* logged inside store */ });

// 5) Render React tree
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <AuthStoreProvider value={authStore}>
        <NotificationsProvider>
          <ConfirmProvider>
            <App apis={apis} />
          </ConfirmProvider>
        </NotificationsProvider>
      </AuthStoreProvider>
    </ErrorBoundary>
  </React.StrictMode>
);
