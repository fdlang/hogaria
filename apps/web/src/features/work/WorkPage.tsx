import { useRef, useState } from "react";
import { workSeconds, workCostCents } from "@reformapro/domain";
import type { WorkFilters } from "@reformapro/domain";
import type {
  ProjectsApi,
  ProjectDTO,
} from "@/features/projects/api/projects.api";
import type { UsersApi } from "@/features/users/api/users.api";
import { usePermissions } from "@/shared/hooks/usePermissions";
import { useNotifications } from "@/shared/ui/notifications";
import { useNavigation } from "@/app/Router";
import { WorkApi, type Entry } from "./work.api";
import { WorkRates, WorkProjectSummary } from "./WorkSettings";
import {
  Field,
  WorkForm,
  useWorkQuery,
  interval,
  localDate,
  money,
  when,
  val,
  num,
} from "./work-ui";
import "./work.css";

export function WorkPage({
  api,
  projects,
  users,
}: {
  api: WorkApi;
  projects: ProjectsApi;
  users: UsersApi;
}) {
  const { isAdmin, isProfesional } = usePermissions();
  const { currentPath } = useNavigation();
  const requestedProjectId = (() => {
    const raw = new URLSearchParams(currentPath.split("?")[1] ?? "").get("projectId");
    const parsed = Number(raw);
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : undefined;
  })();
  const [revision, setRevision] = useState(0);
  const refresh = () => setRevision((x) => x + 1);
  const [audit, setAudit] = useState(false);
  const { push } = useNotifications();
  const saved = () => {
    push("Cambio guardado correctamente", "success");
    refresh();
  };
  const [filters, setFilters] = useState<WorkFilters>({
    page: 0,
    ...(requestedProjectId ? { projectId: requestedProjectId } : {}),
  });
  const projectQuery = useWorkQuery(
    () => projects.list(),
    [projects, revision],
  );
  const people = useWorkQuery(
    () => (isAdmin ? users.list("profesional") : Promise.resolve([])),
    [users, isAdmin],
  );
  const records = useWorkQuery(
    () => api.list(filters),
    [api, JSON.stringify(filters), revision],
  );
  const change = (next: Partial<WorkFilters>) =>
    setFilters((f) => ({ ...f, ...next, page: 0 }));
  if (!isAdmin && !isProfesional) return null;
  return (
    <section className="work-page private-page">
      <header className="work-page__header">
        <h1>{isAdmin ? "Jornadas y costes" : "Mi trabajo"}</h1>
        <p>
          {isAdmin
            ? "Revisa registros, conserva las tarifas históricas y compara el coste aprobado con la previsión."
            : "Registra tu jornada o tus partes en las obras asignadas. Los registros conservan su historial de cambios."}
        </p>
        <button onClick={refresh}>Actualizar</button>
      </header>
      {projectQuery.error && <p role="alert">No se pudieron cargar tus obras. Actualiza la página o inténtalo de nuevo.</p>}
      {people.error && <p role="alert">{people.error}</p>}
      {!isAdmin && projectQuery.loading && (
        <section className="work-card"><p role="status">Cargando obras asignadas…</p></section>
      )}
      {!isAdmin && !projectQuery.loading && !projectQuery.error && (
        <WorkClock
          key={revision}
          api={api}
          projects={projectQuery.value ?? []}
          preferredProjectId={requestedProjectId}
          onSaved={saved}
        />
      )}
      <section className="work-card">
        <h2>Registros de trabajo</h2>
        <div className="work-filters">
          <label>
            Obra
            <select
              value={filters.projectId ?? ""}
              onChange={(e) =>
                change({
                  projectId: e.target.value
                    ? Number(e.target.value)
                    : undefined,
                })
              }
            >
              <option value="">Todas las obras</option>
              {projectQuery.value?.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre}
                </option>
              ))}
            </select>
          </label>
          {isAdmin && (
            <label>
              Profesional
              <select
                value={filters.professionalId ?? ""}
                onChange={(e) =>
                  change({
                    professionalId: e.target.value
                      ? Number(e.target.value)
                      : undefined,
                  })
                }
              >
                <option value="">Todos los profesionales</option>
                {people.value?.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nombre}
                    {!p.activo ? " (inactivo)" : ""}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label>
            Estado
            <select
              value={filters.status ?? ""}
              onChange={(e) =>
                change({
                  status: (e.target.value ||
                    undefined) as WorkFilters["status"],
                })
              }
            >
              <option value="">Todos</option>
              {["abierto", "enviado", "aprobado", "rechazado"].map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </label>
          <label>
            Desde
            <input
              type="date"
              onChange={(e) =>
                change({
                  from: e.target.value
                    ? new Date(e.target.value + "T00:00:00").toISOString()
                    : undefined,
                })
              }
            />
          </label>
          <label>
            Hasta
            <input
              type="date"
              onChange={(e) =>
                change({
                  to: e.target.value
                    ? new Date(e.target.value + "T23:59:59.999").toISOString()
                    : undefined,
                })
              }
            />
          </label>
        </div>
        {records.loading && <p role="status">Cargando registros…</p>}
        {records.error && <p role="alert">{records.error}</p>}
        {records.value && (
          <>
            <p>
              {records.value.total} registros · página {records.value.page + 1}
            </p>
            {records.value.items.length === 0 && (
              <p>No hay registros para estos filtros.</p>
            )}
            <div className="work-records">
              {records.value.items.map((entry) => (
                <WorkRecord
                  key={`${entry.id}-${entry.revision}`}
                  api={api}
                  entry={entry}
                  admin={isAdmin}
                  onSaved={saved}
                />
              ))}
            </div>
            <div className="work-actions">
              <button
                disabled={!filters.page}
                onClick={() =>
                  setFilters((f) => ({ ...f, page: (f.page ?? 0) - 1 }))
                }
              >
                Anterior
              </button>
              <button
                disabled={((filters.page ?? 0) + 1) * 50 >= records.value.total}
                onClick={() =>
                  setFilters((f) => ({ ...f, page: (f.page ?? 0) + 1 }))
                }
              >
                Siguiente
              </button>
            </div>
          </>
        )}
      </section>
      {isAdmin && (
        <>
          {filters.professionalId ? (
            <WorkRates
              key={filters.professionalId}
              api={api}
              id={filters.professionalId}
              onSaved={saved}
            />
          ) : (
            <p>
              Selecciona un profesional para configurar su vinculación y
              consultar sus tarifas.
            </p>
          )}
          {filters.projectId ? (
            <WorkProjectSummary
              api={api}
              id={filters.projectId}
              revision={revision}
              onSaved={saved}
            />
          ) : (
            <p>Selecciona una obra para ver sus estadísticas y previsión.</p>
          )}
        </>
      )}
      {isAdmin && (
        <section className="work-card">
          <button aria-expanded={audit} onClick={() => setAudit((a) => !a)}>
            {audit
              ? "Ocultar auditoría"
              : "Ver auditoría de jornadas, tarifas y previsiones"}
          </button>
          {audit && <WorkAudit api={api} revision={revision} />}
        </section>
      )}
    </section>
  );
}
function WorkClock({
  api,
  projects,
  preferredProjectId,
  onSaved,
}: {
  api: WorkApi;
  projects: ProjectDTO[];
  preferredProjectId?: number;
  onSaved: () => void;
}) {
  const current = useWorkQuery(() => api.current(), [api]);
  const operation = useRef(crypto.randomUUID());
  const c = current.value;
  const eligibleProjects = projects.filter((project) =>
    ["planificacion", "en_curso"].includes(project.estado),
  );
  const defaultProjectId = eligibleProjects.some(
    (project) => project.id === preferredProjectId,
  )
    ? preferredProjectId
    : eligibleProjects.length === 1
      ? eligibleProjects[0]!.id
      : undefined;
  return (
    <section className="work-card">
      <h2>Registrar trabajo</h2>
      {current.loading && <p role="status">Cargando jornada…</p>}
      {current.error && <p role="alert">{current.error}</p>}
      {c &&
        (!c.engagement ? (
          <div className="work-guidance" role="status">
            <strong>Tu acceso está activo, pero falta configurar el fichaje.</strong>
            <p>Administración debe indicar tu tipo de vinculación y tu tarifa antes de que puedas registrar trabajo.</p>
          </div>
        ) : c.open ? (
          <>
            <p>
              <strong>{c.open.projectName}</strong> · Entrada:{" "}
              {when(c.open.startedAt)} ·{" "}
              {c.open.pauses.some((p) => !p.endedAt) ? "En pausa" : "En curso"}
            </p>
            <WorkForm
              submit={
                c.open.pauses.some((p) => !p.endedAt)
                  ? "Reanudar"
                  : "Iniciar pausa"
              }
              onSubmit={async () => {
                await api.action(c.open!, {
                  action: c.open!.pauses.some((p) => !p.endedAt)
                    ? "reanudar"
                    : "pausa",
                });
                onSaved();
              }}
            >
              <span>Las pausas se descuentan del tiempo trabajado.</span>
            </WorkForm>
            <WorkForm
              submit="Registrar salida"
              onSubmit={async (d) => {
                await api.action(c.open!, {
                  action: "salida",
                  notes: val(d, "notes"),
                });
                onSaved();
              }}
            >
              <Field
                name="notes"
                label="Observaciones de la jornada"
                required={false}
              />
            </WorkForm>
          </>
        ) : eligibleProjects.length === 0 ? (
          <div className="work-guidance" role="status">
            <strong>No tienes ninguna obra disponible para registrar trabajo.</strong>
            <p>Necesitas estar asignado a una obra en planificación o en curso. Contacta con administración si crees que deberías tener acceso.</p>
          </div>
        ) : (
          <WorkForm
            submit={
              c.engagement === "empleado" ? "Registrar entrada" : "Enviar parte"
            }
            onSubmit={async (d) => {
              const input = {
                projectId: num(d, "projectId"),
                operationId: operation.current,
              };
              if (c.engagement === "empleado") await api.start(input);
              else await api.part({ ...input, ...interval(d) });
              operation.current = crypto.randomUUID();
              onSaved();
            }}
          >
            <label>
              Obra asignada
              <select name="projectId" required defaultValue={defaultProjectId ?? ""}>
                <option value="" disabled>
                  Selecciona una obra
                </option>
                {eligibleProjects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nombre}
                    </option>
                  ))}
              </select>
            </label>
            {c.engagement !== "empleado" && (
              <>
                <Field
                  name="startedAt"
                  label="Inicio (hora local)"
                  type="datetime-local"
                />
                <Field
                  name="endedAt"
                  label="Fin (hora local)"
                  type="datetime-local"
                />
                <Field
                  name="breakMinutes"
                  label="Pausas (minutos)"
                  type="number"
                  min="0"
                  step="1"
                  value={0}
                />
                {c.rateUnit !== "hora" && (
                  <Field
                    name="units"
                    label={`Cantidad (${c.unitLabel})`}
                    type="number"
                    min="0.001"
                    step="0.001"
                  />
                )}
                <Field name="notes" label="Trabajo realizado" />
              </>
            )}
          </WorkForm>
        ))}
    </section>
  );
}
function WorkRecord({
  api,
  entry: e,
  admin,
  onSaved,
}: {
  api: WorkApi;
  entry: Entry;
  admin: boolean;
  onSaved: () => void;
}) {
  const [history, setHistory] = useState(false);
  return (
    <article className="work-record">
      <h3>{e.projectName}</h3>
      <p>
        {e.professionalName} · {e.kind} · <strong>{e.status}</strong>
      </p>
      <p>
        {when(e.startedAt)} — {e.endedAt ? when(e.endedAt) : "Abierto"}
      </p>
      <p>
        {e.endedAt
          ? `${(workSeconds(e) / 3600).toFixed(2)} horas netas`
          : "Pendiente de salida"}
        {e.units !== null ? ` · ${e.units} ${e.unitLabel}` : ""}
        {admin && e.approvedCostCents != null
          ? ` · ${money(e.approvedCostCents)} aprobados`
          : ""}
      </p>
      {e.notes && <p>{e.notes}</p>}
      {e.reviewReason && <p>Motivo: {e.reviewReason}</p>}
      {admin && e.rate && (
        <p>
          Tarifa de origen: {money(e.rate.rateCents)} / {e.rate.unitLabel}
          {e.endedAt && e.status !== "aprobado"
            ? ` · Coste a revisar: ${money(workCostCents({ ...e, rate: e.rate, approvedCostCents: e.approvedCostCents ?? null }))}`
            : ""}
        </p>
      )}
      {admin && e.status === "enviado" && (
        <div className="work-review">
          <WorkForm
            submit="Aprobar registro"
            onSubmit={async () => {
              await api.action(e, { action: "aprobar" });
              onSaved();
            }}
          >
            <span>Validar horas y coste de la tarifa de origen.</span>
          </WorkForm>
          <WorkForm
            submit="Rechazar"
            onSubmit={async (d) => {
              await api.action(e, {
                action: "rechazar",
                reason: val(d, "reason"),
              });
              onSaved();
            }}
          >
            <Field name="reason" label="Motivo del rechazo" />
          </WorkForm>
        </div>
      )}
      {admin && (
        <details>
          <summary>Corregir registro</summary>
          <p>
            La corrección queda auditada y exige nueva aprobación. Conserva la
            tarifa de origen.
          </p>
          <WorkForm
            submit="Guardar corrección"
            onSubmit={async (d) => {
              await api.action(e, {
                action: "corregir",
                ...interval(d, e),
                reason: val(d, "reason"),
              });
              onSaved();
            }}
          >
            <Field
              name="startedAt"
              label="Inicio"
              type="datetime-local"
              step="0.001"
              value={localDate(e.startedAt)}
            />
            <Field
              name="endedAt"
              label="Fin"
              type="datetime-local"
              step="0.001"
              value={e.endedAt ? localDate(e.endedAt) : ""}
            />
            <Field
              name="breakSeconds"
              label="Total de pausas (segundos)"
              type="number"
              min="0"
              step="0.001"
              value={
                Math.round(
                  (e.breakSeconds +
                    e.pauses.reduce(
                      (s, p) =>
                        s +
                        (p.endedAt
                          ? (Date.parse(p.endedAt) - Date.parse(p.startedAt)) /
                            1000
                          : 0),
                      0,
                    )) *
                    1000,
                ) / 1000
              }
            />
            {e.rate?.rateUnit !== "hora" && (
              <Field
                name="units"
                label={`Cantidad (${e.unitLabel})`}
                type="number"
                min="0.001"
                step="0.001"
                value={e.units ?? 1}
              />
            )}
            <Field
              name="notes"
              label="Observaciones"
              value={e.notes}
              required={false}
            />
            <Field name="reason" label="Motivo obligatorio" />
          </WorkForm>
        </details>
      )}
      <button aria-expanded={history} onClick={() => setHistory((h) => !h)}>
        {history ? "Ocultar historial" : "Ver historial"}
      </button>
      {history && <WorkHistory api={api} id={e.id} />}
    </article>
  );
}
function WorkHistory({ api, id }: { api: WorkApi; id: string }) {
  const q = useWorkQuery(() => api.history(id), [api, id]);
  return (
    <div>
      {q.loading && <p role="status">Cargando historial…</p>}
      {q.error && <p role="alert">{q.error}</p>}
      <ol>
        {q.value?.map((e) => (
          <li key={e.id}>
            {when(e.at)} · {e.action} · Usuario {e.actorId}
            {e.reason ? ` · ${e.reason}` : ""}
            <details>
              <summary>Detalle del cambio</summary>
              <pre>
                {JSON.stringify({ antes: e.before, despues: e.after }, null, 2)}
              </pre>
            </details>
          </li>
        ))}
      </ol>
    </div>
  );
}
function WorkAudit({ api, revision }: { api: WorkApi; revision: number }) {
  const [page, setPage] = useState(0);
  const q = useWorkQuery(() => api.audit(page), [api, page, revision]);
  return (
    <div>
      <h2>Auditoría interna</h2>
      {q.error && <p role="alert">{q.error}</p>}
      {q.loading && <p role="status">Cargando…</p>}
      {q.value && (
        <>
          <ol>
            {q.value.items.map((e) => (
              <li key={e.id}>
                {when(e.at)} · {e.action} · Usuario {e.actorId} · {e.reason}
                <details>
                  <summary>Antes y después</summary>
                  <pre>
                    {JSON.stringify(
                      { antes: e.before, despues: e.after },
                      null,
                      2,
                    )}
                  </pre>
                </details>
              </li>
            ))}
          </ol>
          <div className="work-actions">
            <button disabled={!page} onClick={() => setPage((p) => p - 1)}>
              Anteriores
            </button>
            <button
              disabled={(page + 1) * 50 >= q.value.total}
              onClick={() => setPage((p) => p + 1)}
            >
              Más antiguos
            </button>
          </div>
        </>
      )}
    </div>
  );
}
