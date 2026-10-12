/**
 * CatalogPicker — quick-add partidas from the price catalog.
 * Search-first selector for verified catalog items.
 */

import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import type { CatalogCategory, CatalogItem } from "./catalog";
import { Input, Button, Badge } from "@/shared/ui";
import { formatMoney } from "@/shared/lib/formatters";
import { ESTIMATE_TEMPLATES, type EstimateTemplate, type EstimateTemplateMeasurement } from "@reformapro/domain";
import { CatalogLoadState } from "./CatalogLoadState";
import { catalogItemsForReferences, parseCatalogReferences, rememberCatalogReference, toggleCatalogFavorite } from "./catalog-preferences";

export type TemplateMeasurements = Record<EstimateTemplateMeasurement, number>;
export type TemplateCatalogItem = { categoria: string; item: CatalogItem; cantidad: number };
export type CatalogBrowsePage = { categories: CatalogCategory[]; total: number; page: number; pages: number };

const emptyMeasurements = (): Record<EstimateTemplateMeasurement, string> => ({
  floorArea: "", wallArea: "", baseCabinetMetres: "", wallCabinetMetres: "", worktopMetres: "", wardrobeMetres: "",
});

export function resolveCatalogTemplate(template: EstimateTemplate, catalog: CatalogCategory[], measurements: TemplateMeasurements): TemplateCatalogItem[] {
  const items = new Map(catalog.flatMap(category => category.items.map(item => [item.ref, { categoria: category.categoria, item }] as const)));
  return template.items.flatMap(entry => {
    const found = items.get(entry.reference);
    if (!found) return [];
    const cantidad = entry.measurement ? measurements[entry.measurement] : entry.quantity;
    return cantidad > 0 ? [{ ...found, cantidad }] : [];
  });
}

export function expectedTemplateItems(template: EstimateTemplate, measurements: TemplateMeasurements) {
  return template.items.filter(entry => !(entry.optional && entry.measurement && measurements[entry.measurement] <= 0));
}

export function mergeCatalogCategories(current: CatalogCategory[], incoming: CatalogCategory[]) {
  const grouped = new Map(current.map(category => [category.categoria, [...category.items]]));
  incoming.forEach(category => {
    const items = grouped.get(category.categoria) ?? [];
    const references = new Set(items.map(item => item.ref));
    items.push(...category.items.filter(item => !references.has(item.ref)));
    grouped.set(category.categoria, items);
  });
  return [...grouped].map(([categoria, items]) => ({ categoria, items }));
}

interface Props {
  onPickItem: (item: CatalogItem, category: string) => void;
  onImportTemplate: (items: TemplateCatalogItem[]) => void;
  loadItems: (search: string, references?: string[]) => Promise<CatalogCategory[]>;
  browseItems: (page: number) => Promise<CatalogBrowsePage>;
}

const templateReferences = [...new Set(ESTIMATE_TEMPLATES.flatMap(template => template.items.map(item => item.reference)))];
const FAVORITES_KEY = "hogaria_catalog_favorites";
const RECENT_KEY = "hogaria_catalog_recent";
const PICKER_MODES = ["search", "browse", "template"] as const;
type PickerMode = typeof PICKER_MODES[number];
const readPreference = (key: string) => {
  try { return parseCatalogReferences(localStorage.getItem(key)); } catch { return []; }
};
const savePreference = (key: string, references: string[]) => {
  try { localStorage.setItem(key, JSON.stringify(references)); } catch { /* Preferences remain available for this session. */ }
};

