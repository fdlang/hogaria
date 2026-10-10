/**
 * CatalogPicker — quick-add partidas from the price catalog.
 * Expands the 16 categories × 59 items into searchable rows.
 */

import { useMemo, useState } from "react";
import type { CatalogCategory, CatalogItem } from "./catalog";
import { Input, Button, Badge } from "@/shared/ui";
import { formatMoney } from "@/shared/lib/formatters";
import { ESTIMATE_TEMPLATES, type EstimateTemplate } from "@reformapro/domain";

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
  onPickItem:     (ref: string) => void;
  onImportCategory: (categoria: string, items: CatalogItem[]) => void;
  onImportTemplate: (items: TemplateCatalogItem[]) => void;
  catalog: CatalogCategory[];
}

export function CatalogPicker({ onPickItem, onImportCategory, onImportTemplate, catalog }: Props) {
  const [search, setSearch] = useState("");
  const [measurements, setMeasurements] = useState({ floorArea: "", wallArea: "", linearMetres: "" });
  const numericMeasurements = useMemo<TemplateMeasurements>(() => ({
    floorArea: Number(measurements.floorArea) || 0,
    wallArea: Number(measurements.wallArea) || 0,
    linearMetres: Number(measurements.linearMetres) || 0,
  }), [measurements]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return catalog;
    return catalog
      .map(c => ({ ...c, items: c.items.filter(i =>
        i.descripcion.toLowerCase().includes(q) ||
        i.searchTerms?.some(term => term.toLowerCase().includes(q)) ||
        i.ref.toLowerCase().includes(q) ||
        c.categoria.toLowerCase().includes(q)
      )}))
      .filter(c => c.items.length > 0);
  }, [catalog, search]);

  return (
    <div>
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
            const resolved = resolveCatalogTemplate(template, catalog, numericMeasurements);
            const needsFloor = template.items.some(item => item.measurement === "floorArea") && numericMeasurements.floorArea <= 0;
            const needsWall = template.items.some(item => item.measurement === "wallArea") && numericMeasurements.wallArea <= 0;
            const needsLinear = template.items.some(item => item.measurement === "linearMetres") && numericMeasurements.linearMetres <= 0;
            return <Button key={template.id} small variant="ghost" disabled={needsFloor || needsWall || needsLinear || resolved.length === 0} onClick={() => onImportTemplate(resolved)} title={template.description}>+ {template.name}</Button>;
          })}
        </div>
      </section>
      <Input
        label="Buscar en catálogo"
        placeholder="REF, descripción o categoría…"
        value={search}
        onChange={e => setSearch(e.target.value)}
      />

      {filtered.map(cat => (
        <section key={cat.categoria} style={{ marginBottom: 20 }}>
          <header className="catalog-category-header" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
            <h4 style={{ fontSize: 13, fontWeight: 700, color: "var(--copper-dark)" }}>{cat.categoria}</h4>
            <Button small variant="ghost" onClick={() => onImportCategory(cat.categoria, cat.items)}>
              + Importar categoría ({cat.items.length})
            </Button>
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
                  <Button small onClick={() => onPickItem(item.ref)}>+ Añadir</Button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}

      {filtered.length === 0 && (
        <p style={{ color: "#71685e", fontSize: 13, textAlign: "center", padding: 20 }}>
          Ningún ítem coincide con "{search}".
        </p>
      )}
    </div>
  );
}
