/**
 * Projects feature — API class only.
 * Hooks live in ./hooks/useProjects.ts.
 */

import { ApiClient } from "@/shared/lib/api-client";

export interface ProjectDTO {
  revision?: number;
  id: number; nombre: string; descripcion: string; clienteId: number;
  direccion: string; tipo: string;
  estado: "planificacion" | "en_curso" | "pausado" | "finalizado";
  progreso: number; presupuesto: number;
  fechaInicio: string; fechaFinPrevista: string;
  profesionalesAsignados: Array<{ userId: number; profesion: string }>;
  hitos: Array<{ id: string | number; nombre: string; completado: boolean; fecha: string }>;
}

export class ProjectsApi {
  constructor(private readonly http: ApiClient) {}
  list():                              Promise<ProjectDTO[]>   { return this.http.get("/projects"); }
  get(id: number):                     Promise<ProjectDTO>     { return this.http.get(`/projects/${id}`); }
  update(id: number, changes: Partial<ProjectDTO>): Promise<ProjectDTO> { return this.http.patch(`/projects/${id}`, changes); }
  delete(id: number):                  Promise<void>           { return this.http.delete(`/projects/${id}`); }
  changes(id: number) { return this.http.get<import("@/features/sales/api/sales.api").ChangeOrderDTO[]>(`/projects/${id}/change-orders`); }
  createChange(id: number, borrador: import("@/features/sales/api/sales.api").EstimateDraftDTO) { return this.http.post(`/projects/${id}/change-orders`, { borrador }); }
  editChange(projectId: number, id: number, borrador: import("@/features/sales/api/sales.api").EstimateDraftDTO) { return this.http.patch(`/projects/${projectId}/change-orders/${id}`, { borrador }); }
  decideChange(projectId: number, id: number, estado: string, password?: string) { return this.http.post(`/projects/${projectId}/change-orders/${id}/transition`, { estado, password }); }
  assign(projectId: number, userId: number, profesion: string): Promise<ProjectDTO> { return this.http.post(`/projects/${projectId}/professionals`, { userId, profesion }); }
  unassign(projectId: number, userId: number):                    Promise<ProjectDTO> { return this.http.delete(`/projects/${projectId}/professionals/${userId}`); }
}
