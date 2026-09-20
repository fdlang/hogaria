import { useEffect, useMemo, useRef, useState } from "react";
import { Button, Modal } from "@/shared/ui";
import { EstimateDocuments, EstimateSearch } from "./EstimateContent";
import { filterEstimates } from "../estimate-search";
import { EstimateHistory } from "./EstimateHistory";
import { formatDate, formatMoney } from "@/shared/lib/formatters";
import { CatalogPicker } from "@/features/catalog/CatalogPicker";
import {
  type CatalogCategory,
  type CatalogItem,
} from "@/features/catalog/catalog";
import type { UsersApi } from "@/features/users/api/users.api";
import {
  SalesApi,
  type EstimateDraftDTO,
  type EstimateDTO,
  type OpportunityDTO,
} from "../api/sales.api";

import { useCatalog } from "@/features/catalog/useCatalog";
import { CatalogLoadState } from "@/features/catalog/CatalogLoadState";
import { blankOpportunity, opportunityForSelection } from "../sales-pipeline.utils";

const steps = ["Oportunidad", "Alcance", "Partidas", "Revisión"];

const newLine = () => ({
  id: crypto.randomUUID(),
  categoria: "General",
  descripcion: "",
  cantidad: 1,
  unidad: "ud",
  precioVentaUnitario: 0,
  costeUnitario: null,
  descuento: 0,
  iva: 21,
});

const blankDraft = (): EstimateDraftDTO => ({
  titulo: "",
  validezDias: 30,
  condicionesPago:
    "50 % a la aceptación del presupuesto, destinado a la planificación e inicio de los trabajos, y 50 % a la finalización de la obra, una vez comprobada la correcta ejecución.",
  garantia: "",
  notasCliente: "",
  notasInternas: "",
  partidas: [],
});

const statusLabel = (status: string) =>
  ({
    borrador: "Borrador",
    en_revision: "En revisión",
    enviado: "Enviado",
    firmado: "Firmado",
    aceptado: "Convertido en proyecto",
    rechazado: "Cambios solicitados",
    caducado: "Caducado",
  })[status] ?? status;

