import { useMemo, useState } from "react";
import { calculateCatalogPrice, catalogActivationIssues, CURRENT_FISCAL_POLICY, type CatalogCostBreakdown } from "@reformapro/domain";
import { Button } from "@/shared/ui";
import { formatMoney } from "@/shared/lib/formatters";
import { SalesApi, type CatalogItemDTO, type CatalogWriteDTO } from "@/features/sales/api/sales.api";
import { catalogCategories, filterCatalogItems, groupCatalogItems, validateCatalogForm } from "./catalog-manager.utils";
import { useCatalog } from "./useCatalog";
import { CatalogLoadState } from "./CatalogLoadState";

type Form = {
  reference: string; category: string; description: string; unit: string; salePrice: string; vatRate: string;
  itemType: "simple" | "composite"; laborCost: string; materialCost: string; auxiliaryCost: string;
  overheadPercent: string; targetMarginPercent: string; sourceName: string; sourceUrl: string;
  priceDate: string; validFrom: string; validUntil: string; searchTerms: string;
  replacementReference: string; reviewNote: string;
};

const blank = (): Form => ({
  reference: "", category: "", description: "", unit: "ud", salePrice: "",
  vatRate: String(CURRENT_FISCAL_POLICY.defaultVatRate), itemType: "simple", laborCost: "",
  materialCost: "", auxiliaryCost: "", overheadPercent: "", targetMarginPercent: "",
  sourceName: "", sourceUrl: "", priceDate: "", validFrom: "", validUntil: "", searchTerms: "",
  replacementReference: "", reviewNote: "",
});
const optionalNumber = (value: string) => value.trim() === "" ? null : Number(value);
const optionalText = (value: string) => value.trim() || null;
const costsFrom = (form: Form): CatalogCostBreakdown => ({
  laborCost: optionalNumber(form.laborCost), materialCost: optionalNumber(form.materialCost),
  auxiliaryCost: optionalNumber(form.auxiliaryCost), overheadPercent: optionalNumber(form.overheadPercent),
  targetMarginPercent: optionalNumber(form.targetMarginPercent),
});

