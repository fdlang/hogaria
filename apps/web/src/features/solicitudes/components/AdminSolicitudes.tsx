/**
 * AdminSolicitudes — admin view of incoming contact form submissions.
 * Uses the same SolicitudesApi but the list/convert endpoints.
 */

import { useCallback, useEffect, useState } from "react";
import { SolicitudesApi } from "../api/solicitudes.api";
import { ApiClient } from "@/shared/lib/api-client";
import { Button, Spinner, EmptyState, Modal, Badge } from "@/shared/ui";
import { useNotifications } from "@/shared/ui/notifications";
import { formatDateTime } from "@/shared/lib/formatters";

// Extend the SolicitudesApi with admin-only endpoints (kept here to avoid growing
// the public API class with admin-specific methods)
export class AdminSolicitudesApi {
  constructor(private readonly http: ApiClient) {}
  list(): Promise<SolicitudDTO[]> { return this.http.get("/solicitudes"); }
  markContacted(id: number): Promise<void> { return this.http.post(`/solicitudes/${id}/contact`, {}); }
  reject(id: number, reason: string): Promise<void> { return this.http.post(`/solicitudes/${id}/reject`, { reason }); }
}

export interface SolicitudDTO {
  id: number; nombre: string; email: string; telefono: string;
  tipo: string; descripcion: string;
  fecha: string;
  estado: "pendiente" | "contactado" | "rechazado";
  ip: string;
}

interface Props { api: AdminSolicitudesApi }

export function AdminSolicitudes({ api }: Props) {
  const [items, setItems]     = useState<SolicitudDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);
  const [detail, setDetail]   = useState<SolicitudDTO | null>(null);
  const { push } = useNotifications();

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try { setItems(await api.list()); }
    catch (e) { setError((e as { message?: string }).message ?? "Error"); }
    finally   { setLoading(false); }
  }, [api]);

  useEffect(() => { load(); }, [load]);

  const handleContact = async (s: SolicitudDTO) => {
    try { await api.markContacted(s.id); push("Marcada como contactada", "success"); load(); }
    catch (e) { push((e as { message?: string }).message ?? "Error", "error"); }
  };

  const handleReject = async (s: SolicitudDTO) => {
    const reason = prompt("Motivo de rechazo (quedará en el audit log):");
    if (!reason) return;
    try { await api.reject(s.id, reason); push("Solicitud rechazada", "success"); load(); }
    catch (e) { push((e as { message?: string }).message ?? "Error", "error"); }
  };

  if (loading) return <div style={{ display: "flex", justifyContent: "center", padding: 60 }}><Spinner size={32} /></div>;
  if (error)   return <div role="alert" style={{ color: "#f87171", padding: 20 }}>{error}</div>;

  const pending = items.filter(i => i.estado === "pendiente");

  return (
    <section>
      <header style={{ display: "flex", justifyContent: "space-between", marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 38, fontWeight: 700, color: "#302d29" }}>Solicitudes</h1>
          <p style={{ fontSize: 13, color: "#71685e", marginTop: 6 }}>
            {pending.length} pendientes · {items.length} totales
          </p>
        </div>
        <Button small variant="ghost" onClick={load}>↻ Actualizar</Button>
      </header>

      {items.length === 0
        ? <EmptyState icon="✉" title="Sin solicitudes" hint="Aparecerán aquí cuando lleguen desde la landing" />
        : <div role="list" style={{ display: "grid", gap: 10 }}>
            {items.map(s => (
              <article key={s.id} role="listitem"
                style={{ padding: 16, background: "#fffaf4", border: `1px solid ${s.estado === "pendiente" ? "#fbbf24" : "#d8c4ad"}`, borderRadius: 10, display: "grid", gridTemplateColumns: "1fr auto", gap: 16, alignItems: "center" }}>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
                    <h3 style={{ fontSize: 14, fontWeight: 600, color: "#302d29" }}>{s.nombre}</h3>
                    <Badge color={s.estado === "pendiente" ? "#fbbf24" : s.estado === "contactado" ? "#34d399" : "#f87171"}>{s.estado}</Badge>
                    <Badge color="#60a5fa">{s.tipo}</Badge>
                  </div>
                  <p style={{ fontSize: 12, color: "#71685e" }}>
                    {s.email} {s.telefono && `· ${s.telefono}`} · {formatDateTime(s.fecha)}
                  </p>
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  <Button small variant="ghost" onClick={() => setDetail(s)}>Ver</Button>
                  {s.estado === "pendiente" && (
                    <>
                      <Button small onClick={() => handleContact(s)}>✓ Contactar</Button>
                      <Button small variant="danger" onClick={() => handleReject(s)}>✕</Button>
                    </>
                  )}
                </div>
              </article>
            ))}
          </div>}

      <Modal open={!!detail} onClose={() => setDetail(null)} title="Detalle de solicitud" width={600}>
        {detail && (
          <div>
            <dl style={{ display: "grid", gap: 10, fontSize: 13, marginBottom: 20 }}>
              <MetaRow k="Nombre"      v={detail.nombre} />
              <MetaRow k="Email"       v={detail.email} copyable />
              <MetaRow k="Teléfono"   v={detail.telefono || "—"} />
              <MetaRow k="Tipo"        v={detail.tipo} />
              <MetaRow k="Recibida"    v={formatDateTime(detail.fecha)} />
              <MetaRow k="IP"          v={detail.ip} />
            </dl>
            <div>
              <p style={{ fontSize: 12, color: "#71685e", textTransform: "uppercase", letterSpacing: ".05em", marginBottom: 6 }}>Descripción</p>
              <p style={{ fontSize: 13, color: "#302d29", lineHeight: 1.6, padding: 14, background: "#f8efe4", borderRadius: 8, whiteSpace: "pre-wrap" }}>
                {detail.descripcion}
              </p>
            </div>
          </div>
        )}
      </Modal>
    </section>
  );
}

function MetaRow({ k, v, copyable }: { k: string; v: string; copyable?: boolean }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingBottom: 6, borderBottom: "1px solid #decdb8" }}>
      <dt style={{ color: "#71685e" }}>{k}</dt>
      <dd style={{ color: "#302d29", fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
        {v}
        {copyable && <button onClick={() => navigator.clipboard.writeText(v)} style={{ background: "none", border: "none", color: "#c17248", cursor: "pointer", fontSize: 12 }}>📋</button>}
      </dd>
    </div>
  );
}