export function SalesPipeline({
  api,
  users,
}: {
  api: SalesApi;
  users: UsersApi;
}) {
  const [opportunities, setOpportunities] = useState<OpportunityDTO[]>([]);
  const [estimates, setEstimates] = useState<EstimateDTO[]>([]);
  const [clients, setClients] = useState<Array<{ id: number; nombre: string }>>(
    [],
  );
  const { items: catalogItems, loading: catalogLoading, error: catalogError, reload: reloadCatalog } = useCatalog(api);
  const catalog = useMemo<CatalogCategory[]>(() => {
    const grouped = new Map<string, CatalogItem[]>();
    catalogItems.filter(item => item.active).forEach(item => {
      const entries = grouped.get(item.category) ?? [];
      entries.push({ ref: item.reference, descripcion: item.description, unidad: item.unit, precio: item.salePrice, iva: item.vatRate });
      grouped.set(item.category, entries);
    });
    return [...grouped].map(([categoria, items]) => ({ categoria, items }));
  }, [catalogItems]);
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [openingId, setOpeningId] = useState<number | null>(null);
  const [converting, setConverting] = useState<number | null>(null);
  const [sending, setSending] = useState<number | null>(null);
  const [showCatalog, setShowCatalog] = useState(false);
  const [error, setError] = useState("");
  const [preview, setPreview] = useState<EstimateDTO | null>(null);
  const [showEditor, setShowEditor] = useState(() => Boolean(new URLSearchParams(window.location.hash.split("?")[1] ?? window.location.search).get("opportunity")));
  const [opportunity, setOpportunity] = useState(blankOpportunity);
  const [selected, setSelected] = useState<number | null>(null);
  const [draft, setDraft] = useState(blankDraft);
  const [existingOpportunity, setExistingOpportunity] = useState(() => new URLSearchParams(window.location.hash.split("?")[1] ?? window.location.search).get("opportunity") ?? "");
  useEffect(() => {
    setOpportunity(opportunityForSelection(existingOpportunity, opportunities));
  }, [existingOpportunity, opportunities]);
  const [editingId, setEditingId] = useState<number | null>(null);
  const editorRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (showEditor) editorRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [showEditor, editingId]);

  const editEstimate = async (estimate: EstimateDTO) => {
    if (saving || openingId !== null) return;
    if ((editingId !== null || draft.partidas.length > 0) && !window.confirm("Se descartarán los cambios sin guardar. ¿Continuar?")) return;
    setOpeningId(estimate.id);
    setError("");
    try {
      const existing = ["borrador", "en_revision"].includes(estimate.estado)
        ? await api.draft(estimate.id)
        : await api.reviseEstimate(estimate.id);
      setEditingId(existing.id);
      setSelected(existing.oportunidadId);
      setDraft(existing.borrador);
      setStep(1);
      setShowEditor(true);
      void refresh().catch(() => setError("El borrador está abierto, pero no se pudieron actualizar los listados."));
    } catch (cause) { setError((cause as Error).message || "No se pudo recuperar el presupuesto"); }
    finally { setOpeningId(null); }
  };

  const refresh = () =>
    Promise.all([
      api.opportunities(),
      api.estimates(),
      users.list("cliente"),
    ]).then(([opportunityItems, estimateItems, clientItems]) => {
      setOpportunities(opportunityItems);
      setEstimates(estimateItems);
      setClients(
        clientItems.map((client) => ({ id: client.id, nombre: client.nombre })),
      );
    });

  useEffect(() => {
    void refresh().catch(() =>
      setError("No se pudieron cargar los presupuestos. Inténtalo de nuevo."),
    );
  }, []);


  const active = useMemo(
    () => opportunities.find((item) => item.id === selected) ?? null,
    [opportunities, selected],
  );
  const opportunityComplete = Boolean(
    opportunity.clienteId &&
    opportunity.nombre.trim() &&
    opportunity.direccion.trim() &&
    opportunity.tipo.trim(),
  );
  const scopeComplete = Boolean(
    active &&
    draft.titulo.trim() &&
    Number.isInteger(draft.validezDias) &&
    draft.validezDias >= 1 &&
    draft.validezDias <= 365 &&
    draft.condicionesPago.trim(),
  );
  const linesComplete =
    draft.partidas.length > 0 &&
    draft.partidas.every(
      (line) =>
        line.descripcion.trim() &&
        Number.isFinite(line.cantidad) &&
        line.cantidad > 0 &&
        Number.isFinite(line.precioVentaUnitario) &&
        line.precioVentaUnitario >= 0 &&
        Number.isFinite(line.iva) &&
        line.iva >= 0,
    );
  const totals = useMemo(
    () =>
      draft.partidas.reduce(
        (result, line) => {
          const sale =
            line.cantidad *
            line.precioVentaUnitario *
            (1 - line.descuento / 100);
          const cost =
            line.costeUnitario == null
              ? null
              : line.cantidad * line.costeUnitario;
          return {
            sale: result.sale + sale,
            cost:
              cost == null || result.cost == null ? null : result.cost + cost,
          };
        },
        { sale: 0, cost: 0 as number | null },
      ),
    [draft.partidas],
  );

  const submitOpportunity = async () => {
    if (!opportunityComplete) return;
    setError("");
    try {
      setSaving(true);
      const input = {
        clienteId: Number(opportunity.clienteId),
        nombre: opportunity.nombre.trim(),
        email: null,
        telefono: null,
        direccion: opportunity.direccion.trim(),
        tipo: opportunity.tipo.trim(),
        descripcion: opportunity.descripcion.trim(),
        estado: "nueva",
        fechaVisita: null,
        notasInternas: "",
      };
      const saved = existingOpportunity ? await api.updateOpportunity(Number(existingOpportunity), { clienteId: input.clienteId, nombre: input.nombre, direccion: input.direccion, tipo: input.tipo, descripcion: input.descripcion }) : await api.createOpportunity(input);
      setSelected(saved.id);
      setStep(1);
      await refresh();
    } catch (cause) {
      setError(
        (cause as { message?: string }).message ??
          "No se pudo guardar la oportunidad",
      );
    } finally {
      setSaving(false);
    }
  };

  const submitEstimate = async () => {
    if (!selected || !scopeComplete || !linesComplete) return;
    setError("");
    try {
      setSaving(true);
      const saved = editingId !== null
        ? await api.updateEstimate(editingId, draft)
        : await api.createEstimate(selected, draft);
      setEditingId(null);
      setStep(0);
      setSelected(null);
      setDraft(blankDraft());
      setShowEditor(false);
      await refresh();
      setPreview(saved);
    } catch (cause) {
      setError(
        (cause as { message?: string }).message ??
          "No se pudo crear la propuesta",
      );
    } finally {
      setSaving(false);
    }
  };

  const send = async (estimate: EstimateDTO) => {
    if (editingId === estimate.id) { setError("Guarda o cierra la edición antes de publicar el presupuesto."); return; }
    try {
      setSending(estimate.id);
      setError("");
      await api.sendEstimate(estimate.id);
      await refresh();
    } catch (cause) {
      setError(
        (cause as { message?: string }).message ??
          "No se pudo enviar la propuesta",
      );
    } finally {
      setSending(null);
    }
  };

  const convert = async (estimate: EstimateDTO) => {
    try {
      setConverting(estimate.id);
      const project = await api.convertToProject(estimate.id);
      await refresh();
      window.location.hash = `#/admin/projects/${project.id}`;
    } catch (cause) {
      setError(
        (cause as { message?: string }).message ??
          "No se pudo crear el proyecto",
      );
    } finally {
      setConverting(null);
    }
  };

  const updateLine = (
    index: number,
    changes: Partial<EstimateDraftDTO["partidas"][number]>,
  ) => {
    setDraft((current) => ({
      ...current,
      partidas: current.partidas.map((line, itemIndex) =>
        itemIndex === index ? { ...line, ...changes } : line,
      ),
    }));
  };
  const removeLine = (index: number) =>
    setDraft((current) => ({
      ...current,
      partidas: current.partidas.filter((_, itemIndex) => itemIndex !== index),
    }));
  const addCatalogItem = (ref: string) => {
    const entry = catalog
      .flatMap((category) =>
        category.items.map((item) => ({ item, category: category.categoria })),
      )
      .find((candidate) => candidate.item.ref === ref);
    if (!entry) return;
    setDraft((current) => ({
      ...current,
      partidas: [
        ...current.partidas,
        lineFromCatalog(entry.item, entry.category),
      ],
    }));
  };
  const importCatalogCategory = (category: string, items: CatalogItem[]) => {
    setDraft((current) => ({
      ...current,
      partidas: [
        ...current.partidas,
        ...items.map((item) => lineFromCatalog(item, category)),
      ],
    }));
  };
  const openNewEstimate = () => {
    setEditingId(null);
    setSelected(null);
    setExistingOpportunity("");
    setOpportunity(blankOpportunity());
    setDraft(blankDraft());
    setStep(0);
    setError("");
    setShowEditor(true);
  };
  const closeEditor = () => {
    const hasChanges = editingId !== null || selected !== null || draft.partidas.length > 0 || draft.titulo.trim() !== "";
    if (hasChanges && !window.confirm("¿Cerrar el editor? Los cambios sin guardar se perderán.")) return;
    setEditingId(null);
    setSelected(null);
    setExistingOpportunity("");
    setOpportunity(blankOpportunity());
    setDraft(blankDraft());
    setStep(0);
    setError("");
    setShowEditor(false);
  };

  return (
    <section className="private-page sales-pipeline">
      <header className="sales-page-header">
        <div>
          <p className="eyebrow">Ventas y propuestas</p>
          <h1>De oportunidad a obra</h1>
          <p>
            Una propuesta se crea antes del proyecto y conserva cada versión
            enviada.
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Button small onClick={openNewEstimate}>Nuevo presupuesto</Button>
          <Button
            small
            variant="ghost"
            onClick={() => {
              setError("");
              void refresh().catch(() =>
                setError("No se pudieron actualizar los presupuestos."),
              );
            }}
          >
            Actualizar
          </Button>
        </div>
      </header>

      {error && (
        <p role="alert" className="sales-error">
          {error}
        </p>
      )}

      <RecentEstimates
        api={api}
        estimates={estimates}
        sending={sending}
        converting={converting}
        openingId={openingId}
        onPreview={setPreview}
        onSend={send}
        onConvert={convert}
        onEdit={editEstimate}
        editing={saving}
      />

      {showEditor && <section className="sales-editor" aria-label="Editor de presupuesto">
      <div className="sales-steps" ref={editorRef}>
        {steps.map((label, index) => (
          <button
            key={label}
            type="button"
            disabled={saving || index > step || (index === 0 && selected !== null)}
            onClick={() => setStep(index)}
            className={
              index === step ? "sales-step sales-step--active" : "sales-step"
            }
          >
            {index + 1}. {label}
          </button>
        ))}
      </div>
      <Button small variant="ghost" disabled={saving} onClick={closeEditor}>Cerrar editor</Button>

      {step === 0 && (
        <div className="sales-card">
          <h2>Nueva oportunidad</h2>
          <label>Continuar una oportunidad existente
            <select value={existingOpportunity} onChange={event => setExistingOpportunity(event.target.value)}>
              <option value="">Crear nueva</option>
              {opportunities.map(item => <option key={item.id} value={item.id}>{item.nombre} · {item.direccion}</option>)}
            </select>
          </label>
          <p>Los campos con * son obligatorios.</p>
          <label>
            Cliente existente *
            <select
              required
              value={opportunity.clienteId}
              onChange={(event) =>
                setOpportunity((current) => ({
                  ...current,
                  clienteId: event.target.value,
                }))
              }
            >
              <option value="">Selecciona un cliente</option>
              {clients.map((client) => (
                <option key={client.id} value={client.id}>
                  {client.nombre}
                </option>
              ))}
            </select>
          </label>
          <label>
            Nombre de la oportunidad *
            <input
              required
              value={opportunity.nombre}
              onChange={(event) =>
                setOpportunity((current) => ({
                  ...current,
                  nombre: event.target.value,
                }))
              }
              placeholder="Reforma vivienda García"
            />
          </label>
          <label>
            Dirección *
            <input
              required
              value={opportunity.direccion}
              onChange={(event) =>
                setOpportunity((current) => ({
                  ...current,
                  direccion: event.target.value,
                }))
              }
            />
          </label>
          <label>
            Tipo *
            <input
              required
              value={opportunity.tipo}
              onChange={(event) =>
                setOpportunity((current) => ({
                  ...current,
                  tipo: event.target.value,
                }))
              }
            />
          </label>
          <label>
            Necesidad del cliente
            <textarea
              value={opportunity.descripcion}
              onChange={(event) =>
                setOpportunity((current) => ({
                  ...current,
                  descripcion: event.target.value,
                }))
              }
            />
          </label>
          <Button
            disabled={!opportunityComplete}
            onClick={() => void submitOpportunity()}
            loading={saving}
          >
            Continuar
          </Button>
        </div>
      )}

      {step === 1 && (
        <div className="sales-card">
          <h2>Alcance de la propuesta</h2>
          <p>
            {active
              ? `${active.nombre} · ${active.direccion}`
              : "Selecciona una oportunidad"}
          </p>
          <label>
            Título visible al cliente *
            <input
              required
              value={draft.titulo}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  titulo: event.target.value,
                }))
              }
              placeholder="Reforma integral de vivienda"
            />
          </label>
          <label>
            Validez (días) *
            <input
              required
              min="1"
              max="365"
              type="number"
              value={draft.validezDias}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  validezDias: Number(event.target.value),
                }))
              }
            />
          </label>
          <label>
            Condiciones de pago *
            <textarea
              required
              value={draft.condicionesPago}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  condicionesPago: event.target.value,
                }))
              }
            />
          </label>
          <Button disabled={!scopeComplete} onClick={() => setStep(2)}>
            Continuar
          </Button>
        </div>
      )}

      {step === 2 && (
        <div className="sales-card sales-card--wide">
          <header className="estimate-lines__heading">
            <div>
              <h2>Partidas y control interno</h2>
              <p>
                Selecciona una partida base o crea una manual. Todo se puede
                ajustar para esta propuesta.
              </p>
            </div>
            <strong>
              {draft.partidas.length}{" "}
              {draft.partidas.length === 1 ? "partida" : "partidas"}
            </strong>
          </header>
          <div className="estimate-lines__actions">
            <Button
              small
              variant="ghost"
              onClick={() =>
                setDraft((current) => ({
                  ...current,
                  partidas: [...current.partidas, newLine()],
                }))
              }
            >
              + Partida manual
            </Button>
            <Button
              small
              variant="ghost"
              onClick={() => setShowCatalog((current) => !current)}
            >
              {showCatalog ? "Ocultar catálogo" : "Añadir desde catálogo"}
            </Button>
          </div>
          {showCatalog && (
            <section className="estimate-catalog">
              <header>
                <strong>Catálogo de partidas</strong>
                <span>
                  Precios guardados en el catálogo · sin IVA
                </span>
              </header>
              <CatalogLoadState loading={catalogLoading} error={catalogError} reload={reloadCatalog} />
              {!catalogLoading && !catalogError && (catalog.length === 0
                ? <p role="status">No hay partidas activas en el catálogo. Puedes crear una partida manual.</p>
                : <CatalogPicker
                catalog={catalog}
                onPickItem={addCatalogItem}
                onImportCategory={importCatalogCategory}
              />)}
            </section>
          )}
          {draft.partidas.length === 0 ? (
            <p className="estimate-lines__empty">
              Empieza con una partida del catálogo o crea una manual.
            </p>
          ) : (
            <div className="estimate-lines">
              {draft.partidas.map((line, index) => (
                <EstimateLineEditor
                  key={line.id}
                  index={index}
                  line={line}
                  canRemove={draft.partidas.length > 1}
                  onChange={(changes) => updateLine(index, changes)}
                  onRemove={() => removeLine(index)}
                />
              ))}
            </div>
          )}
          <div className="estimate-lines__totals">
            <span>
              Venta estimada <strong>{formatMoney(totals.sale)}</strong>
            </span>
            <span>
              Coste interno{" "}
              <strong>
                {totals.cost == null ? "Pendiente" : formatMoney(totals.cost)}
              </strong>
            </span>
            <span>
              Margen estimado{" "}
              <strong>
                {totals.cost == null
                  ? "Pendiente"
                  : formatMoney(totals.sale - totals.cost)}
              </strong>
            </span>
          </div>
          <div className="sales-next-action">
            <Button disabled={!linesComplete} onClick={() => setStep(3)}>
              Revisar propuesta
            </Button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="sales-card">
          <h2>Revisión antes de guardar</h2>
          <p>
            <strong>{draft.titulo}</strong> · {draft.partidas.length} partidas ·
            cliente: {active?.nombre}
          </p>
          <p>
            Las notas y costes internos no forman parte de la versión que verá
            el cliente.
          </p>
          <Button
            disabled={!scopeComplete || !linesComplete}
            onClick={() => void submitEstimate()}
            loading={saving}
          >
            Guardar como borrador
          </Button>
        </div>
      )}
      </section>}
      <Modal
        open={preview !== null}
        onClose={() => setPreview(null)}
        title={preview ? `Presupuesto de ${preview.clienteNombre}` : "Presupuesto"}
        width={820}
        className="estimate-modal"
      >
        {preview && (
          <EstimateDocuments
            key={`${preview.id}-${preview.versionActual}`}
            api={api}
            item={preview}
          />
        )}
        {preview && <EstimateHistory key={preview.id} api={api} id={preview.id} />}
      </Modal>
    </section>
  );
}

