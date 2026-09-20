import { useMemo, useState } from "react";
import { AuditApi, useAuditLog, type AuditEntryDTO } from "../api/audit.api";
import { Button, Spinner, EmptyState } from "@/shared/ui";
import { formatDateTime } from "@/shared/lib/formatters";
import {
  BUSINESS_ACTIONS,
  auditActionLabel,
  auditDescription,
  auditTone,
  isTechnicalAudit,
} from "../audit-presentation";
import "../audit.css";

interface Props { api: AuditApi }

export function AdminActivity({ api }: Props) {
  const log = useAuditLog(api);
  const [showTechnical, setShowTechnical] = useState(false);
  const visibleEntries = useMemo(
    () => (log.page?.items ?? []).filter(entry => showTechnical || !isTechnicalAudit(entry.action)),
    [log.page?.items, showTechnical],
  );
  const hiddenTechnical = (log.page?.items.length ?? 0) - visibleEntries.length;

  return (
    <section className="audit-page">
      <header className="audit-page__header">
        <div>
          <p className="eyebrow">Administración</p>
          <h1>Historial de actividad</h1>
          <p>
            {log.page?.total ?? 0} movimientos registrados
            {log.query.action ? ` · Filtro: ${auditActionLabel(log.query.action)}` : ""}
          </p>
        </div>
      </header>

      <div className="audit-filters" aria-label="Filtros de actividad">
        <label>
          Tipo de actividad
          <select value={log.query.action ?? ""} onChange={event => log.setFilter({ action: event.target.value || null })}>
            <option value="">Todas las actividades</option>
            {BUSINESS_ACTIONS.map(action => <option key={action} value={action}>{auditActionLabel(action)}</option>)}
          </select>
        </label>
        <label>
          Desde
          <input type="date" value={log.query.from ?? ""} onChange={event => log.setFilter({ from: event.target.value || null })} />
        </label>
        <label>
          Hasta
          <input type="date" value={log.query.to ?? ""} onChange={event => log.setFilter({ to: event.target.value || null })} />
        </label>
        <label className="audit-filters__technical">
          <input type="checkbox" checked={showTechnical} onChange={event => setShowTechnical(event.target.checked)} />
          Mostrar registros técnicos
        </label>
        {(log.query.action || log.query.from || log.query.to) && (
          <Button small variant="ghost" onClick={() => log.setFilter({ action: null, from: null, to: null })}>
            Limpiar filtros
          </Button>
        )}
      </div>

      {hiddenTechnical > 0 && (
        <p className="audit-page__technical-note" role="status">
          {hiddenTechnical} {hiddenTechnical === 1 ? "registro técnico oculto" : "registros técnicos ocultos"} en esta página.
        </p>
      )}

      {log.loading ? (
        <div className="audit-page__loading"><Spinner size={32} /></div>
      ) : log.error ? (
        <div role="alert" className="audit-page__error">{log.error}</div>
      ) : !log.page || visibleEntries.length === 0 ? (
        <EmptyState
          icon="◎"
          title={hiddenTechnical ? "No hay actividad operativa en esta página" : "Sin actividad"}
          hint={hiddenTechnical ? "Activa los registros técnicos para consultar la trazabilidad interna." : "Prueba a cambiar los filtros."}
        />
      ) : (
        <>
          <ul className="audit-timeline">
            {visibleEntries.map((entry, index) => (
              <ActivityEntry key={entry.id} entry={entry} continued={index < visibleEntries.length - 1} />
            ))}
          </ul>
          {log.page.pages > 1 && (
            <nav className="audit-pagination" aria-label="Páginas del historial">
              <Button small variant="ghost" onClick={log.prevPage} disabled={log.page.page === 0}>Anterior</Button>
              <span>Página {log.page.page + 1} de {log.page.pages}</span>
              <Button small variant="ghost" onClick={log.nextPage} disabled={log.page.page >= log.page.pages - 1}>Siguiente</Button>
            </nav>
          )}
        </>
      )}
    </section>
  );
}

function ActivityEntry({ entry, continued }: { entry: AuditEntryDTO; continued: boolean }) {
  const technical = isTechnicalAudit(entry.action);
  return (
    <li className="audit-entry">
      <div className="audit-entry__rail" aria-hidden="true">
        <span data-tone={auditTone(entry.action)} />
        {continued && <i />}
      </div>
      <article className="audit-entry__content">
        <div className="audit-entry__heading">
          <h2>{auditActionLabel(entry.action)}</h2>
          {technical && <span className="audit-entry__technical-badge">Técnico</span>}
        </div>
        <p className="audit-entry__description">{auditDescription(entry)}</p>
        <p className="audit-entry__meta">
          <strong>{entry.userName}</strong><span aria-hidden="true">·</span>
          <time dateTime={entry.timestamp}>{formatDateTime(entry.timestamp)}</time>
        </p>
        <details className="audit-entry__details">
          <summary>Ver detalles técnicos</summary>
          <dl>
            <div><dt>Código</dt><dd>{entry.action}</dd></div>
            <div><dt>Dirección IP</dt><dd>{entry.ip}</dd></div>
            <div><dt>Navegador</dt><dd>{entry.userAgent}</dd></div>
          </dl>
          <pre>{JSON.stringify(entry.details, null, 2)}</pre>
        </details>
      </article>
    </li>
  );
}
