/**
 * usePermissions — declarative, centralised auth decisions in the UI.
 *
 * NEVER inline role checks like `user.rol === "admin"` in components.
 * Keep the policy in one place so it can be tested and audited.
 */

import { useMemo } from "react";
import { useAuth } from "@/features/auth/hooks/useAuth";
import { PermissionPolicy, Action } from "@reformapro/domain/services";

export function usePermissions() {
  const { user } = useAuth();

  return useMemo(() => ({
    can: (action: Action, context: { project?: unknown } = {}) => {
      if (!user) return false;
      return PermissionPolicy.can(user as never, action, context as never);
    },

    isAdmin:        user?.rol === "admin",
    isCliente:      user?.rol === "cliente",
    isProfesional:  user?.rol === "profesional",
  }), [user]);
}
