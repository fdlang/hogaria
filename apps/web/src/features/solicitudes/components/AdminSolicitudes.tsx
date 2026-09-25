/**
 * AdminSolicitudes — admin view of incoming contact form submissions.
 * Uses the same SolicitudesApi but the list/convert endpoints.
 */

import { useCallback, useEffect, useState } from "react";
import { ApiClient } from "@/shared/lib/api-client";
import { Button, Spinner, EmptyState, Modal, Badge } from "@/shared/ui";
import { useNotifications } from "@/shared/ui/notifications";
import { formatDateTime } from "@/shared/lib/formatters";

// Extend the SolicitudesApi with admin-only endpoints (kept here to avoid growing
// the public API class with admin-specific methods)
export class AdminSolicitudesApi {
  constructor(private readonly http: ApiClient) {}
  list(): Promise<SolicitudDTO[]> { return this.http.get("/solicitudes"); }
  page(page: number, limit = 20): Promise<SolicitudPage> { return this.http.get(`/solicitudes?page=${page}&limit=${limit}`); }
  convert(id: number, direccion: string): Promise<{ id: number }> { return this.http.post(`/solicitudes/${id}/opportunity`, { direccion }); }
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
interface SolicitudPage { items: SolicitudDTO[]; total: number; page: number; limit: number; pages: number }

interface Props { api: AdminSolicitudesApi }

export function AdminSolicitudes({ api }: Props) {
  const [address, setAddress] = useState("");
  const [converting, setConverting] = useState(false);
  const [updatingId, setUpdatingId] = useState<number | null>(null);
  const [items, setItems]     = useState<SolicitudDTO[]>([]);
  const [page, setPage] = useState(1);
  const [pageInfo, setPageInfo] = useState({ total: 0, pages: 1 });
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);
  const [detail, setDetail]   = useState<SolicitudDTO | null>(null);
  const [rejecting, setRejecting] = useState<SolicitudDTO | null>(null);
  const [rejectionReason, setRejectionReason] = useState("");
  const { push } = useNotifications();
  const copyEmail = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      push("Email copiado", "success");
    } catch {
      push("No se pudo copiar el email. Selecciónalo manualmente.", "error");
    }
  };

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try { const result = await api.page(page); setItems(result.items); setPageInfo({ total: result.total, pages: result.pages }); }
    catch (e) { setError((e as { message?: string }).message ?? "Error"); }
    finally   { setLoading(false); }
  }, [api, page]);

  useEffect(() => { load(); }, [load]);

  const handleContact = async (s: SolicitudDTO) => {
    if (updatingId !== null) return;
    try { setUpdatingId(s.id); await api.markContacted(s.id); push("Marcada como contactada", "success"); await load(); }
    catch (e) { push((e as { message?: string }).message ?? "Error", "error"); }
    finally { setUpdatingId(null); }
  };

  const handleReject = async () => {
    const s = rejecting;
    const reason = rejectionReason.trim();
    if (!s || reason.length < 3) return;
    if (updatingId !== null) return;
    try { setUpdatingId(s.id); await api.reject(s.id, reason); push("Solicitud rechazada", "success"); setRejecting(null); setRejectionReason(""); await load(); }
    catch (e) { push((e as { message?: string }).message ?? "Error", "error"); }
    finally { setUpdatingId(null); }
  };

  if (loading) return <div style={{ display: "flex", justifyContent: "center", padding: 60 }}><Spinner size={32} /></div>;
  if (error)   return <div role="alert" style={{ color: "#b5483f", padding: 20 }}><p>{error}</p><Button small variant="ghost" onClick={() => void load()}>Reintentar</Button></div>;

  const pending = items.filter(i => i.estado === "pendiente");

  return (
    <section className="private-page private-requests">
      <header className="private-page-header" style={{ display: "flex", justifyContent: "space-between", marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 38, fontWeight: 700, color: "#302d29" }}>Solicitudes</h1>
          <p style={{ fontSize: 13, color: "#71685e", marginTop: 6 }}>
            {pageInfo.total} solicitudes · {pending.length} pendientes en esta página
          </p>
        </div>
        <Button small variant="ghost" onClick={load}>↻ Actualizar</Button>
      </header>

      {items.length === 0
        ? <EmptyState icon="✉" title="Sin solicitudes" hint="Aparecerán aquí cuando lleguen desde la landing" />
        : <div role="list" style={{ display: "grid", gap: 10 }}>
            {items.map(s => (
              <article key={s.id} role="listitem" className="private-action-card"
                style={{ padding: 16, background: "#fffaf4", border: `1px solid ${s.estado === "pendiente" ? "#fbbf24" : "#d8c4ad"}`, borderRadius: 10, display: "grid", gridTemplateColumns: "1fr auto", gap: 16, alignItems: "center" }}>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
                    <h3 style={{ fontSize: 14, fontWeight: 600, color: "#302d29" }}>{s.nombre}</h3>
                    <Badge color={s.estado === "pendiente" ? "#996515" : s.estado === "contactado" ? "#247a55" : "#b5483f"}>{s.estado}</Badge>
                    <Badge color="#60a5fa">{s.tipo}</Badge>
                  </div>
                  <p style={{ fontSize: 12, color: "#71685e" }}>
                    {s.email} {s.telefono && `· ${s.telefono}`} · {formatDateTime(s.fecha)}
                  </p>
                </div>
                <div className="private-action-card__actions" style={{ display: "flex", gap: 6 }}>
                  <Button small variant="ghost" onClick={() => setDetail(s)}>Ver</Button>
                  {s.estado === "pendiente" && (
                    <>
                      <Button small disabled={updatingId !== null} loading={updatingId === s.id} onClick={() => handleContact(s)}>✓ Marcar contactada</Button>
                      <Button small disabled={updatingId !== null} variant="danger" aria-label={`Rechazar solicitud de ${s.nombre}`} onClick={() => { setRejecting(s); setRejectionReason(""); }}>✕</Button>
                    </>
                  )}
                </div>
              </article>
            ))}
          </div>}
      <div className="private-pagination" style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 10, marginTop: 18 }}>
        <Button small variant="ghost" disabled={page <= 1 || loading} onClick={() => setPage(value => value - 1)}>Anterior</Button>
        <span>Página {page} de {pageInfo.pages}</span>
        <Button small variant="ghost" disabled={page >= pageInfo.pages || loading} onClick={() => setPage(value => value + 1)}>Siguiente</Button>
      </div>

      <Modal open={!!detail} onClose={() => { setDetail(null); setAddress(""); }} title="Detalle de solicitud" width={600}>
        {detail && (
          <div>
            {detail.estado !== "rechazado" && <form onSubmit={async event => {
              event.preventDefault(); if (converting || !address.trim()) return;
              setConverting(true);
              try { const saved = await api.convert(detail.id, address); window.location.hash = `#/admin/budgets?opportunity=${saved.id}`; }
              catch (error) { push((error as Error).message || "No se pudo convertir la solicitud", "error"); }
              finally { setConverting(false); }
            }}>
              <label>Dirección de la obra<input required value={address} onChange={event => setAddress(event.target.value)} /></label>
              <Button type="submit" loading={converting}>Crear o abrir oportunidad</Button>
            </form>}
            <dl style={{ display: "grid", gap: 10, fontSize: 13, marginBottom: 20 }}>
              <MetaRow k="Nombre"      v={detail.nombre} />
              <MetaRow k="Email"       v={detail.email} onCopy={copyEmail} />
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
      <Modal open={rejecting !== null} onClose={() => { if (updatingId === null) { setRejecting(null); setRejectionReason(""); } }} title="Rechazar solicitud" width={520}>
        <p>Indica el motivo. Quedará registrado en el historial de actividad.</p>
        <label style={{ display: "grid", gap: 6, marginTop: 14 }}>Motivo<textarea rows={4} value={rejectionReason} maxLength={500} onChange={event => setRejectionReason(event.target.value)} /></label>
        <footer style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 }}><Button variant="ghost" disabled={updatingId !== null} onClick={() => { setRejecting(null); setRejectionReason(""); }}>Cancelar</Button><Button variant="danger" loading={updatingId !== null} disabled={rejectionReason.trim().length < 3} onClick={() => void handleReject()}>Rechazar</Button></footer>
      </Modal>
    </section>
  );
}

function MetaRow({ k, v, onCopy }: { k: string; v: string; onCopy?: (value: string) => Promise<void> }) {
  return (
    <div className="solicitud-meta-row" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingBottom: 6, borderBottom: "1px solid #decdb8" }}>
      <dt style={{ color: "#71685e" }}>{k}</dt>
      <dd style={{ color: "#302d29", fontWeight: 600, display: "flex", alignItems: "center", gap: 6, minWidth: 0, overflowWrap: "anywhere" }}>
        {v}
        {onCopy && <button type="button" aria-label={`Copiar ${k.toLowerCase()}`} onClick={() => void onCopy(v)} style={{ background: "none", border: "none", color: "#c17248", cursor: "pointer", fontSize: 12 }}>📋</button>}
      </dd>
    </div>
  );
}
