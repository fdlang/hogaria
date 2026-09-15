/**
 * Files feature — project documents and images.
 * Upload goes through pre-signed URL when wired to S3; here simplified.
 */

import { useCallback, useEffect, useState } from "react";
import { ApiClient } from "@/shared/lib/api-client";

export interface FileDTO {
  id: number; projectId: number; uploadedBy: number;
  nombre: string; tipo: string; tamaño: number;
  storageKey: string; sensitive: boolean;
  uploadedAt: string;
}

const MAX_FILE_BYTES = 25 * 1024 * 1024;
const ALLOWED_MIMES = [
  "image/jpeg", "image/png", "image/webp", "image/gif",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
];

export class FilesApi {
  constructor(private readonly http: ApiClient) {}

  list(projectId: number): Promise<FileDTO[]>      { return this.http.get(`/projects/${projectId}/files`); }

  async upload(projectId: number, file: File, sensitive: boolean): Promise<FileDTO> {
    // Client-side validation — server re-validates with magic bytes
    if (file.size > MAX_FILE_BYTES) throw new Error(`Archivo supera ${MAX_FILE_BYTES / 1024 / 1024} MB`);
    if (!ALLOWED_MIMES.includes(file.type)) throw new Error(`Tipo no permitido: ${file.type}`);

    // In production: POST /files/presign → PUT to S3 → POST /files (metadata only)
    const body = { nombre: file.name, tipo: file.type, tamaño: file.size, sensitive, storageKey: `stub-${crypto.randomUUID()}` };
    return this.http.post(`/projects/${projectId}/files`, body);
  }

  delete(fileId: number): Promise<void> { return this.http.delete(`/files/${fileId}`); }
}

export function useProjectFiles(api: FilesApi, projectId: number | null) {
  const [data, setData]       = useState<FileDTO[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (projectId == null) return;
    setLoading(true); setError(null);
    try { setData(await api.list(projectId)); }
    catch (e) { setError((e as { message?: string }).message ?? "Error"); }
    finally   { setLoading(false); }
  }, [api, projectId]);

  useEffect(() => { if (projectId != null) refresh(); }, [projectId, refresh]);

  const upload = useCallback(async (file: File, sensitive: boolean) => {
    if (projectId == null) return;
    const created = await api.upload(projectId, file, sensitive);
    setData(list => [...list, created]);
    return created;
  }, [api, projectId]);

  const remove = useCallback(async (fileId: number) => {
    await api.delete(fileId);
    setData(list => list.filter(f => f.id !== fileId));
  }, [api]);

  return { data, loading, error, refresh, upload, remove };
}
