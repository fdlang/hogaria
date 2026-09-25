/**
 * Users feature — API class only.
 * Hooks live in ./hooks/useUsers.ts.
 */

import { ApiClient } from "@/shared/lib/api-client";

export interface UserDTO {
  id: number; email: string; nombre: string;
  rol: "admin" | "cliente" | "profesional";
  profesion?: string; telefono?: string;
  activo: boolean; accountStatus?: "pending_activation" | "active" | "archived"; createdAt: string;
}

export interface CreateUserPayload {
  email: string; nombre: string;
  rol: "admin" | "cliente" | "profesional";
  profesion?: string; telefono?: string;
}

export interface ProfessionalDocumentDTO {
  id: number; professionalId: number; uploadedBy: number;
  nombre: string; tipo: string; tamano: number; uploadedAt: string;
}
export interface UserPage { items: UserDTO[]; total: number; page: number; limit: number; pages: number }

export class UsersApi {
  constructor(private readonly http: ApiClient) {}
  list(role?: UserDTO["rol"]): Promise<UserDTO[]> { return this.http.get(role ? `/users?role=${role}` : "/users"); }
  page(query: { page: number; limit?: number; search?: string; role?: UserDTO["rol"] | "all"; status?: string }): Promise<UserPage> {
    const params = new URLSearchParams({ page: String(query.page), limit: String(query.limit ?? 20) });
    if (query.search) params.set("search", query.search);
    if (query.role && query.role !== "all") params.set("role", query.role);
    if (query.status) params.set("status", query.status);
    return this.http.get(`/users?${params}`);
  }
  create(payload: CreateUserPayload): Promise<{ user: UserDTO; invitationSent: boolean }> { return this.http.post("/users", payload); }
  update(id: number, changes: Partial<UserDTO>): Promise<UserDTO> { return this.http.patch(`/users/${id}`, changes); }
  delete(id: number): Promise<void> { return this.http.delete(`/users/${id}`); }
  reactivate(id: number): Promise<{ sent: boolean; status: "sent" | "existing_or_in_progress"; expiresAt?: string; email: string }> { return this.http.post(`/users/${id}/reactivate`, {}); }
  activateAccount(token: string, password: string): Promise<void> { return this.http.post("/auth/activate", { token, password }); }
  listProfessionalDocuments(id: number): Promise<ProfessionalDocumentDTO[]> { return this.http.get(`/professionals/${id}/documents`); }
  async uploadProfessionalDocument(id: number, file: File): Promise<ProfessionalDocumentDTO> {
    if (file.size > 3 * 1024 * 1024) throw new Error("El archivo supera el límite de 3 MB");
    if (!["image/jpeg", "image/png", "image/webp", "image/gif", "application/pdf"].includes(file.type)) throw new Error("Solo se admiten PDF e imágenes");
    return this.http.post(`/professionals/${id}/documents`, { nombre: file.name, tipo: file.type, tamano: file.size, contenidoBase64: await toBase64(file) });
  }
  downloadProfessionalDocument(id: number): Promise<Blob> { return this.http.download(`/professional-documents/${id}/download`); }
  deleteProfessionalDocument(id: number): Promise<void> { return this.http.delete(`/professional-documents/${id}`); }
}

function toBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("No se pudo leer el archivo"));
    reader.onload = () => typeof reader.result === "string" ? resolve(reader.result.split(",", 2)[1] ?? "") : reject(new Error("No se pudo leer el archivo"));
    reader.readAsDataURL(file);
  });
}
