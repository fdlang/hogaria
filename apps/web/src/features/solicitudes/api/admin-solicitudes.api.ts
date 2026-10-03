import { ApiClient } from "@/shared/lib/api-client";

export interface SolicitudDTO {
  id: number;
  nombre: string;
  email: string;
  telefono: string;
  tipo: string;
  descripcion: string;
  fecha: string;
  estado: "pendiente" | "contactado" | "rechazado";
  ip: string;
}

interface SolicitudPage {
  items: SolicitudDTO[];
  total: number;
  page: number;
  limit: number;
  pages: number;
}

export class AdminSolicitudesApi {
  constructor(private readonly http: ApiClient) {}
  list(): Promise<SolicitudDTO[]> { return this.http.get("/solicitudes"); }
  page(page: number, limit = 20): Promise<SolicitudPage> { return this.http.get(`/solicitudes?page=${page}&limit=${limit}`); }
  convert(id: number, direccion: string): Promise<{ id: number }> { return this.http.post(`/solicitudes/${id}/opportunity`, { direccion }); }
  markContacted(id: number): Promise<void> { return this.http.post(`/solicitudes/${id}/contact`, {}); }
  reject(id: number, reason: string): Promise<void> { return this.http.post(`/solicitudes/${id}/reject`, { reason }); }
}
