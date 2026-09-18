/**
 * Solicitudes feature — public contact form (no auth).
 * Rate-limited server-side.
 */

import { useState, useCallback } from "react";
import { ApiClient } from "@/shared/lib/api-client";

export interface SolicitudPayload {
  nombre: string; email: string; telefono?: string;
  tipo: string; descripcion: string;
}

export class SolicitudesApi {
  constructor(private readonly http: ApiClient) {}
  submit(payload: SolicitudPayload): Promise<{ id: number }> { return this.http.post("/solicitudes", payload); }
}

export function useSubmitSolicitud(api: SolicitudesApi) {
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone]             = useState(false);

  const submit = useCallback(async (payload: SolicitudPayload) => {
    setSubmitting(true);
    try {
      // Basic client-side validation mirroring server rules
      if (!payload.nombre?.trim())         throw new Error("Nombre obligatorio");
      if (!payload.email?.trim())          throw new Error("Email obligatorio");
      if (!payload.tipo?.trim())           throw new Error("Tipo obligatorio");
      if (!payload.descripcion?.trim() || payload.descripcion.length < 20) {
        throw new Error("La descripción debe tener al menos 20 caracteres");
      }
      await api.submit(payload);
      setDone(true);
    } catch (e) {
      throw e;
    } finally { setSubmitting(false); }
  }, [api]);

  const reset = useCallback(() => { setDone(false); }, []);

  return { submit, submitting, done, reset };
}
