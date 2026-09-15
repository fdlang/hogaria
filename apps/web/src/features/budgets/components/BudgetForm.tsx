/**
 * BudgetForm — complete create/edit form.
 *
 * Uses the preexisting state-machine hook (useBudgetForm) + useMutation
 * for the submission. Split into 3 tabs (datos / partidas / condiciones)
 * with a sticky sidebar showing live totals.
 */

import { useEffect, useState } from "react";
import { Button, Input, Textarea, Select } from "@/shared/ui";
import { useBudgetForm, useBudgetMutations, PartidaFormState } from "../hooks/useBudgets";
import { BudgetsApi, BudgetDTO } from "../api/budgets.api";
import { ProjectDTO } from "@/features/projects/api/projects.api";
import { UserDTO } from "@/features/users/api/users.api";
import { CATALOG, CatalogItem, findCatalogItem } from "@/features/catalog/catalog";
import { CatalogPicker } from "@/features/catalog/CatalogPicker";
import { BudgetLineEditor } from "./BudgetLineEditor";
import { useNotifications } from "@/shared/ui/notifications";
import { formatMoney } from "@/shared/lib/formatters";
import { IVA_DEFAULT_PERCENT } from "@reformapro/domain";

interface Props {
  api: BudgetsApi;
  initialBudget?: BudgetDTO | null;
  projects: ReadonlyArray<ProjectDTO>;
  clients:  ReadonlyArray<UserDTO>;
  onSaved:  (budget: BudgetDTO) => void;
  onCancel: () => void;
}

type Tab = "general" | "partidas" | "condiciones";

