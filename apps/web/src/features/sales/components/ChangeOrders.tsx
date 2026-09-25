import { useEffect, useState } from "react";
import { Button } from "@/shared/ui";
import type { ProjectsApi } from "@/features/projects/api/projects.api";
import type { ChangeOrderDTO } from "../api/sales.api";
import { formatMoney } from "@/shared/lib/formatters";
import { CURRENT_FISCAL_POLICY } from "@reformapro/domain";

export function ChangeOrders({ api, projectId, admin, onChanged }: { api: ProjectsApi; projectId: number; admin: boolean; onChanged: () => Promise<unknown> }) {
  const [items, setItems] = useState<ChangeOrderDTO[]>([]);
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [conditions, setConditions] = useState("");
  const [vat, setVat] = useState(CURRENT_FISCAL_POLICY.defaultVatRate);
  const [editing, setEditing] = useState<ChangeOrderDTO | null>(null);
  const [password, setPassword] = useState("");
  const [selected, setSelected] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const reload = async () => setItems(await api.changes(projectId));
  useEffect(() => { void reload().catch(() => setError("No se pudieron cargar las órdenes de cambio")); }, [api, projectId]);
  const run = async (action: () => Promise<unknown>) => {
    if (busy) return; setBusy(true); setError("");
    try { await action(); setPassword(""); setSelected(null); await reload(); await onChanged(); }
    catch (cause) { setError((cause as Error).message || "No se pudo completar la acción"); }
    finally { setBusy(false); }
  };
  return <section className={`sales-card project-change-orders${admin ? " project-change-orders--admin" : " project-change-orders--client"}`} aria-label="Órdenes de cambio">
    <header className="project-change-orders__header"><div><p className="eyebrow">Control de alcance</p><h2>Órdenes de cambio</h2><p>Las ampliaciones no modifican el presupuesto firmado. Solo se suman al importe de la obra tras la aprobación del cliente.</p></div>
    <Button small variant="ghost" disabled={busy} onClick={() => void run(reload)}>Actualizar órdenes</Button>
    </header>
    {error && <p className="project-change-orders__alert" role="alert">{error}</p>}
    {admin && <form className="project-change-orders__form" onSubmit={event => { event.preventDefault(); void run(async () => {
      const draft = { titulo: description.trim(), validezDias: 30, condicionesPago: conditions, garantia: "", notasCliente: "", notasInternas: "", partidas: [{ id: crypto.randomUUID(), categoria: "Ampliación", descripcion: description.trim(), cantidad: 1, unidad: "global", precioVentaUnitario: Number(price), costeUnitario: null, descuento: 0, iva: vat }] };
      if (editing) await api.editChange(projectId, editing.id, draft); else await api.createChange(projectId, draft);
      setDescription(""); setPrice(""); setConditions(""); setEditing(null);
    }); }}>
      <label>Alcance de la ampliación<textarea required value={description} onChange={event => setDescription(event.target.value)} /></label>
      <label>Importe sin IVA (€)<input type="number" required min="0.01" step="0.01" value={price} onChange={event => setPrice(event.target.value)} /></label>
      <label>IVA (%)<select value={vat} onChange={event => setVat(Number(event.target.value))}>{CURRENT_FISCAL_POLICY.selectableVatRates.map(value => <option key={value} value={value}>{value} %</option>)}</select></label>
      <label>Condiciones de pago<textarea required value={conditions} onChange={event => setConditions(event.target.value)} /></label>
      <Button type="submit" loading={busy}>{editing ? "Guardar cambios del borrador" : "Guardar ampliación como borrador"}</Button>
      {editing && <Button type="button" variant="ghost" disabled={busy} onClick={() => { setEditing(null); setDescription(""); setPrice(""); setConditions(""); }}>Cancelar edición</Button>}
    </form>}
    {items.length === 0 && <p>No hay órdenes de cambio publicadas.</p>}
    {items.map(item => {
      const proposal = item.propuesta ?? item.payload;
      const total = proposal?.partidas.reduce((sum,line) => sum + line.cantidad*line.precioVentaUnitario*(1-line.descuento/100)*(1+line.iva/100),0) ?? 0;
      return <article className="project-change-order" key={item.id}>
        <p className="project-change-order__reference">{item.numero} · {item.estado}</p><h3>{proposal?.titulo}</h3>
        {proposal?.partidas.map(line => <p key={line.id}>{line.descripcion} · {formatMoney(line.cantidad * line.precioVentaUnitario * (1-line.descuento/100))} sin IVA · IVA {line.iva}%</p>)}
        <p>{proposal?.condicionesPago}</p>
        <p><strong>Total de la ampliación con IVA: {formatMoney(total)}</strong></p>
        {admin && item.estado === "borrador" && <div className="project-change-order__actions">
          {item.payload?.partidas.length === 1 && <Button variant="ghost" disabled={busy} onClick={() => {
            const payload = item.payload!; const line = payload.partidas[0]!;
            setEditing(item); setDescription(payload.titulo); setPrice(String(line.cantidad*line.precioVentaUnitario*(1-line.descuento/100))); setConditions(payload.condicionesPago); setVat(line.iva);
          }}>Editar borrador</Button>}
          <Button disabled={busy || editing?.id === item.id} onClick={() => void run(() => api.decideChange(projectId, item.id, "enviado"))}>Publicar para aprobación</Button>
        </div>}
        {!admin && item.estado === "enviado" && <div className="project-change-order__actions">
          <Button small variant="ghost" disabled={busy} onClick={() => { setSelected(item.id); setPassword(""); }}>Revisar decisión</Button>
          {selected === item.id && <div className="project-change-order__decision"><label>Confirma tu contraseña<input type="password" autoComplete="current-password" value={password} onChange={event => setPassword(event.target.value)} /></label>
            <p>Al aprobar aceptas el alcance y el importe indicado, que se añadirá a tu obra.</p>
            <Button disabled={busy || !password} onClick={() => void run(() => api.decideChange(projectId, item.id, "aprobado", password))}>Aceptar ampliación</Button>
            <Button variant="ghost" disabled={busy || !password} onClick={() => void run(() => api.decideChange(projectId, item.id, "rechazado", password))}>Rechazar</Button>
          </div>}
        </div>}
      </article>;
    })}
  </section>;
}