function RecentEstimates({
  api,
  estimates,
  sending,
  converting,
  openingId,
  onPreview,
  onSend,
  onConvert,
  onEdit,
  editing,
}: {
  api: SalesApi;
  estimates: EstimateDTO[];
  sending: number | null;
  converting: number | null;
  openingId: number | null;
  onPreview: (estimate: EstimateDTO) => void;
  onSend: (estimate: EstimateDTO) => void;
  onConvert: (estimate: EstimateDTO) => void;
  onEdit: (estimate: EstimateDTO) => void;
  editing: boolean;
}) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [expanded, setExpanded] = useState(false);
  const [page, setPage] = useState(0);
  const [rows, setRows] = useState(estimates);
  const [loadError, setLoadError] = useState("");
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    let current = true;
    setLoading(true);
    const timer = setTimeout(() => { void api.estimates(page, query, status).then(items => {
      if (current) { setRows(items); setLoadError(""); }
    }).catch(() => { if (current) setLoadError("No se pudieron cargar los presupuestos."); }).finally(() => { if (current) setLoading(false); }); }, 200);
    return () => { current = false; clearTimeout(timer); };
  }, [api, estimates, page, query, status]);
  const hasFilters = Boolean(query.trim() || status);
  const filtered = filterEstimates(rows, query, status);
  return (
    <section className="estimate-list" aria-labelledby="recent-estimates">
      <header>
        <div>
          <p className="eyebrow">Seguimiento comercial</p>
          <h2 id="recent-estimates">{hasFilters ? "Resultados de búsqueda" : "Propuestas recientes"}</h2>
        </div>
        <p>
          Página {page + 1}
        </p>
        {!hasFilters && <Button small variant="ghost" aria-expanded={expanded} aria-controls="recent-estimates-content" onClick={() => setExpanded(value => !value)}>
          {expanded ? "Ocultar propuestas" : "Mostrar propuestas"}
        </Button>}
      </header>
      <EstimateSearch
        query={query}
        status={status}
        onQuery={value => { setPage(0); setQuery(value); }}
        onStatus={value => { setPage(0); setStatus(value); }}
      />
      <div id="recent-estimates-content" hidden={!expanded && !hasFilters}>
      {loadError && <p role="alert">{loadError}</p>}
      {loading && <p role="status">Cargando presupuestos…</p>}
      <p role="status">
        {filtered.length} propuestas en esta página
      </p>
      {filtered.length ? (
        filtered.map((estimate) => (
          <article key={estimate.id}>
            <div className="estimate-list__summary">
              <strong>{estimate.numero}</strong>
              <small className="estimate-list__client">Cliente: {estimate.clienteNombre}</small>
              <span>{estimate.titulo}</span>
              <small>
                v{estimate.versionActual} · {statusLabel(estimate.estado)} ·
                actualizada {formatDate(estimate.updatedAt)}
              </small>
              {estimate.propuesta && (
                <b>{formatMoney(estimate.propuesta.totalConIva)}</b>
              )}
            </div>
            <div className="estimate-list__actions">
              {["borrador", "en_revision", "enviado", "rechazado", "caducado"].includes(estimate.estado) && (
                <Button small variant="ghost" loading={openingId === estimate.id} disabled={editing || openingId !== null} onClick={() => void onEdit(estimate)}>
                  {["borrador", "en_revision"].includes(estimate.estado) ? "Editar borrador" : "Crear revisión"}
                </Button>
              )}
              <Button
                small
                variant="ghost"
                onMouseEnter={() => { if (estimate.propuesta) void api.downloadPdf(estimate.id, estimate.versionActual, estimate.updatedAt).catch(() => undefined); }}
                onFocus={() => { if (estimate.propuesta) void api.downloadPdf(estimate.id, estimate.versionActual, estimate.updatedAt).catch(() => undefined); }}
                onPointerDown={() => { if (estimate.propuesta) void api.downloadPdf(estimate.id, estimate.versionActual, estimate.updatedAt).catch(() => undefined); }}
                onClick={() => onPreview(estimate)}
              >
                Ver presupuesto
              </Button>
              {(estimate.estado === "borrador" ||
                estimate.estado === "en_revision") && (
                <Button
                  small
                  loading={sending === estimate.id}
                  onClick={() => void onSend(estimate)}
                >
                  Publicar en área cliente
                </Button>
              )}
              {estimate.estado === "firmado" && (
                <Button
                  small
                  loading={converting === estimate.id}
                  onClick={() => void onConvert(estimate)}
                >
                  Crear proyecto
                </Button>
              )}
            </div>
          </article>
        ))
      ) : (
        <p className="estimate-list__empty">
          {estimates.length
            ? "No hay presupuestos que coincidan con los filtros."
            : "Aún no hay propuestas. Crea una oportunidad para preparar la primera."}
        </p>
      )}
      </div>
      {(expanded || hasFilters) && <nav aria-label="Páginas de presupuestos"><Button small variant="ghost" disabled={page === 0 || loading} onClick={() => setPage(value => value - 1)}>Anterior</Button><Button small variant="ghost" disabled={rows.length < 20 || loading} onClick={() => setPage(value => value + 1)}>Siguiente</Button></nav>}
    </section>
  );
}

