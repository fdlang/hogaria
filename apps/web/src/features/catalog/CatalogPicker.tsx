/**
 * CatalogPicker — quick-add partidas from the price catalog.
 * Expands the 16 categories × 59 items into searchable rows.
 */

import { useMemo, useState } from "react";
import type { CatalogCategory, CatalogItem } from "./catalog";
import { Input, Button, Badge } from "@/shared/ui";
import { formatMoney } from "@/shared/lib/formatters";

interface Props {
  onPickItem:     (ref: string) => void;
  onImportCategory: (categoria: string, items: CatalogItem[]) => void;
  catalog: CatalogCategory[];
}

export function CatalogPicker({ onPickItem, onImportCategory, catalog }: Props) {
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return catalog;
    return catalog
      .map(c => ({ ...c, items: c.items.filter(i =>
        i.descripcion.toLowerCase().includes(q) ||
        i.ref.toLowerCase().includes(q) ||
        c.categoria.toLowerCase().includes(q)
      )}))
      .filter(c => c.items.length > 0);
  }, [catalog, search]);

  return (
    <div>
      <Input
        label="Buscar en catálogo"
        placeholder="REF, descripción o categoría…"
        value={search}
        onChange={e => setSearch(e.target.value)}
      />

      {filtered.map(cat => (
        <section key={cat.categoria} style={{ marginBottom: 20 }}>
          <header className="catalog-category-header" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
            <h4 style={{ fontSize: 13, fontWeight: 700, color: "#c17248" }}>{cat.categoria}</h4>
            <Button small variant="ghost" onClick={() => onImportCategory(cat.categoria, cat.items)}>
              + Importar categoría ({cat.items.length})
            </Button>
          </header>

          <ul style={{ display: "flex", flexDirection: "column", gap: 6, listStyle: "none", padding: 0 }}>
            {cat.items.map(item => (
              <li className="catalog-item" key={item.ref}
                style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 10px", background: "#f8efe4", border: "1px solid #d8c4ad", borderRadius: 8 }}>
                <div className="catalog-item__description" style={{ display: "flex", alignItems: "center", gap: 10, flex: 1, minWidth: 0 }}>
                  <code style={{ fontSize: 12, background: "#fffaf4", color: "#c17248", padding: "2px 6px", borderRadius: 4 }}>{item.ref}</code>
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
