/**
 * Catalog — static price list for populating budget line items.
 *
 * This is pure data; no API call required. In production this would be
 * an editable admin table persisted in the database — but for now it's
 * a constant extracted from the original 59-item catalogue.
 */

export interface CatalogItem {
  ref: string;          // REF code shown in budget PDFs
  descripcion: string;
  unidad: string;
  precio: number;       // EUR, excl IVA
  iva: number;          // percentage
}

export interface CatalogCategory {
  categoria: string;
  items: CatalogItem[];
}

// Subset of the original 16-category × 59-item catalogue. Full list ships
// alongside the admin UI; kept short here for brevity.
export const CATALOG: CatalogCategory[] = [
  {
    categoria: "Demolición",
    items: [
      { ref: "DEM-001", descripcion: "Derribo de tabique de ladrillo (por m²)", unidad: "m²",     precio: 22,    iva: 21 },
      { ref: "DEM-002", descripcion: "Retirada de escombros a vertedero",       unidad: "m³",     precio: 95,    iva: 21 },
      { ref: "DEM-003", descripcion: "Vaciado completo de vivienda",            unidad: "global", precio: 3200,  iva: 21 },
    ],
  },
  {
    categoria: "Electricidad",
    items: [
      { ref: "ELE-001", descripcion: "Punto de luz completo",              unidad: "ud",     precio: 85,   iva: 21 },
      { ref: "ELE-002", descripcion: "Toma de corriente Schuko",           unidad: "ud",     precio: 35,   iva: 21 },
      { ref: "ELE-003", descripcion: "Instalación eléctrica completa 80m²", unidad: "global", precio: 6500, iva: 21 },
      { ref: "ELE-004", descripcion: "Cuadro eléctrico automático 12 circuitos", unidad: "ud", precio: 480, iva: 21 },
    ],
  },
  {
    categoria: "Fontanería",
    items: [
      { ref: "FON-001", descripcion: "Renovación fontanería baño completo", unidad: "ud",  precio: 1800, iva: 21 },
      { ref: "FON-002", descripcion: "Cambio de bajante vertical",          unidad: "ml",  precio: 120,  iva: 21 },
      { ref: "FON-003", descripcion: "Instalación caldera de gas",          unidad: "ud",  precio: 2400, iva: 21 },
    ],
  },
  {
    categoria: "Albañilería",
    items: [
      { ref: "ALB-001", descripcion: "Tabique pladur 10cm (por m²)",             unidad: "m²", precio: 42,  iva: 21 },
      { ref: "ALB-002", descripcion: "Alicatado cerámico (por m², gama media)", unidad: "m²", precio: 58,  iva: 21 },
      { ref: "ALB-003", descripcion: "Solado gres porcelánico (por m²)",        unidad: "m²", precio: 68,  iva: 21 },
    ],
  },
  {
    categoria: "Pintura",
    items: [
      { ref: "PIN-001", descripcion: "Pintura plástica 2 manos (por m²)", unidad: "m²", precio: 12, iva: 21 },
      { ref: "PIN-002", descripcion: "Gotelé retirada + alisado (por m²)", unidad: "m²", precio: 18, iva: 21 },
    ],
  },
  {
    categoria: "Carpintería",
    items: [
      { ref: "CAR-001", descripcion: "Puerta interior lacada completa",      unidad: "ud",     precio: 320,  iva: 21 },
      { ref: "CAR-002", descripcion: "Armario empotrado a medida (por ml)", unidad: "ml",     precio: 520,  iva: 21 },
      { ref: "CAR-003", descripcion: "Cocina a medida completa",              unidad: "global", precio: 9500, iva: 21 },
    ],
  },
];

// Flattened lookup by REF — O(1) access in budget line editor
const _catalogByRef = new Map<string, CatalogItem>();
CATALOG.forEach(c => c.items.forEach(i => _catalogByRef.set(i.ref, i)));

export function findCatalogItem(ref: string): CatalogItem | undefined {
  return _catalogByRef.get(ref);
}
