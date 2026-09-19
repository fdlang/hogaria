import { useState } from "react";
import type { WorkApi } from "./work.api";
import {
  Field,
  WorkForm,
  useWorkQuery,
  money,
  when,
  val,
  num,
} from "./work-ui";
export function WorkRates({
  api,
  id,
  onSaved,
}: {
  api: WorkApi;
  id: number;
  onSaved: () => void;
}) {
  const [revision, setRevision] = useState(0);
  const [engagement, setEngagement] = useState("empleado");
  const [unit, setUnit] = useState("hora");
  const rates = useWorkQuery(() => api.rates(id), [api, id, revision]);
  return (
    <section className="work-card">
      <h2>Vinculación y tarifas internas</h2>
      <p>
        Define el coste para la empresa, no el precio de venta. Cada cambio
        conserva el histórico y no recalcula registros anteriores.
      </p>
      {rates.loading ? (
        <p role="status">Cargando tarifas…</p>
      ) : rates.error ? (
        <p role="alert">{rates.error}</p>
      ) : (
        <>
          <WorkForm
            onSubmit={async (data) => {
              await api.configure(id, {
                engagement,
                rateUnit: unit,
                rateCents: Math.round(num(data, "rate") * 100),
                unitLabel: val(data, "unitLabel"),
                reason: val(data, "reason"),
                ...(val(data, "effectiveAt")
                  ? {
                      effectiveAt: new Date(
                        val(data, "effectiveAt"),
                      ).toISOString(),
                    }
                  : {}),
              });
              setRevision((x) => x + 1);
              onSaved();
            }}
            submit="Registrar tarifa"
          >
            <label>
              Vinculación
              <select
                value={engagement}
                onChange={(e) => {
                  setEngagement(e.target.value);
                  setUnit("hora");
                }}
              >
                <option value="empleado">Empleado</option>
                <option value="autonomo">Autónomo</option>
                <option value="subcontrata">Subcontrata</option>
              </select>
            </label>
            <label>
              Unidad de coste
              <select value={unit} onChange={(e) => setUnit(e.target.value)}>
                <option value="hora">Hora</option>
                {engagement !== "empleado" && (
                  <>
                    <option value="jornada">Jornada</option>
                    <option value="unidad">Unidad producida</option>
                  </>
                )}
              </select>
            </label>
            <Field
              name="rate"
              label="Coste (€ por unidad)"
              type="number"
              min="0"
              step="0.01"
            />
            {unit === "unidad" && (
              <Field
                name="unitLabel"
                label="Unidad (por ejemplo: metro cuadrado)"
              />
            )}
            <Field
              name="effectiveAt"
              label="Vigente desde (vacío: ahora)"
              type="datetime-local"
              required={false}
            />
            <Field name="reason" label="Motivo del alta o cambio" />
          </WorkForm>
          <ul>
            {rates.value?.map((r) => (
              <li key={r.id}>
                {when(r.effectiveAt)} · {r.engagement} · {money(r.rateCents)} /{" "}
                {r.unitLabel}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
export function WorkProjectSummary({
  api,
  id,
  revision,
  onSaved,
}: {
  api: WorkApi;
  id: number;
  revision: number;
  onSaved: () => void;
}) {
  const query = useWorkQuery(() => api.summary(id), [api, id, revision]);
  const s = query.value;
  return (
    <section className="work-card">
      <h2>Coste de mano de obra</h2>
      {query.error && <p role="alert">{query.error}</p>}
      {query.loading && <p role="status">Calculando…</p>}
      {s && (
        <>
          <p>
            <strong>
              {s.approvedHours.toFixed(2)} horas · {money(s.approvedCostCents)}
            </strong>{" "}
            aprobadas. {s.pending} pendientes · {s.open} abiertas.
          </p>
          <p>
            Acumulado completo de la obra, independiente del filtro de fechas de
            los registros. No incluye materiales, gastos generales ni margen del
            proyecto. Los partes pendientes no se suman al coste aprobado. Las
            horas por sí solas no miden productividad ni calidad.
          </p>
          {s.budget && (
            <p>
              Previsión: {s.budget.plannedHours} horas ·{" "}
              {money(s.budget.plannedCostCents)}. Desviación real − prevista:{" "}
              {s.hoursDeviation?.toFixed(2)} h ·{" "}
              {money(s.costDeviationCents ?? 0)}.
            </p>
          )}
          <ul>
            {s.byProfessional.map((p) => (
              <li key={p.professionalId}>
                {p.name} · {p.profession} · {p.hours.toFixed(2)} h ·{" "}
                {money(p.costCents)}
              </li>
            ))}
          </ul>
          <details>
            <summary>Editar previsión de mano de obra</summary>
            <WorkForm
              onSubmit={async (d) => {
                await api.budget(id, {
                  plannedHours: num(d, "hours"),
                  plannedCostCents: Math.round(num(d, "cost") * 100),
                  reason: val(d, "reason"),
                });
                onSaved();
              }}
            >
              <Field
                name="hours"
                label="Horas previstas"
                type="number"
                min="0"
                step="0.01"
                value={s.budget?.plannedHours}
              />
              <Field
                name="cost"
                label="Coste previsto (€)"
                type="number"
                min="0"
                step="0.01"
                value={(s.budget?.plannedCostCents ?? 0) / 100}
              />
              <Field name="reason" label="Motivo del cambio" />
            </WorkForm>
          </details>
        </>
      )}
    </section>
  );
}
