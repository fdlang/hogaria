/**
 * Base catalogue for residential refurbishments in Comunidad de Madrid.
 *
 * Prices are sale references, excluding VAT, for a coordinated medium-high
 * quality refurbishment. They are intentionally editable per estimate: access,
 * measurements, existing condition and selected materials always take priority.
 * Legacy import awaiting item-by-item commercial review. Seeded entries are
 * never selectable until an administrator validates their evidence and term.
 */
export interface CatalogItem {
  ref: string;
  descripcion: string;
  unidad: string;
  precio: number;
  iva: number;
  costeUnitario?: number | null;
  searchTerms?: string[];
  active?: boolean;
  itemType?: "simple" | "composite";
  laborCost?: number | null;
  materialCost?: number | null;
  auxiliaryCost?: number | null;
  sourceName?: string | null;
  sourceUrl?: string | null;
  priceDate?: string | null;
  validFrom?: string | null;
  validUntil?: string | null;
  reviewStatus?: "pending_review" | "verified" | "archived";
}

export interface CatalogCategory { categoria: string; items: CatalogItem[]; }

export const CATALOG: CatalogCategory[] = [
  { categoria: "Previos y gestión", items: [
    { ref: "PRE-001", descripcion: "Protección de zonas comunes y vivienda", unidad: "global", precio: 380, iva: 21 },
    { ref: "PRE-002", descripcion: "Implantación, medios auxiliares y señalización", unidad: "global", precio: 650, iva: 21 },
    { ref: "PRE-003", descripcion: "Coordinación y seguimiento de obra", unidad: "mes", precio: 520, iva: 21 },
    { ref: "PRE-004", descripcion: "Contenedor y gestión de residuos", unidad: "ud", precio: 420, iva: 21 },
    { ref: "PRE-005", descripcion: "Limpieza final profesional de obra", unidad: "m²", precio: 7.5, iva: 21 },
  ] },
  { categoria: "Demoliciones", items: [
    { ref: "DEM-001", descripcion: "Demolición de tabique de ladrillo con retirada", unidad: "m²", precio: 32, iva: 21 },
    { ref: "DEM-002", descripcion: "Desmontaje de falso techo de escayola", unidad: "m²", precio: 16, iva: 21 },
    { ref: "DEM-003", descripcion: "Levantado de pavimento y recrecido", unidad: "m²", precio: 24, iva: 21 },
    { ref: "DEM-004", descripcion: "Picado de alicatado existente", unidad: "m²", precio: 22, iva: 21 },
    { ref: "DEM-005", descripcion: "Desmontaje de sanitarios y grifería", unidad: "ud", precio: 95, iva: 21 },
    { ref: "DEM-006", descripcion: "Vaciado integral de vivienda", unidad: "m²", precio: 29, iva: 21 },
    { ref: "DEM-008", descripcion: "Desmontaje de mobiliario de cocina y encimera, con retirada ordenada", unidad: "ml", precio: 0, iva: 21, active: false, reviewStatus: "pending_review", laborCost: 62.49, sourceName: "CYPE DSC020", sourceUrl: "https://generadordeprecios.info/rehabilitacion/Demoliciones/Equipamiento/Cocinas/DSC020_Desmontaje_de_conjunto_de_mobiliari.html", priceDate: "2026-10-10", searchTerms: ["retirada cocina", "desmontaje muebles"] },
  ] },
  { categoria: "Albañilería y pladur", items: [
    { ref: "ALB-001", descripcion: "Tabique de placa de yeso laminado con aislamiento", unidad: "m²", precio: 58, iva: 21 },
    { ref: "ALB-002", descripcion: "Trasdosado directo con aislamiento", unidad: "m²", precio: 47, iva: 21 },
    { ref: "ALB-003", descripcion: "Falso techo continuo de placa de yeso", unidad: "m²", precio: 45, iva: 21 },
    { ref: "ALB-004", descripcion: "Formación de hornacina impermeabilizada", unidad: "ud", precio: 240, iva: 21 },
    { ref: "ALB-005", descripcion: "Rozas, recibido y remates de instalaciones", unidad: "m²", precio: 19, iva: 21 },
    { ref: "ALB-006", descripcion: "Enfoscado y regularización de paramentos", unidad: "m²", precio: 26, iva: 21 },
    { ref: "ALB-007", descripcion: "Recrecido y nivelación de suelo", unidad: "m²", precio: 31, iva: 21 },
  ] },
  { categoria: "Fontanería", items: [
    { ref: "FON-001", descripcion: "Punto de agua fría y caliente empotrado", unidad: "ud", precio: 185, iva: 21 },
    { ref: "FON-002", descripcion: "Punto de desagüe en PVC insonorizado", unidad: "ud", precio: 155, iva: 21 },
    { ref: "FON-003", descripcion: "Renovación completa de fontanería de baño", unidad: "ud", precio: 1850, iva: 21 },
    { ref: "FON-004", descripcion: "Renovación completa de fontanería de cocina", unidad: "ud", precio: 1450, iva: 21 },
    { ref: "FON-005", descripcion: "Montaje de inodoro suspendido con bastidor", unidad: "ud", precio: 590, iva: 21 },
    { ref: "FON-006", descripcion: "Instalación de lavabo y grifería", unidad: "ud", precio: 285, iva: 21 },
    { ref: "FON-010", descripcion: "Recibido, nivelación y sellado de plato de ducha", unidad: "ud", precio: 0, iva: 21, active: false, reviewStatus: "pending_review", laborCost: 75.76, materialCost: 2.55, sourceName: "CYPE", sourceUrl: "https://generadordeprecios.info/rehabilitacion/Remates_y_ayudas/Recibidos/Aparatos_sanitarios/Recibido_de_plato_de_ducha.html", priceDate: "2026-10-10", searchTerms: ["instalar plato ducha", "colocar plato"] },
    { ref: "FON-011", descripcion: "Instalación y conexión de inodoro sobre preinstalación existente", unidad: "ud", precio: 0, iva: 21, active: false, reviewStatus: "pending_review", laborCost: 43.36, sourceName: "CYPE SAI005", sourceUrl: "https://generadordeprecios.info/rehabilitacion/Senalizacion_y_equipamiento/Aparatos_sanitarios/Inodoros/SAI005_Inodoro_con_tanque_bajo__de_porcela_0_2c15_0_1_0_1c4_0.html", priceDate: "2026-10-10", searchTerms: ["montaje inodoro", "colocar wc"] },
    { ref: "FON-012", descripcion: "Instalación y conexión de grifería de lavabo", unidad: "ud", precio: 0, iva: 21, active: false, reviewStatus: "pending_review", laborCost: 14.44, sourceName: "CYPE SGL020", sourceUrl: "https://generadordeprecios.info/rehabilitacion/Senalizacion_y_equipamiento/Griferias/Para_lavabos/Griferia_monomando_para_lavabo_0_2_0_0_0_0_0_2.html", priceDate: "2026-10-10", searchTerms: ["montaje grifo", "grifo lavabo"] },
  ] },
  { categoria: "Electricidad e iluminación", items: [
    { ref: "ELE-001", descripcion: "Punto de luz completo con mecanismo", unidad: "ud", precio: 105, iva: 21 },
    { ref: "ELE-002", descripcion: "Toma de corriente Schuko empotrada", unidad: "ud", precio: 62, iva: 21 },
    { ref: "ELE-003", descripcion: "Punto de datos RJ45 o TV", unidad: "ud", precio: 78, iva: 21 },
    { ref: "ELE-004", descripcion: "Cuadro eléctrico 12 circuitos con protecciones", unidad: "ud", precio: 780, iva: 21 },
    { ref: "ELE-005", descripcion: "Renovación instalación eléctrica de vivienda", unidad: "m²", precio: 78, iva: 21 },
    { ref: "ELE-006", descripcion: "Downlight LED empotrable instalado", unidad: "ud", precio: 68, iva: 21 },
    { ref: "ELE-007", descripcion: "Tira LED indirecta con perfil de aluminio", unidad: "ml", precio: 52, iva: 21 },
  ] },
  { categoria: "Climatización y ventilación", items: [
    { ref: "CLI-001", descripcion: "Preinstalación de aire acondicionado split", unidad: "ud", precio: 540, iva: 21 },
    { ref: "CLI-002", descripcion: "Instalación de split mural de hasta 3,5 kW", unidad: "ud", precio: 1150, iva: 21 },
    { ref: "CLI-003", descripcion: "Extractor de baño silencioso con conducto", unidad: "ud", precio: 245, iva: 21 },
    { ref: "CLI-004", descripcion: "Conducto flexible aislado para ventilación", unidad: "ml", precio: 34, iva: 21 },
    { ref: "CLI-005", descripcion: "Instalación y conexión de extractor sobre alimentación existente", unidad: "ud", precio: 0, iva: 21, active: false, reviewStatus: "pending_review", laborCost: 10.59, sourceName: "CYPE IVM014", sourceUrl: "https://generadordeprecios.info/rehabilitacion/calculaprecio.asp?Valor=2%7C0_0_0_0_0_0%7C1%7CIVM014%7Civm_014%3Ac3_0_590_5c11_0", priceDate: "2026-10-10", searchTerms: ["montaje extractor", "ventilador baño"] },
  ] },
  { categoria: "Revestimientos", items: [
    { ref: "REV-001", descripcion: "Alicatado porcelánico formato estándar", unidad: "m²", precio: 64, iva: 21 },
    { ref: "REV-002", descripcion: "Alicatado porcelánico gran formato", unidad: "m²", precio: 92, iva: 21 },
    { ref: "REV-003", descripcion: "Pavimento porcelánico con colocación", unidad: "m²", precio: 76, iva: 21 },
    { ref: "REV-004", descripcion: "Pavimento porcelánico gran formato", unidad: "m²", precio: 98, iva: 21 },
    { ref: "REV-005", descripcion: "Impermeabilización de zona húmeda", unidad: "m²", precio: 29, iva: 21 },
    { ref: "REV-006", descripcion: "Rodapié porcelánico colocado", unidad: "ml", precio: 16, iva: 21 },
  ] },
  { categoria: "Baño", items: [
    { ref: "BAN-001", descripcion: "Plato de ducha de carga mineral hasta 120 cm", unidad: "ud", precio: 690, iva: 21 },
    { ref: "BAN-002", descripcion: "Mampara fija o corredera de vidrio templado", unidad: "ud", precio: 950, iva: 21 },
    { ref: "BAN-003", descripcion: "Mueble de baño suspendido de 80 cm", unidad: "ud", precio: 790, iva: 21 },
    { ref: "BAN-004", descripcion: "Espejo retroiluminado con antivaho", unidad: "ud", precio: 420, iva: 21 },
    { ref: "BAN-005", descripcion: "Inodoro compacto con asiento amortiguado", unidad: "ud", precio: 520, iva: 21 },
    { ref: "BAN-006", descripcion: "Conjunto de ducha termostática", unidad: "ud", precio: 455, iva: 21 },
  ] },
  { categoria: "Cocina", items: [
    { ref: "COC-001", descripcion: "Mueble bajo de cocina modular", unidad: "ml", precio: 690, iva: 21 },
    { ref: "COC-002", descripcion: "Mueble alto de cocina modular", unidad: "ml", precio: 410, iva: 21 },
    { ref: "COC-003", descripcion: "Encimera de cuarzo compacto", unidad: "ml", precio: 430, iva: 21 },
    { ref: "COC-004", descripcion: "Frente de cocina porcelánico", unidad: "m²", precio: 95, iva: 21 },
    { ref: "COC-005", descripcion: "Montaje y ajuste de cocina", unidad: "global", precio: 980, iva: 21 },
  ] },
  { categoria: "Carpintería", items: [
    { ref: "CAR-001", descripcion: "Puerta interior lacada completa", unidad: "ud", precio: 465, iva: 21 },
    { ref: "CAR-002", descripcion: "Puerta corredera interior con casoneto", unidad: "ud", precio: 980, iva: 21 },
    { ref: "CAR-003", descripcion: "Armario empotrado a medida con interiores", unidad: "ml", precio: 890, iva: 21 },
    { ref: "CAR-004", descripcion: "Rodapié lacado blanco colocado", unidad: "ml", precio: 18, iva: 21 },
    { ref: "CAR-005", descripcion: "Ventana PVC oscilobatiente con doble vidrio", unidad: "m²", precio: 540, iva: 21 },
  ] },
  { categoria: "Pintura y acabados", items: [
    { ref: "PIN-001", descripcion: "Alisado y reparación de paramentos", unidad: "m²", precio: 19, iva: 21 },
    { ref: "PIN-002", descripcion: "Pintura plástica lavable, dos manos", unidad: "m²", precio: 15.5, iva: 21 },
    { ref: "PIN-003", descripcion: "Esmaltado de puertas o radiadores", unidad: "ud", precio: 82, iva: 21 },
    { ref: "PIN-004", descripcion: "Aplicación de pintura plástica sobre soporte de yeso ya preparado", unidad: "m²", precio: 0, iva: 21, active: false, reviewStatus: "pending_review", laborCost: 5.48, sourceName: "CYPE RIP030", sourceUrl: "https://generadordeprecios.info/rehabilitacion/Revestimientos_y_trasdosados/Pinturas_en_paramentos_interiores/Plasticas/RIP030_Pintura_plastica_sobre_paramento_in.html", priceDate: "2026-10-10", searchTerms: ["pintar pared", "pintura yeso"] },
    { ref: "PIN-005", descripcion: "Aplicación de esmalte al agua sobre madera preparada", unidad: "m²", precio: 0, iva: 21, active: false, reviewStatus: "pending_review", laborCost: 8.94, sourceName: "CYPE RME030", sourceUrl: "https://generadordeprecios.info/rehabilitacion/Revestimientos_y_trasdosados/RM_Pinturas_y_tratamientos_sobre_/Esmaltes/Esmalte_al_agua_para_madera.html", priceDate: "2026-10-10", searchTerms: ["esmaltar madera", "pintar carpintería"] },
  ] },
];
