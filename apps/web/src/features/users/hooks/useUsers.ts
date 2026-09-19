/**
 * Users hooks — list + mutations.
 * Kept on the generic primitives so the pattern stays uniform.
 */

import { UsersApi, UserDTO, CreateUserPayload } from "../api/users.api";
import { useResource, useMutation } from "@/shared/hooks/useResource";

export function useUsers(api: UsersApi, role?: UserDTO["rol"], enabled = true) {
  return useResource<UserDTO[]>(() => enabled ? api.list(role) : Promise.resolve([]), [api, role, enabled]);
}

export function useUserMutations(api: UsersApi) {
  const create = useMutation((payload: CreateUserPayload) => api.create(payload));
  const update = useMutation((id: number, changes: Partial<UserDTO> & { newPassword?: string }) => api.update(id, changes));
  const remove = useMutation((id: number) => api.delete(id));
  return { create, update, remove };
}
