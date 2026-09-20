/**
 * Users hooks — list + mutations.
 * Kept on the generic primitives so the pattern stays uniform.
 */

import { UsersApi, UserDTO } from "../api/users.api";
import { useResource, useMutation } from "@/shared/hooks/useResource";

export function useUsers(api: UsersApi, role?: UserDTO["rol"], enabled = true) {
  return useResource<UserDTO[]>(() => enabled ? api.list(role) : Promise.resolve([]), [api, role, enabled]);
}

export function useUserMutations(api: UsersApi) {
  const remove = useMutation((id: number) => api.delete(id));
  return { remove };
}