export function CatalogPicker({ onPickItem, onImportTemplate, loadItems, browseItems }: Props) {
  const [mode, setMode] = useState<PickerMode>("search");
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<CatalogCategory[]>([]);
  const [templateCatalog, setTemplateCatalog] = useState<CatalogCategory[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [templateError, setTemplateError] = useState("");
  const [templateLoading, setTemplateLoading] = useState(true);
  const [browseCategories, setBrowseCategories] = useState<CatalogCategory[]>([]);
  const [browsePage, setBrowsePage] = useState(-1);
  const [browsePages, setBrowsePages] = useState(1);
  const [browseTotal, setBrowseTotal] = useState(0);
  const [browseLoading, setBrowseLoading] = useState(false);
  const [browseError, setBrowseError] = useState("");
  const [browseRequestedPage, setBrowseRequestedPage] = useState(0);
  const [browseStarted, setBrowseStarted] = useState(false);
  const request = useRef(0);
  const templateRequest = useRef(0);
  const [favoriteRefs, setFavoriteRefs] = useState(() => readPreference(FAVORITES_KEY));
  const [recentRefs, setRecentRefs] = useState(() => readPreference(RECENT_KEY));
  const [selectedTemplateId, setSelectedTemplateId] = useState<EstimateTemplate["id"] | null>(null);
  const [measurements, setMeasurements] = useState(emptyMeasurements);
  const [templateAttempted, setTemplateAttempted] = useState(false);
  const numericMeasurements = useMemo<TemplateMeasurements>(() => Object.fromEntries(
    Object.entries(measurements).map(([key, value]) => [key, Number(value.replace(",", ".")) || 0]),
  ) as unknown as TemplateMeasurements, [measurements]);

  const resultCount = results.reduce((total, category) => total + category.items.length, 0);

  const shortcutReferences = useMemo(() => [...new Set([...templateReferences, ...favoriteRefs, ...recentRefs])], [favoriteRefs, recentRefs]);
  const loadTemplates = useCallback(async () => {
    const current = ++templateRequest.current;
    setTemplateError("");
    setTemplateLoading(true);
    try {
      const items = await loadItems("", shortcutReferences);
      if (templateRequest.current === current) setTemplateCatalog(items);
    } catch {
      if (templateRequest.current === current) setTemplateError("No se pudieron cargar las plantillas del catálogo.");
    } finally {
      if (templateRequest.current === current) setTemplateLoading(false);
    }
  }, [loadItems, shortcutReferences]);
  useEffect(() => { void loadTemplates(); }, [loadTemplates]);
  const loadBrowsePage = useCallback(async (page: number) => {
    setBrowseStarted(true);
    setBrowseRequestedPage(page);
    setBrowseLoading(true);
    setBrowseError("");
    try {
      const result = await browseItems(page);
      setBrowseCategories(current => page === 0 ? result.categories : mergeCatalogCategories(current, result.categories));
      setBrowsePage(result.page);
      setBrowsePages(result.pages);
      setBrowseTotal(result.total);
    } catch {
      setBrowseError("No se pudo cargar el catálogo por categorías.");
    } finally {
      setBrowseLoading(false);
    }
  }, [browseItems]);
  useEffect(() => { if (mode === "browse" && !browseStarted) void loadBrowsePage(0); }, [browseStarted, loadBrowsePage, mode]);
  useEffect(() => {
    const query = search.trim();
    if (!query) { request.current += 1; setResults([]); setError(""); setLoading(false); return; }
    const current = ++request.current;
    const timer = window.setTimeout(() => {
      setLoading(true); setError("");
      void loadItems(query).then(items => { if (request.current === current) setResults(items); })
        .catch(() => { if (request.current === current) setError("No se pudo buscar en el catálogo."); })
        .finally(() => { if (request.current === current) setLoading(false); });
    }, 250);
    return () => window.clearTimeout(timer);
  }, [loadItems, search]);

  const favorites = useMemo(() => catalogItemsForReferences(templateCatalog, favoriteRefs), [favoriteRefs, templateCatalog]);
  const recent = useMemo(() => catalogItemsForReferences(templateCatalog, recentRefs.filter(reference => !favoriteRefs.includes(reference))), [favoriteRefs, recentRefs, templateCatalog]);
  const pick = (item: CatalogItem, categoria: string) => {
    setRecentRefs(current => {
      const next = rememberCatalogReference(current, item.ref);
      savePreference(RECENT_KEY, next);
      return next;
    });
    onPickItem(item, categoria);
  };
  const toggleFavorite = (reference: string) => {
    setFavoriteRefs(current => {
      const next = toggleCatalogFavorite(current, reference);
      savePreference(FAVORITES_KEY, next);
      return next;
    });
  };
  const selectedTemplate = ESTIMATE_TEMPLATES.find(template => template.id === selectedTemplateId) ?? null;
  const selectedResolved = selectedTemplate ? resolveCatalogTemplate(selectedTemplate, templateCatalog, numericMeasurements) : [];
  const selectedExpected = selectedTemplate ? expectedTemplateItems(selectedTemplate, numericMeasurements) : [];
  const availableTemplateReferences = new Set(templateCatalog.flatMap(category => category.items.map(item => item.ref)));
  const missingCatalogItems = selectedExpected.filter(entry => !availableTemplateReferences.has(entry.reference)).length;
  const invalidMeasurements = selectedTemplate?.measurements.filter(field => {
    const raw = measurements[field.key].trim();
    const value = numericMeasurements[field.key];
    return (field.required && !raw) || (raw !== "" && (!Number.isFinite(value) || value <= 0 || value > 100_000 || !/^\d+(?:[.,]\d{1,2})?$/.test(raw)));
  }) ?? [];
  const templateReady = Boolean(selectedTemplate && !templateLoading && invalidMeasurements.length === 0 && missingCatalogItems === 0 && selectedResolved.length > 0);
  const selectTemplate = (template: EstimateTemplate) => {
    setSelectedTemplateId(template.id);
    setTemplateAttempted(false);
    setMeasurements(emptyMeasurements());
  };
  const importSelectedTemplate = () => {
    setTemplateAttempted(true);
    if (!templateReady) return;
    onImportTemplate(selectedResolved);
  };
  const browseLoaded = browseCategories.reduce((total, category) => total + category.items.length, 0);
  const handleTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const current = PICKER_MODES.indexOf(mode);
    const next = event.key === "Home" ? 0 : event.key === "End" ? PICKER_MODES.length - 1
      : (current + (event.key === "ArrowRight" ? 1 : -1) + PICKER_MODES.length) % PICKER_MODES.length;
    setMode(PICKER_MODES[next]!);
    event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next]?.focus();
  };

  return (
    <div>
      <div className="catalog-picker-mode" role="tablist" aria-label="Forma de añadir partidas">
        <button id="catalog-search-tab" type="button" role="tab" tabIndex={mode === "search" ? 0 : -1} aria-selected={mode === "search"} aria-controls="catalog-search-panel" onKeyDown={handleTabKeyDown} onClick={() => setMode("search")}>Buscar partida</button>
        <button id="catalog-browse-tab" type="button" role="tab" tabIndex={mode === "browse" ? 0 : -1} aria-selected={mode === "browse"} aria-controls="catalog-browse-panel" onKeyDown={handleTabKeyDown} onClick={() => setMode("browse")}>Ver por categorías</button>
        <button id="catalog-template-tab" type="button" role="tab" tabIndex={mode === "template" ? 0 : -1} aria-selected={mode === "template"} aria-controls="catalog-template-panel" onKeyDown={handleTabKeyDown} onClick={() => setMode("template")}>Usar plantilla</button>
      </div>
      {mode === "search" && <div id="catalog-search-panel" role="tabpanel" aria-labelledby="catalog-search-tab">
      <Input
        label="Buscar partida"
        type="search"
        autoFocus
        placeholder="Ej. alicatado baño, FON-010…"
        value={search}
        onChange={e => setSearch(e.target.value)}
        aria-describedby="catalog-search-help"
      />
      <p id="catalog-search-help" className="catalog-search-help">
        Busca por referencia, trabajo, material o categoría. Mostramos los 12 resultados más relevantes.
      </p>
      <p className="catalog-search-status" role="status">
        {search.trim() ? `${resultCount} ${resultCount === 1 ? "resultado" : "resultados"}` : "Escribe para buscar o utiliza una plantilla rápida."}
      </p>
      {!search.trim() && (favorites.length > 0 || recent.length > 0) && <section className="catalog-shortcuts" aria-label="Accesos rápidos del catálogo">
        {favorites.length > 0 && <CatalogShortcutGroup title="Favoritas" items={favorites} favorites={favoriteRefs} onPick={pick} onToggleFavorite={toggleFavorite} />}
        {recent.length > 0 && <CatalogShortcutGroup title="Usadas recientemente" items={recent} favorites={favoriteRefs} onPick={pick} onToggleFavorite={toggleFavorite} />}
        <small>Guardadas únicamente en este dispositivo.</small>
      </section>}
      <CatalogLoadState loading={loading} error={error} reload={async () => { if (search.trim()) setSearch(value => `${value} `); }} />
      {results.map(cat => (
        <section key={cat.categoria} className="catalog-results-group">
          <header className="catalog-category-header">
            <h4>{cat.categoria}</h4>
          </header>

          <ul>
            {cat.items.map(item => (
              <li className="catalog-item" key={item.ref}>
                <div className="catalog-item__description">
                  <code>{item.ref}</code>
                  <span>{item.descripcion}</span>
                </div>
                <div className="catalog-item__actions">
                  <Badge color="#60a5fa">{item.iva}% IVA</Badge>
                  <span className="catalog-item__price">
                    {formatMoney(item.precio)} <small>/ {item.unidad}</small>
                  </span>
                  <button type="button" className="catalog-favorite" aria-label={`${favoriteRefs.includes(item.ref) ? "Quitar de" : "Añadir a"} favoritas: ${item.ref}`} aria-pressed={favoriteRefs.includes(item.ref)} onClick={() => toggleFavorite(item.ref)}>{favoriteRefs.includes(item.ref) ? "★" : "☆"}</button>
                  <Button small aria-label={`Añadir ${item.ref}: ${item.descripcion}`} onClick={() => pick(item, cat.categoria)}>+ Añadir</Button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}

      {search.trim() && !loading && !error && results.length === 0 && (
        <p className="catalog-search-empty">Ningún ítem coincide con "{search}".</p>
      )}
      </div>}
      {mode === "browse" && <div id="catalog-browse-panel" role="tabpanel" aria-labelledby="catalog-browse-tab" className="catalog-browse">
        <header>
          <div><strong>Catálogo por categorías</strong><p>Abre una categoría para consultar sus partidas verificadas.</p></div>
          {browseTotal > 0 && <span>{browseLoaded} de {browseTotal}</span>}
        </header>
        <CatalogLoadState loading={browseLoading && browseLoaded === 0} error={browseError} reload={() => loadBrowsePage(browseRequestedPage)} />
        {browseCategories.map(category => <details className="catalog-browse-category" key={category.categoria}>
          <summary><span>{category.categoria}</span><small>{category.items.length} {category.items.length === 1 ? "partida" : "partidas"}</small></summary>
          <ul>
            {category.items.map(item => <li className="catalog-item" key={item.ref}>
              <div className="catalog-item__description"><code>{item.ref}</code><span>{item.descripcion}</span></div>
              <div className="catalog-item__actions">
                <Badge color="#60a5fa">{item.iva}% IVA</Badge>
                <span className="catalog-item__price">{formatMoney(item.precio)} <small>/ {item.unidad}</small></span>
                <button type="button" className="catalog-favorite" aria-label={`${favoriteRefs.includes(item.ref) ? "Quitar de" : "Añadir a"} favoritas: ${item.ref}`} aria-pressed={favoriteRefs.includes(item.ref)} onClick={() => toggleFavorite(item.ref)}>{favoriteRefs.includes(item.ref) ? "★" : "☆"}</button>
                <Button small aria-label={`Añadir ${item.ref}: ${item.descripcion}`} onClick={() => pick(item, category.categoria)}>+ Añadir</Button>
              </div>
            </li>)}
          </ul>
        </details>)}
        {browsePage + 1 < browsePages && <Button variant="ghost" loading={browseLoading} onClick={() => void loadBrowsePage(browsePage + 1)}>Mostrar {Math.min(50, browseTotal - browseLoaded)} más</Button>}
        {!browseLoading && !browseError && browseTotal === 0 && <p className="catalog-search-empty">No hay partidas verificadas disponibles.</p>}
      </div>}
      {mode === "template" && <div id="catalog-template-panel" role="tabpanel" aria-labelledby="catalog-template-tab">
      <section className="catalog-templates" aria-labelledby="catalog-templates-title">
        <div>
          <strong id="catalog-templates-title">Plantillas rápidas</strong>
          <p>Elige un tipo de trabajo y completa únicamente las mediciones que necesita.</p>
        </div>
        <div className="catalog-template-selector" role="group" aria-label="Tipos de plantilla">
          {ESTIMATE_TEMPLATES.map(template => <button
            type="button"
            key={template.id}
            className={selectedTemplateId === template.id ? "catalog-template-option catalog-template-option--selected" : "catalog-template-option"}
            aria-pressed={selectedTemplateId === template.id}
            disabled={templateLoading}
            onClick={() => selectTemplate(template)}
          >
            <strong>{template.name}</strong>
            <span>{template.description}</span>
            <small>{template.measurements.length} {template.measurements.length === 1 ? "medición" : "mediciones"}</small>
          </button>)}
        </div>
        {selectedTemplate && <div className="catalog-template-form" aria-labelledby="selected-template-title">
          <header><div><span>Paso 2 · Mediciones</span><strong id="selected-template-title">{selectedTemplate.name}</strong></div><small>Los campos con * son obligatorios. Puedes usar coma o punto decimal.</small></header>
          <div className="catalog-template-measurements">
            {selectedTemplate.measurements.map(field => {
              const invalid = templateAttempted && invalidMeasurements.includes(field);
              return <label key={field.key}>
                <span>{field.label}{field.required ? " *" : " (opcional)"}</span>
                <span className="catalog-template-input"><input
                  type="text"
                  inputMode="decimal"
                  autoComplete="off"
                  value={measurements[field.key]}
                  aria-invalid={invalid}
                  aria-describedby={`template-help-${field.key}`}
                  onChange={event => setMeasurements(current => ({ ...current, [field.key]: event.target.value }))}
                /><b>{field.unit}</b></span>
                <small id={`template-help-${field.key}`}>{invalid ? "Introduce una medida mayor que cero con un máximo de dos decimales." : field.help}</small>
              </label>;
            })}
          </div>
          <div className="catalog-template-summary" role="status">
            <span>{templateLoading ? "Comprobando partidas verificadas…" : `${selectedExpected.length - missingCatalogItems} de ${selectedExpected.length} partidas verificadas disponibles`}</span>
            {!templateLoading && missingCatalogItems > 0 && <strong>No se puede usar: faltan {missingCatalogItems} partidas verificadas en el catálogo.</strong>}
          </div>
          <Button onClick={importSelectedTemplate} disabled={templateLoading || missingCatalogItems > 0}>Añadir plantilla al presupuesto</Button>
        </div>}
      </section>
      <CatalogLoadState loading={templateLoading} error={templateError} reload={loadTemplates} />
      </div>}
    </div>
  );
}

function CatalogShortcutGroup({ title, items, favorites, onPick, onToggleFavorite }: {
  title: string;
  items: Array<{ categoria: string; item: CatalogItem }>;
  favorites: string[];
  onPick: (item: CatalogItem, categoria: string) => void;
  onToggleFavorite: (reference: string) => void;
}) {
  return <div className="catalog-shortcuts__group">
    <strong>{title}</strong>
    <div>{items.map(({ categoria, item }) => <span key={item.ref} className="catalog-shortcut">
      <button type="button" className="catalog-shortcut__add" onClick={() => onPick(item, categoria)} title={item.descripcion}>+ {item.ref}</button>
      <button type="button" className="catalog-favorite" aria-label={`${favorites.includes(item.ref) ? "Quitar de" : "Añadir a"} favoritas: ${item.ref}`} aria-pressed={favorites.includes(item.ref)} onClick={() => onToggleFavorite(item.ref)}>{favorites.includes(item.ref) ? "★" : "☆"}</button>
    </span>)}</div>
  </div>;
}
