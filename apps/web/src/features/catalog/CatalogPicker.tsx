/**
 * CatalogPicker — quick-add partidas from the price catalog.
 * Search-first selector for verified catalog items.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CatalogCategory, CatalogItem } from "./catalog";
import { Input, Button, Badge } from "@/shared/ui";
import { formatMoney } from "@/shared/lib/formatters";
import { ESTIMATE_TEMPLATES, type EstimateTemplate } from "@reformapro/domain";
import { CatalogLoadState } from "./CatalogLoadState";

export type TemplateMeasurements = { floorArea: number; wallArea: number; linearMetres: number };
export type TemplateCatalogItem = { categoria: string; item: CatalogItem; cantidad: number };

export function resolveCatalogTemplate(template: EstimateTemplate, catalog: CatalogCategory[], measurements: TemplateMeasurements): TemplateCatalogItem[] {
  const items = new Map(catalog.flatMap(category => category.items.map(item => [item.ref, { categoria: category.categoria, item }] as const)));
  return template.items.flatMap(entry => {
    const found = items.get(entry.reference);
    if (!found) return [];
    const cantidad = entry.measurement ? measurements[entry.measurement] : entry.quantity;
    return cantidad > 0 ? [{ ...found, cantidad }] : [];
  });
}

interface Props {
  onPickItem: (item: CatalogItem, category: string) => void;
  onImportTemplate: (items: TemplateCatalogItem[]) => void;
  loadItems: (search: string, references?: string[]) => Promise<CatalogCategory[]>;
}

const templateReferences = [...new Set(ESTIMATE_TEMPLATES.flatMap(template => template.items.map(item => item.reference)))];

export function CatalogPicker({ onPickItem, onImportTemplate, loadItems }: Props) {
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<CatalogCategory[]>([]);
  const [templateCatalog, setTemplateCatalog] = useState<CatalogCategory[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const request = useRef(0);
  const [measurements, setMeasurements] = useState({ floorArea: "", wallArea: "", linearMetres: "" });
  const numericMeasurements = useMemo<TemplateMeasurements>(() => ({
    floorArea: Number(measurements.floorArea) || 0,
    wallArea: Number(measurements.wallArea) || 0,
    linearMetres: Number(measurements.linearMetres) || 0,
  }), [measurements]);

  const resultCount = results.reduce((total, category) => total + category.items.length, 0);

  const loadTemplates = useCallback(() => loadItems("", templateReferences).then(setTemplateCatalog).catch(() => setError("No se pudieron cargar las plantillas del catálogo.")), [loadItems]);
  useEffect(() => { void loadTemplates(); }, [loadItems]);
  useEffect(() => {
    const query = search.trim();
    if (!query) { setResults([]); setLoading(false); return; }
    const current = ++request.current;
    const timer = window.setTimeout(() => {
      setLoading(true); setError("");
      void loadItems(query).then(items => { if (request.current === current) setResults(items); })
        .catch(() => { if (request.current === current) setError("No se pudo buscar en el catálogo."); })
        .finally(() => { if (request.current === current) setLoading(false); });
    }, 250);
    return () => window.clearTimeout(timer);
  }, [loadItems, search]);

  return (
    <div>
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
      <section className="catalog-templates" aria-labelledby="catalog-templates-title">
        <div>
          <strong id="catalog-templates-title">Plantillas rápidas</strong>
          <p>Indica las medidas disponibles. Podrás revisar todas las cantidades antes de guardar.</p>
        </div>
        <div className="catalog-template-measurements">
          <label>Suelo (m²)<input type="number" min="0" step="0.01" value={measurements.floorArea} onChange={event => setMeasurements(current => ({ ...current, floorArea: event.target.value }))} /></label>
          <label>Paredes (m²)<input type="number" min="0" step="0.01" value={measurements.wallArea} onChange={event => setMeasurements(current => ({ ...current, wallArea: event.target.value }))} /></label>
          <label>Frente (ml)<input type="number" min="0" step="0.01" value={measurements.linearMetres} onChange={event => setMeasurements(current => ({ ...current, linearMetres: event.target.value }))} /></label>
        </div>
        <div className="catalog-template-actions">
          {ESTIMATE_TEMPLATES.map(template => {
            const resolved = resolveCatalogTemplate(template, templateCatalog, numericMeasurements);
            const needsFloor = template.items.some(item => item.measurement === "floorArea") && numericMeasurements.floorArea <= 0;
            const needsWall = template.items.some(item => item.measurement === "wallArea") && numericMeasurements.wallArea <= 0;
            const needsLinear = template.items.some(item => item.measurement === "linearMetres") && numericMeasurements.linearMetres <= 0;
            const incomplete = resolved.length !== template.items.length;
            const title = incomplete ? `${template.description} Faltan ${template.items.length - resolved.length} partidas verificadas.` : template.description;
            return <Button key={template.id} small variant="ghost" disabled={needsFloor || needsWall || needsLinear || resolved.length === 0 || incomplete} onClick={() => onImportTemplate(resolved)} title={title}>+ {template.name} ({resolved.length}/{template.items.length})</Button>;
          })}
        </div>
      </section>

      <CatalogLoadState loading={loading} error={error} reload={async () => { if (search.trim()) setSearch(value => `${value} `); else await loadTemplates(); }} />
      {results.map(cat => (
        <section key={cat.categoria} style={{ marginBottom: 20 }}>
          <header className="catalog-category-header" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
            <h4 style={{ fontSize: 13, fontWeight: 700, color: "var(--copper-dark)" }}>{cat.categoria}</h4>
          </header>

          <ul style={{ display: "flex", flexDirection: "column", gap: 6, listStyle: "none", padding: 0 }}>
            {cat.items.map(item => (
              <li className="catalog-item" key={item.ref}
                style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 10px", background: "#f8efe4", border: "1px solid #d8c4ad", borderRadius: 8 }}>
                <div className="catalog-item__description" style={{ display: "flex", alignItems: "center", gap: 10, flex: 1, minWidth: 0 }}>
                  <code style={{ fontSize: 12, background: "#fffaf4", color: "var(--copper-dark)", padding: "2px 6px", borderRadius: 4 }}>{item.ref}</code>
                  <span style={{ fontSize: 12, color: "#302d29", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.descripcion}</span>
                </div>
                <div className="catalog-item__actions" style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <Badge color="#60a5fa">{item.iva}% IVA</Badge>
                  <span style={{ fontSize: 13, fontWeight: 600, color: "#302d29" }}>
                    {formatMoney(item.precio)} <span style={{ color: "#71685e", fontSize: 12 }}>/ {item.unidad}</span>
                  </span>
                  <Button small aria-label={`Añadir ${item.ref}: ${item.descripcion}`} onClick={() => onPickItem(item, cat.categoria)}>+ Añadir</Button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}

      {search.trim() && !loading && !error && results.length === 0 && (
        <p style={{ color: "#71685e", fontSize: 13, textAlign: "center", padding: 20 }}>
          Ningún ítem coincide con "{search}".
        </p>
      )}
    </div>
  );
}