function EstimateLineEditor({
  index,
  line,
  canRemove,
  onChange,
  onRemove,
}: {
  index: number;
  line: EstimateDraftDTO["partidas"][number];
  canRemove: boolean;
  onChange: (changes: Partial<EstimateDraftDTO["partidas"][number]>) => void;
  onRemove: () => void;
}) {
  const sale =
    line.cantidad * line.precioVentaUnitario * (1 - line.descuento / 100);
  const cost =
    line.costeUnitario == null ? null : line.cantidad * line.costeUnitario;
  return (
    <article className="estimate-line">
      <header>
        <strong>Partida {index + 1}</strong>
        {canRemove && (
          <button
            type="button"
            className="estimate-line__remove"
            onClick={onRemove}
          >
            Eliminar
          </button>
        )}
      </header>
      <div className="estimate-line__main">
        <label>
          Descripción *
          <input
            required
            value={line.descripcion}
            placeholder="Ej. Demolición y retirada"
            onChange={(event) => onChange({ descripcion: event.target.value })}
          />
        </label>
        <label>
          Categoría
          <select
            value={line.categoria}
            onChange={(event) => onChange({ categoria: event.target.value })}
          >
            <option value="General">General</option>
            <option value="Demoliciones">Demoliciones</option>
            <option value="Albañilería">Albañilería</option>
            <option value="Instalaciones">Instalaciones</option>
            <option value="Carpintería">Carpintería</option>
            <option value="Acabados">Acabados</option>
          </select>
        </label>
        <label>
          Cantidad *
          <input
            required
            min="0.01"
            step="0.01"
            type="number"
            value={line.cantidad}
            onChange={(event) =>
              onChange({ cantidad: Number(event.target.value) })
            }
          />
        </label>
        <label>
          Unidad
          <select
            value={line.unidad}
            onChange={(event) => onChange({ unidad: event.target.value })}
          >
            <option value="ud">ud</option>
            <option value="m²">m²</option>
            <option value="ml">ml</option>
            <option value="h">h</option>
          </select>
        </label>
        <label>
          Precio de venta (€) *
          <input
            required
            min="0"
            step="0.01"
            type="number"
            value={line.precioVentaUnitario}
            onChange={(event) =>
              onChange({ precioVentaUnitario: Number(event.target.value) })
            }
          />
        </label>
        <label>
          Descuento (%)
          <input
            min="0"
            max="100"
            step="0.01"
            type="number"
            value={line.descuento}
            onChange={(event) =>
              onChange({ descuento: Number(event.target.value) })
            }
          />
        </label>
        <label>
          IVA (%)
          <input
            required
            min="0"
            max="100"
            step="0.01"
            type="number"
            value={line.iva}
            onChange={(event) => onChange({ iva: Number(event.target.value) })}
          />
        </label>
      </div>
      <details className="estimate-line__internal" open>
        <summary>
          Control interno <span>No visible para el cliente</span>
        </summary>
        <div>
          <label>
            Coste unitario (€)
            <input
              min="0"
              step="0.01"
              type="number"
              placeholder="Pendiente"
              value={line.costeUnitario ?? ""}
              onChange={(event) =>
                onChange({
                  costeUnitario:
                    event.target.value === ""
                      ? null
                      : Number(event.target.value),
                })
              }
            />
          </label>
          <label>
            Nota interna
            <textarea
              rows={2}
              value={line.notaInterna ?? ""}
              placeholder="Proveedor, plazo, riesgo o detalle de ejecución"
              onChange={(event) =>
                onChange({ notaInterna: event.target.value })
              }
            />
          </label>
        </div>
      </details>
      <footer>
        <span>
          Venta: <strong>{formatMoney(sale)}</strong>
        </span>
        <span>
          Coste:{" "}
          <strong>{cost == null ? "Pendiente" : formatMoney(cost)}</strong>
        </span>
      </footer>
    </article>
  );
}

function lineFromCatalog(
  item: CatalogItem,
  categoria: string,
): EstimateDraftDTO["partidas"][number] {
  return {
    ...newLine(),
    categoria,
    descripcion: item.descripcion,
    unidad: item.unidad,
    precioVentaUnitario: item.precio,
    iva: item.iva,
  };
}
