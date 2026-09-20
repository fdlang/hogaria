/** Project documents persisted in private object storage through the API. */

import { useCallback, useEffect, useState } from "react";
import { ApiClient } from "@/shared/lib/api-client";

export interface FileDTO {
  id: number; projectId: number; uploadedBy: number;
  nombre: string; tipo: string; tamaño: number;
  sensitive: boolean;
  classification?: "publico" | "tecnico" | "contrato" | "factura" | "reservado";
  uploadedAt: string;
}

// Base64 is sent to a Vercel Function, whose request body is limited to 4.5 MB.
const MAX_FILE_BYTES = 3 * 1024 * 1024;
const ALLOWED_MIMES = [
  "image/jpeg", "image/png", "image/webp", "image/gif",
  "application/pdf",
];

export class FilesApi {
  constructor(private readonly http: ApiClient) {}
  list(projectId: number): Promise<FileDTO[]> { return this.http.get(`/projects/${projectId}/files`); }

  async upload(projectId: number, file: File, sensitive: boolean, classification?: FileDTO["classification"]): Promise<FileDTO> {
    if (file.size > MAX_FILE_BYTES) throw new Error("El archivo supera el límite de 3 MB");
    if (!ALLOWED_MIMES.includes(file.type)) throw new Error(`Tipo no permitido: ${file.type}`);
    const contenidoBase64 = await toBase64(file);
    return this.http.post(`/projects/${projectId}/files`, {
      nombre: file.name, tipo: file.type, tamaño: file.size, sensitive, contenidoBase64, ...(classification ? { classification } : {}),
    });
  }

  delete(fileId: number): Promise<void> { return this.http.delete(`/files/${fileId}`); }
  download(fileId: number): Promise<Blob> { return this.http.download(`/files/${fileId}/download`); }
}

function toBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("No se pudo leer el archivo"));
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== "string") { reject(new Error("No se pudo leer el archivo")); return; }
      resolve(result.split(",", 2)[1] ?? "");
    };
    reader.readAsDataURL(file);
  });
}

export function useProjectFiles(api: FilesApi, projectId: number | null) {
  const [data, setData] = useState<FileDTO[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (projectId == null) return;
    setLoading(true); setError(null);
    try { setData(await api.list(projectId)); }
    catch (e) { setError((e as { message?: string }).message ?? "Error"); }
    finally { setLoading(false); }
  }, [api, projectId]);

  useEffect(() => { if (projectId != null) refresh(); }, [projectId, refresh]);

  const upload = useCallback(async (file: File, sensitive: boolean, classification?: FileDTO["classification"]) => {
    if (projectId == null) return;
    const created = await api.upload(projectId, file, sensitive, classification);
    setData(list => [...list, created]);
    return created;
  }, [api, projectId]);

  const remove = useCallback(async (fileId: number) => {
    await api.delete(fileId);
    setData(list => list.filter(f => f.id !== fileId));
  }, [api]);

  return { data, loading, error, refresh, upload, remove };
}