export function BudgetForm({ api, initialBudget, projects, clients, onSaved, onCancel }: Props) {
  const form = useBudgetForm();
  const mutations = useBudgetMutations(api);
  const { push } = useNotifications();
  const [tab, setTab] = useState<Tab>("general");
  const [showCatalog, setShowCatalog] = useState(false);

  // Load initial budget into the form's state machine when editing
  useEffect(() => {
    if (initialBudget) form.load(initialBudget);
    else form.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialBudget]);

  // Auto-fill clienteId when project is picked (convenience)
  const handleProjectChange = (idStr: string) => {
    const proyectoId = parseInt(idStr, 10);
    form.setField("proyectoId", Number.isFinite(proyectoId) ? proyectoId : null);
    const p = projects.find(x => x.id === proyectoId);
    if (p) form.setField("clienteId", p.clienteId);
  };

  // Catalog integrations
  const addFromCatalog = (ref: string) => {
    const item = findCatalogItem(ref);
    if (!item) return;
    form.addPartida({
      categoria: guessCategoryByRef(ref),
      descripcion: item.descripcion,
      cantidad: 1, unidad: item.unidad,
      precioUnit: item.precio,
      descuento: 0,
      iva: item.iva,
      ref: item.ref,
    });
  };

  const importCategory = (categoria: string, items: CatalogItem[]) => {
    items.forEach(item => form.addPartida({
      categoria,
      descripcion: item.descripcion,
      cantidad: 1, unidad: item.unidad,
      precioUnit: item.precio,
      descuento: 0,
      iva: item.iva,
      ref: item.ref,
    }));
  };

  // Duplicate — not in the hook's public API; do it via two dispatches
  const duplicatePartida = (id: string) => {
    const src = form.state.partidas.find(p => p.id === id);
    if (src) form.addPartida({ ...src, id: undefined as unknown as string });
  };

  const handleSubmit = async () => {
    if (!form.validate()) return;
    try {
      const payload = form.toPayload();
      const saved = initialBudget
        ? await mutations.update.mutate(initialBudget.id, payload)
        : await mutations.create.mutate(payload);
      push(initialBudget ? "Presupuesto actualizado" : "Presupuesto creado", "success");
      onSaved(saved);
    } catch (e) {
      push((e as { message?: string }).message ?? "Error", "error");
    }
  };

  const submitting = mutations.create.loading || mutations.update.loading;

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 280px", gap: 24, alignItems: "flex-start" }}>
      {/* ─── MAIN COLUMN ──────────────────────────────── */}
      <div>
        <nav role="tablist" style={{ display: "flex", gap: 4, borderBottom: "1px solid #d8c4ad", marginBottom: 20 }}>
          {(["general", "partidas", "condiciones"] as Tab[]).map(t => (
            <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)}
              style={{
                padding: "10px 16px", fontSize: 12, fontWeight: 600,
                color: tab === t ? "#c17248" : "#71685e",
                background: "none", border: "none",
                borderBottom: `2px solid ${tab === t ? "#c17248" : "transparent"}`,
                cursor: "pointer", textTransform: "uppercase", letterSpacing: ".05em",
              }}>
              {t === "general" ? "Datos generales"
                : t === "partidas" ? `Partidas (${form.state.partidas.length})`
                : "Condiciones"}
            </button>
          ))}
        </nav>

        {tab === "general" && (
          <>
            <Input label="Nombre del presupuesto" required
              value={form.state.nombre} error={form.state.errors.nombre}
              onChange={e => form.setField("nombre", e.target.value)} />

            <Input label="Referencia" placeholder="P-2025-001"
              value={form.state.referencia}
              onChange={e => form.setField("referencia", e.target.value)} />

            <Select label="Proyecto"
              value={form.state.proyectoId ?? ""}
              onChange={e => handleProjectChange(e.target.value)}>
              <option value="">— Selecciona proyecto —</option>
              {projects.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
            </Select>
            {form.state.errors.proyectoId && <p role="alert" style={{ fontSize: 11, color: "#f87171", marginTop: -10, marginBottom: 10 }}>{form.state.errors.proyectoId}</p>}

            <Select label="Cliente"
              value={form.state.clienteId ?? ""}
              onChange={e => form.setField("clienteId", parseInt(e.target.value, 10))}>
              <option value="">— Selecciona cliente —</option>
              {clients.map(c => <option key={c.id} value={c.id}>{c.nombre} ({c.email})</option>)}
            </Select>
            {form.state.errors.clienteId && <p role="alert" style={{ fontSize: 11, color: "#f87171", marginTop: -10, marginBottom: 10 }}>{form.state.errors.clienteId}</p>}

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <Select label="IVA por defecto"
                value={form.state.ivaDefault}
                onChange={e => form.setField("ivaDefault", parseFloat(e.target.value))}>
                <option value="0">0% — exento</option>
                <option value="4">4% — superreducido</option>
                <option value="10">10% — reducido</option>
                <option value={IVA_DEFAULT_PERCENT}>21% — general</option>
              </Select>
              <Input label="Validez (días)" type="number" min="1" max="365"
                value={form.state.validezDias} error={form.state.errors.validezDias}
                onChange={e => form.setField("validezDias", parseInt(e.target.value, 10) || 0)} />
            </div>
          </>
        )}

        {tab === "partidas" && (
          <>
            <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
              <Button onClick={() => form.addPartida()}>+ Partida vacía</Button>
              <Button variant="ghost" onClick={() => setShowCatalog(s => !s)}>
                {showCatalog ? "✕ Ocultar catálogo" : "📚 Desde catálogo"}
              </Button>
            </div>

            {showCatalog && (
              <div style={{ padding: 14, border: "1px dashed #d8c4ad", borderRadius: 10, marginBottom: 20 }}>
                <CatalogPicker onPickItem={addFromCatalog} onImportCategory={importCategory} />
              </div>
            )}

            {form.state.errors.partidas && (
              <p role="alert" style={{ color: "#f87171", fontSize: 13, marginBottom: 12 }}>{form.state.errors.partidas}</p>
            )}

            {form.state.partidas.length === 0 ? (
              <p style={{ color: "#71685e", fontSize: 13, textAlign: "center", padding: 30, border: "1px dashed #d8c4ad", borderRadius: 10 }}>
                Añade partidas desde el catálogo o manualmente.
              </p>
            ) : form.state.partidas.map((p, i) => (
              <BudgetLineEditor key={p.id}
                partida={p} globalIva={form.state.ivaDefault} index={i} errors={form.state.errors}
                onChange={form.updatePartida}
                onRemove={form.removePartida}
                onDuplicate={duplicatePartida} />
            ))}
          </>
        )}

        {tab === "condiciones" && (
          <>
            <Textarea label="Condiciones de pago"
              value={form.state.condicionesPago}
              onChange={e => form.setField("condicionesPago", e.target.value)} />
            <Textarea label="Garantía"
              value={form.state.garantia}
              onChange={e => form.setField("garantia", e.target.value)} />
            <Textarea label="Notas adicionales" rows={6}
              value={form.state.notas}
              onChange={e => form.setField("notas", e.target.value)} />
          </>
        )}

        <footer style={{ display: "flex", justifyContent: "space-between", marginTop: 24, paddingTop: 16, borderTop: "1px solid #d8c4ad" }}>
          <Button variant="ghost" onClick={onCancel} disabled={submitting}>Cancelar</Button>
          <Button onClick={handleSubmit} loading={submitting}>
            {initialBudget ? "Guardar cambios" : "Crear presupuesto"}
          </Button>
        </footer>
      </div>

      {/* ─── SIDEBAR: LIVE TOTALS ──────────────────────── */}
      <aside style={{ position: "sticky", top: 20, background: "#f8efe4", border: "1px solid #d8c4ad", borderRadius: 10, padding: 18 }}>
        <h4 style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".07em", color: "#71685e", marginBottom: 12 }}>
          Resumen en vivo
        </h4>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, fontSize: 13 }}>
          <Row label="Subtotal" value={formatMoney(form.totals.subtotal.amount)} />
          {form.totals.tramos.size > 1 ? (
            [...form.totals.tramos.entries()].sort((a, b) => a[0] - b[0]).map(([rate, { iva }]) => (
              <Row key={rate} label={`IVA ${rate}%`} value={formatMoney(iva.amount)} small />
            ))
          ) : (
            <Row label={`IVA ${form.state.ivaDefault}%`} value={formatMoney(form.totals.iva.amount)} />
          )}
          <hr style={{ border: 0, borderTop: "1px solid #d8c4ad", margin: "6px 0" }} />
          <Row label="TOTAL" value={formatMoney(form.totals.total.amount)} bold />
        </div>

        <p style={{ fontSize: 10, color: "#85786b", marginTop: 12, textAlign: "center" }}>
          {form.state.partidas.length} partidas · {form.state.validezDias} días validez
        </p>
      </aside>
    </div>
  );
}

function Row({ label, value, bold, small }: { label: string; value: string; bold?: boolean; small?: boolean }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", fontSize: small ? 11 : 13 }}>
      <span style={{ color: small ? "#71685e" : "#71685e" }}>{label}</span>
      <strong style={{ color: bold ? "#c17248" : "#302d29", fontWeight: bold ? 700 : 600, fontSize: bold ? 16 : undefined }}>{value}</strong>
    </div>
  );
}

// Best-effort category inference from REF prefix — kept local to the form,
// not in the domain (it's UI convenience, not a business rule).
function guessCategoryByRef(ref: string): string {
  const prefix = ref.split("-")[0] ?? "";
  return ({
    DEM: "Demolición", ELE: "Electricidad", FON: "Fontanería",
    ALB: "Albañilería", PIN: "Pintura", CAR: "Carpintería",
  } as Record<string, string>)[prefix] ?? "Otros";
}