export function CatalogManager({ api }: { api: SalesApi }) {
  const { items, loading, error: loadError, reload: load } = useCatalog(api, true);
  const [form, setForm] = useState<Form>(blank);
  const [editing, setEditing] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [includeArchived, setIncludeArchived] = useState(false);
  const categories = useMemo(() => catalogCategories(items), [items]);
  const displayedItems = useMemo(() => filterCatalogItems(items, { search, category, includeArchived }), [items, search, category, includeArchived]);
  const groups = useMemo(() => groupCatalogItems(displayedItems), [displayedItems]);
  const priceCalculation = useMemo(() => { try { return calculateCatalogPrice(costsFrom(form)); } catch { return null; } }, [form]);
  const set = (field: keyof Form, value: string) => setForm(current => ({ ...current, [field]: value }));

  const submit = async () => {
    const validation = validateCatalogForm(form);
    if (Object.keys(validation).length) { setError(Object.values(validation)[0] ?? "Revisa los campos obligatorios"); return; }
    const payload: CatalogWriteDTO = {
      reference: form.reference, category: form.category, description: form.description, unit: form.unit,
      salePrice: Number(form.salePrice), vatRate: Number(form.vatRate), itemType: form.itemType,
      costBreakdown: costsFrom(form),
      evidence: {
        sourceName: optionalText(form.sourceName), sourceUrl: optionalText(form.sourceUrl),
        priceDate: optionalText(form.priceDate), validFrom: optionalText(form.validFrom), validUntil: optionalText(form.validUntil),
      },
      searchTerms: [...new Set(form.searchTerms.split(",").map(term => term.trim()).filter(Boolean))],
      replacementReference: optionalText(form.replacementReference), reviewNote: optionalText(form.reviewNote),
    };
    try {
      setSaving(true); setError("");
      if (editing == null) await api.createCatalogItem(payload); else await api.updateCatalogItem(editing, payload);
      setForm(blank()); setEditing(null); await load();
    } catch (cause) { setError((cause as { message?: string }).message ?? "No se pudo guardar la partida"); }
    finally { setSaving(false); }
  };

  const edit = (item: CatalogItemDTO) => {
    setEditing(item.id);
    setForm({
      reference: item.reference, category: item.category, description: item.description, unit: item.unit,
      salePrice: String(item.salePrice), vatRate: String(item.vatRate), itemType: item.itemType,
      laborCost: item.costBreakdown.laborCost?.toString() ?? "", materialCost: item.costBreakdown.materialCost?.toString() ?? "",
      auxiliaryCost: item.costBreakdown.auxiliaryCost?.toString() ?? "", overheadPercent: item.costBreakdown.overheadPercent?.toString() ?? "",
      targetMarginPercent: item.costBreakdown.targetMarginPercent?.toString() ?? "", sourceName: item.evidence.sourceName ?? "",
      sourceUrl: item.evidence.sourceUrl ?? "", priceDate: item.evidence.priceDate ?? "", validFrom: item.evidence.validFrom ?? "",
      validUntil: item.evidence.validUntil ?? "", searchTerms: item.searchTerms.join(", "),
      replacementReference: item.replacementReference ?? "", reviewNote: item.reviewNote ?? "",
    });
    requestAnimationFrame(() => {
      const input = document.querySelector<HTMLInputElement>(".catalog-manager .sales-card input");
      input?.scrollIntoView({ behavior: "smooth", block: "center" }); input?.focus();
    });
  };
  const archive = async (item: CatalogItemDTO) => {
    if (item.reviewStatus === "archived" || !window.confirm(`¿Archivar ${item.reference}? Dejará de aparecer al crear propuestas.`)) return;
    try { await api.archiveCatalogItem(item.id); await load(); }
    catch (cause) { setError((cause as { message?: string }).message ?? "No se pudo archivar la partida"); }
  };
  const activate = async (item: CatalogItemDTO) => {
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
    const issues = catalogActivationIssues(item, today);
    if (issues.length) { setError(`No se puede activar ${item.reference}. Completa precio, fuente y vigencia y comprueba que no se venda por debajo del coste.`); return; }
    try { setSaving(true); setError(""); await api.updateCatalogItem(item.id, { reviewStatus: "verified" }); await load(); }
    catch (cause) { setError((cause as { message?: string }).message ?? "No se pudo activar la partida"); }
    finally { setSaving(false); }
  };
  const reopen = async (item: CatalogItemDTO) => {
    try { setSaving(true); setError(""); await api.updateCatalogItem(item.id, { reviewStatus: "pending_review" }); await load(); }
    catch (cause) { setError((cause as { message?: string }).message ?? "No se pudo reabrir la revisión"); }
    finally { setSaving(false); }
  };

  return <section className="private-page catalog-manager">
    <header className="private-page-header">
      <div className="private-page-header__copy"><p className="eyebrow">Administración</p><h1>Catálogo de partidas</h1><p>Solo administradores. Archivar conserva el histórico de propuestas.</p></div>
      <div className="private-page-header__actions"><Button small variant="ghost" disabled={loading || saving} onClick={() => void load()}>Actualizar</Button></div>
    </header>
    <section className="sales-card">
      <h2>{editing == null ? "Nueva partida" : "Editar partida"}</h2>
      {error && <p role="alert" className="form-error">{error}</p>}
      <div className="estimate-line__main">
        <label>Referencia *<input value={form.reference} onChange={event => set("reference", event.target.value)} placeholder="DEM-007" /></label>
        <label>Categoría *<input list="catalog-categories" value={form.category} onChange={event => set("category", event.target.value)} placeholder="Demoliciones" /><datalist id="catalog-categories">{categories.map(value => <option key={value} value={value} />)}</datalist></label>
        <label>Descripción *<input value={form.description} onChange={event => set("description", event.target.value)} /></label>
        <label>Unidad *<input value={form.unit} onChange={event => set("unit", event.target.value)} /></label>
        <label>Precio sin IVA *<input type="number" min="0" step="0.01" value={form.salePrice} onChange={event => set("salePrice", event.target.value)} /></label>
        <label>IVA (%) *<select value={form.vatRate} onChange={event => set("vatRate", event.target.value)}>{CURRENT_FISCAL_POLICY.selectableVatRates.map(rate => <option key={rate} value={rate}>{rate}%</option>)}</select></label>
      </div>
      <details className="catalog-manager__pricing">
        <summary>Coste y trazabilidad <small>Información interna; el cliente no la ve</small></summary>
        <div className="estimate-line__main">
          <label>Tipo<select value={form.itemType} onChange={event => set("itemType", event.target.value)}><option value="simple">Simple</option><option value="composite">Compuesta</option></select></label>
          <label>Mano de obra<input type="number" min="0" step="0.01" value={form.laborCost} onChange={event => set("laborCost", event.target.value)} /></label>
          <label>Material<input type="number" min="0" step="0.01" value={form.materialCost} onChange={event => set("materialCost", event.target.value)} /></label>
          <label>Auxiliares<input type="number" min="0" step="0.01" value={form.auxiliaryCost} onChange={event => set("auxiliaryCost", event.target.value)} /></label>
          <label>Gastos generales (%)<input type="number" min="0" max="100" step="0.01" value={form.overheadPercent} onChange={event => set("overheadPercent", event.target.value)} /></label>
          <label>Margen bruto objetivo (%)<input type="number" min="0" max="99.99" step="0.01" value={form.targetMarginPercent} onChange={event => set("targetMarginPercent", event.target.value)} /></label>
        </div>
        {priceCalculation && <div className="catalog-manager__calculation" aria-live="polite">
          <span>Coste directo <strong>{formatMoney(priceCalculation.directCost)}</strong></span>
          <span>Con gastos <strong>{priceCalculation.costWithOverhead == null ? "—" : formatMoney(priceCalculation.costWithOverhead)}</strong></span>
          <span>Venta sugerida <strong>{priceCalculation.suggestedSalePrice == null ? "—" : formatMoney(priceCalculation.suggestedSalePrice)}</strong></span>
          {priceCalculation.suggestedSalePrice != null && <Button small variant="ghost" onClick={() => set("salePrice", String(priceCalculation.suggestedSalePrice))}>Usar precio sugerido</Button>}
        </div>}
        <p className="form-hint">Si informas un coste, la fuente y la fecha del precio son obligatorias.</p>
        <div className="estimate-line__main">
          <label>Fuente<input value={form.sourceName} onChange={event => set("sourceName", event.target.value)} placeholder="CYPE, proveedor o tarifa acordada" /></label>
          <label>Enlace de la fuente<input type="url" value={form.sourceUrl} onChange={event => set("sourceUrl", event.target.value)} placeholder="https://…" /></label>
          <label>Fecha del precio<input type="date" value={form.priceDate} onChange={event => set("priceDate", event.target.value)} /></label>
          <label>Vigente desde<input type="date" value={form.validFrom} onChange={event => set("validFrom", event.target.value)} /></label>
          <label>Vigente hasta<input type="date" value={form.validUntil} onChange={event => set("validUntil", event.target.value)} /></label>
          <label>Sinónimos de búsqueda<input value={form.searchTerms} onChange={event => set("searchTerms", event.target.value)} placeholder="separados por comas" /></label>
          <label>Referencia sustituta<input value={form.replacementReference} onChange={event => set("replacementReference", event.target.value)} placeholder="Solo para partidas reemplazadas" /></label>
          <label>Nota de revisión<input value={form.reviewNote} onChange={event => set("reviewNote", event.target.value)} maxLength={500} /></label>
        </div>
      </details>
      <div className="catalog-manager__form-actions">
        <Button loading={saving} onClick={() => void submit()}>{editing == null ? "Crear partida" : "Guardar cambios"}</Button>
        {editing != null && <Button variant="ghost" onClick={() => { setEditing(null); setForm(blank()); setError(""); }}>Cancelar</Button>}
      </div>
    </section>
    <section className="sales-card sales-card--wide catalog-manager__registered">
      <div className="catalog-manager__heading"><div><h2>Partidas registradas</h2><p>Organizadas por capítulos para localizar y mantener cada partida con rapidez.</p></div>{!loading && !loadError && <span>{displayedItems.length} {displayedItems.length === 1 ? "partida" : "partidas"}</span>}</div>
      <div className="catalog-manager__filters">
        <label>Buscar partida<input type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Referencia, descripción o sinónimo" /></label>
        <label>Categoría<select value={category} onChange={event => setCategory(event.target.value)}><option value="">Todas las categorías</option>{categories.map(value => <option key={value} value={value}>{value}</option>)}</select></label>
        <label className="catalog-manager__archived"><input type="checkbox" checked={includeArchived} onChange={event => setIncludeArchived(event.target.checked)} /> Incluir archivadas</label>
        {(search || category || includeArchived) && <Button small variant="ghost" onClick={() => { setSearch(""); setCategory(""); setIncludeArchived(false); }}>Limpiar filtros</Button>}
      </div>
      {loading || loadError ? <CatalogLoadState loading={loading} error={loadError} reload={load} /> : groups.length === 0
        ? <p className="catalog-manager__empty">{items.length === 0 ? "Todavía no hay partidas guardadas en el catálogo." : !search && !category && !includeArchived && items.every(item => !item.active) ? "Todas las partidas están archivadas. Activa «Incluir archivadas» para consultarlas." : "No hay partidas que coincidan con estos filtros."}</p>
        : <div className="catalog-manager__groups">{groups.map(group => <section className="catalog-manager__group" key={group.category}>
          <header><div><p className="eyebrow">Capítulo</p><h3>{group.category}</h3></div><span>{group.items.length} {group.items.length === 1 ? "partida" : "partidas"}</span></header>
          <div className="private-table-scroll catalog-manager__table-scroll"><table className="catalog-manager__table">
            <thead><tr><th>Ref.</th><th>Partida</th><th>Precio</th><th>Estado</th><th /></tr></thead>
            <tbody>{group.items.map(item => {
              const directCost = calculateCatalogPrice(item.costBreakdown).directCost;
              const status = item.reviewStatus === "verified" ? "Verificada" : item.reviewStatus === "archived" ? "Archivada" : "Pendiente de revisión";
              return <tr key={item.id} style={{ opacity: item.reviewStatus === "archived" ? .55 : 1 }}>
                <td data-label="Referencia"><code>{item.reference}</code></td>
                <td data-label="Partida"><strong>{item.description}</strong><br /><small>{item.unit} · IVA {item.vatRate}%{directCost > 0 ? ` · coste ${formatMoney(directCost)}` : ""}</small>{item.evidence.sourceName && <><br /><small>Fuente: {item.evidence.sourceName}{item.evidence.priceDate ? ` · ${item.evidence.priceDate}` : ""}</small></>}</td>
                <td data-label="Precio">{formatMoney(item.salePrice)}</td>
                <td data-label="Estado">{status}{item.replacementReference ? <><br /><small>Sustituida por {item.replacementReference}</small></> : null}</td>
                <td><div className="catalog-manager__row-actions"><Button small variant="ghost" onClick={() => edit(item)}>Editar</Button>{item.reviewStatus === "pending_review" && <Button small onClick={() => void activate(item)}>Validar y activar</Button>}{item.reviewStatus === "archived" && <Button small variant="ghost" onClick={() => void reopen(item)}>Reabrir revisión</Button>}{item.reviewStatus !== "archived" && <Button small variant="ghost" onClick={() => void archive(item)}>Archivar</Button>}</div></td>
              </tr>;
            })}</tbody>
          </table></div>
        </section>)}</div>}
    </section>
  </section>;
}
