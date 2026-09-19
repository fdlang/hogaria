import { useEffect, useMemo, useState } from "react";
import { Button, Modal } from "@/shared/ui";
import {
  EstimateContent,
  EstimateDocuments,
  EstimateSearch,
} from "./EstimateContent";
import { filterEstimates } from "../estimate-search";
import { formatDate, formatMoney } from "@/shared/lib/formatters";
import { CatalogPicker } from "@/features/catalog/CatalogPicker";
import {
  CATALOG,
  type CatalogCategory,
  type CatalogItem,
  CATALOG_UPDATED_AT,
  setRuntimeCatalog,
} from "@/features/catalog/catalog";
import type { UsersApi } from "@/features/users/api/users.api";
import {
  SalesApi,
  type EstimateDraftDTO,
  type EstimateDTO,
  type OpportunityDTO,
} from "../api/sales.api";

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
  const [catalog, setCatalog] = useState<CatalogCategory[]>(CATALOG);
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [converting, setConverting] = useState<number | null>(null);
  const [sending, setSending] = useState<number | null>(null);
  const [showCatalog, setShowCatalog] = useState(false);
  const [error, setError] = useState("");
  const [preview, setPreview] = useState<EstimateDTO | null>(null);
  const [opportunity, setOpportunity] = useState({
    clienteId: "",
    nombre: "",
    direccion: "",
    tipo: "Reforma integral",
    descripcion: "",
  });
  const [selected, setSelected] = useState<number | null>(null);
  const [draft, setDraft] = useState(blankDraft);

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

  useEffect(() => {
    void api
      .catalog()
      .then((items) => {
        if (!items.length) return;
        const grouped = new Map<string, CatalogItem[]>();
        items.forEach((item) =>
          grouped.set(item.category, [
            ...(grouped.get(item.category) ?? []),
            {
              ref: item.reference,
              descripcion: item.description,
              unidad: item.unit,
              precio: item.salePrice,
              iva: item.vatRate,
            },
          ]),
        );
        const managedCatalog = [...grouped.entries()].map(
          ([categoria, categoryItems]) => ({ categoria, items: categoryItems }),
        );
        setRuntimeCatalog(managedCatalog);
        setCatalog(managedCatalog);
      })
      .catch(() => {
        // The bundled catalogue is an intentional fallback for local development.
      });
  }, [api]);

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
      const saved = await api.createOpportunity({
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
      });
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
      await api.createEstimate(selected, draft);
      setStep(0);
      setSelected(null);
      setDraft(blankDraft());
      await refresh();
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

  return (
    <section>
      <header className="sales-page-header">
        <div>
          <p className="eyebrow">Ventas y propuestas</p>
          <h1>De oportunidad a obra</h1>
          <p>
            Una propuesta se crea antes del proyecto y conserva cada versión
            enviada.
          </p>
        </div>
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
      </header>

      <div className="sales-steps">
        {steps.map((label, index) => (
          <button
            key={label}
            type="button"
            disabled={index > step}
            onClick={() => setStep(index)}
            className={
              index === step ? "sales-step sales-step--active" : "sales-step"
            }
          >
            {index + 1}. {label}
          </button>
        ))}
      </div>
      {error && (
        <p role="alert" className="sales-error">
          {error}
        </p>
      )}

      {step === 0 && (
        <div className="sales-card">
          <h2>Nueva oportunidad</h2>
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
                <strong>Catálogo base Madrid</strong>
                <span>
                  Precios de venta orientativos sin IVA · revisión{" "}
                  {new Date(CATALOG_UPDATED_AT).toLocaleDateString("es-ES")}
                </span>
              </header>
              <CatalogPicker
                onPickItem={addCatalogItem}
                onImportCategory={importCatalogCategory}
              />
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

      <RecentEstimates
        estimates={estimates}
        sending={sending}
        converting={converting}
        onPreview={setPreview}
        onSend={send}
        onConvert={convert}
      />
      <Modal
        open={preview !== null}
        onClose={() => setPreview(null)}
        title={preview?.numero ?? "Propuesta"}
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
        <EstimateContent item={preview} />
      </Modal>
    </section>
  );
}

function RecentEstimates({
  estimates,
  sending,
  converting,
  onPreview,
  onSend,
  onConvert,
}: {
  estimates: EstimateDTO[];
  sending: number | null;
  converting: number | null;
  onPreview: (estimate: EstimateDTO) => void;
  onSend: (estimate: EstimateDTO) => void;
  onConvert: (estimate: EstimateDTO) => void;
}) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const filtered = filterEstimates(estimates, query, status);
  return (
    <section className="estimate-list" aria-labelledby="recent-estimates">
      <header>
        <div>
          <p className="eyebrow">Seguimiento comercial</p>
          <h2 id="recent-estimates">Propuestas recientes</h2>
        </div>
        <p>
          {estimates.length}{" "}
          {estimates.length === 1 ? "propuesta" : "propuestas"}
        </p>
      </header>
      <EstimateSearch
        query={query}
        status={status}
        onQuery={setQuery}
        onStatus={setStatus}
      />
      <p role="status">
        {filtered.length} de {estimates.length} propuestas
      </p>
      {filtered.length ? (
        filtered.map((estimate) => (
          <article key={estimate.id}>
            <div className="estimate-list__summary">
              <strong>{estimate.numero}</strong>
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
              <Button small variant="ghost" onClick={() => onPreview(estimate)}>
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
