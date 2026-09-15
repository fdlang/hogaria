/**
 * AdminActivity — paginated audit log viewer.
 * Uses useAuditLog hook that owns pagination/filter state.
 */

import { AuditApi, useAuditLog } from "../api/audit.api";
import { Button, Spinner, EmptyState } from "@/shared/ui";
import { formatDateTime } from "@/shared/lib/formatters";

interface Props { api: AuditApi }

const ACTION_COLORS: Record<string, string> = {
  LOGIN_SUCCESS:               "#34d399",
  DOCUMENTO_FIRMADO:           "#c17248",
  PRESUPUESTO_CREADO:          "#60a5fa",
  PRESUPUESTO_ENVIADO:         "#60a5fa",
  FIRMA_CHALLENGE_SOLICITADO:  "#fbbf24",
  FIRMA_INTENTO_INVALIDO:      "#f87171",
  FIRMA_PASSWORD_INCORRECTO:   "#f87171",
  USUARIO_CREADO:              "#c17248",
  USUARIO_DESACTIVADO:         "#f87171",
  CONTRASENA_RESETEADA:        "#fbbf24",
  PROYECTO_CREADO:             "#34d399",
  PROYECTO_FINALIZADO:         "#c17248",
  ARCHIVO_SUBIDO:              "#60a5fa",
  PROFESIONAL_ASIGNADO:        "#60a5fa",
  PROFESIONAL_DESASIGNADO:     "#f87171",
};

const ACTION_OPTIONS = Object.keys(ACTION_COLORS);

export function AdminActivity({ api }: Props) {
  const log = useAuditLog(api);

  return (
    <section>
      <header style={{ display: "flex", justifyContent: "space-between", marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 38, fontWeight: 700, color: "#302d29" }}>Actividad</h1>
          <p style={{ fontSize: 13, color: "#71685e", marginTop: 6 }}>
            Audit log · {log.page?.total ?? 0} eventos{log.query.action ? ` · filtrando "${log.query.action}"` : ""}
          </p>
        </div>
      </header>

      {/* Filters */}
      <div style={{ display: "flex", gap: 10, marginBottom: 20, flexWrap: "wrap" }}>
        <select value={log.query.action ?? ""} onChange={e => log.setFilter({ action: e.target.value || null })}
          style={{ background: "#fffaf4", border: "1px solid #cdb69d", borderRadius: 8, padding: "7px 12px", color: log.query.action ? "#c17248" : "#71685e", fontSize: 12, cursor: "pointer" }}>
          <option value="">Todos los eventos</option>
          {ACTION_OPTIONS.map(a => <option key={a} value={a}>{a}</option>)}
        </select>

        <input type="date" value={log.query.from ?? ""}
          onChange={e => log.setFilter({ from: e.target.value || null })}
          style={{ background: "#fffaf4", border: "1px solid #cdb69d", borderRadius: 8, padding: "7px 12px", color: "#302d29", fontSize: 12 }} />
        <input type="date" value={log.query.to ?? ""}
          onChange={e => log.setFilter({ to: e.target.value || null })}
          style={{ background: "#fffaf4", border: "1px solid #cdb69d", borderRadius: 8, padding: "7px 12px", color: "#302d29", fontSize: 12 }} />

        {(log.query.action || log.query.from || log.query.to) && (
          <Button small variant="ghost" onClick={() => log.setFilter({ action: null, from: null, to: null })}>✕ Limpiar</Button>
        )}
      </div>

      {/* Body */}
      {log.loading ? (
        <div style={{ display: "flex", justifyContent: "center", padding: 60 }}><Spinner size={32} /></div>
      ) : log.error ? (
        <div role="alert" style={{ color: "#f87171", padding: 20 }}>{log.error}</div>
      ) : !log.page || log.page.items.length === 0 ? (
        <EmptyState icon="◎" title="Sin eventos" hint="Prueba a cambiar los filtros" />
      ) : (
        <>
          {/* Timeline */}
          <ul style={{ listStyle: "none", padding: 0, maxWidth: 800 }}>
            {log.page.items.map((entry, i) => (
              <li key={entry.id} style={{ display: "flex", gap: 16 }}>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", paddingTop: 4 }}>
                  <div style={{ width: 8, height: 8, borderRadius: "50%", background: ACTION_COLORS[entry.action] ?? "#71685e", flexShrink: 0 }} />
                  {i < log.page!.items.length - 1 && <div style={{ width: 1, flex: 1, background: "#decdb8", minHeight: 24 }} />}
                </div>
                <div style={{ flex: 1, paddingBottom: 18 }}>
                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginBottom: 4 }}>
                    <span style={{ fontSize: 10, fontWeight: 700, fontFamily: "monospace", color: ACTION_COLORS[entry.action] ?? "#71685e", background: `${ACTION_COLORS[entry.action] ?? "#71685e"}18`, padding: "2px 7px", borderRadius: 4 }}>
                      {entry.action}
                    </span>
                    <span style={{ fontSize: 10, color: "#85786b" }}>{formatDateTime(entry.timestamp)}</span>
                    <span style={{ fontSize: 10, color: "#545048" }}>IP: {entry.ip}</span>
                  </div>
                  <p style={{ fontSize: 12, color: "#71685e" }}>
                    Usuario: <strong style={{ color: "#302d29" }}>{entry.userName}</strong>
                    {" "}<span style={{ fontFamily: "monospace", fontSize: 10, color: "#85786b" }}>
                      · {JSON.stringify(entry.details)}
                    </span>
                  </p>
                </div>
              </li>
            ))}
          </ul>

          {/* Pagination */}
          {log.page.pages > 1 && (
            <nav style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 16, justifyContent: "center" }}>
              <Button small variant="ghost" onClick={log.prevPage} disabled={log.page.page === 0}>← Anterior</Button>
              <span style={{ fontSize: 12, color: "#71685e" }}>
                Página {log.page.page + 1} / {log.page.pages}
              </span>
              <Button small variant="ghost" onClick={log.nextPage} disabled={log.page.page >= log.page.pages - 1}>Siguiente →</Button>
            </nav>
          )}
        </>
      )}
    </section>
  );
}
