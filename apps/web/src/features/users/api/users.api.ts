/**
 * Users feature — API class only.
 * Hooks live in ./hooks/useUsers.ts.
 */

import { ApiClient } from "@/shared/lib/api-client";

export interface UserDTO {
  id: number; email: string; nombre: string;
  rol: "admin" | "cliente" | "profesional";
  profesion?: string; telefono?: string;
  activo: boolean; createdAt: string;
}

export interface CreateUserPayload {
  email: string; nombre: string;
  rol: "admin" | "cliente" | "profesional";
  profesion?: string; telefono?: string;
}

export class UsersApi {
  constructor(private readonly http: ApiClient) {}
  list(role?: UserDTO["rol"]): Promise<UserDTO[]> { return this.http.get(role ? `/users?role=${role}` : "/users"); }
  create(payload: CreateUserPayload): Promise<{ user: UserDTO; invitationSent: boolean }> { return this.http.post("/users", payload); }
  update(id: number, changes: Partial<UserDTO> & { newPassword?: string }): Promise<UserDTO> { return this.http.patch(`/users/${id}`, changes); }
  delete(id: number): Promise<void> { return this.http.delete(`/users/${id}`); }
  resendInvitation(id: number): Promise<{ email: string; expiresAt: string }> { return this.http.post(`/users/${id}/invitation`); }
  activateAccount(token: string, password: string): Promise<void> { return this.http.post("/auth/activate", { token, password }); }
}
