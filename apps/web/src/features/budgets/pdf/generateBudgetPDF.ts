/**
 * PDF generator — extracted from the monolithic generatePresupuestoPDF.
 *
 * Architectural notes:
 *   - Pure function of its inputs; no React, no DOM queries
 *   - jsPDF loaded lazily (first call fetches from CDN, subsequent calls reuse)
 *   - Company branding is INJECTED via CompanyBranding, so this is reusable
 *     for any reforma company — not hardcoded to ReformaPro
 *   - Renders IVA tramos (mixed rates) correctly
 *   - Returns the filename produced; does NOT trigger download itself so tests
 *     can inspect the generated Uint8Array
 */

import { calculateBudget } from "@reformapro/domain/services";
import { BudgetLine, Budget } from "@reformapro/domain/entities";
import { IVARate, Money, Percentage } from "@reformapro/domain/value-objects";
import { BudgetDTO } from "@/features/budgets/api/budgets.api";

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────
export interface CompanyBranding {
  name: string;
  slogan?: string;
  address: string;
  cif: string;
  phone?: string;
  email?: string;
  web?: string;
  /** RGB tuples for jsPDF setFillColor/setTextColor */
  colors?: {
    gold?:  [number, number, number];
    dark?:  [number, number, number];
    gray?:  [number, number, number];
    lgray?: [number, number, number];
  };
}

export interface PDFContext {
  budget:      BudgetDTO;
  clientName:  string;
  projectName: string;
  branding:    CompanyBranding;
}

// ─────────────────────────────────────────────────────────────
// jsPDF lazy loader (CDN) — Promise singleton
// ─────────────────────────────────────────────────────────────
type JsPDFCtor = new (opts: { orientation: string; unit: string; format: string }) => unknown;
interface Window { jspdf?: { jsPDF: JsPDFCtor } }

let _jsPDFPromise: Promise<JsPDFCtor> | null = null;

function loadJsPDF(): Promise<JsPDFCtor> {
  if (_jsPDFPromise) return _jsPDFPromise;
  _jsPDFPromise = new Promise<JsPDFCtor>((resolve, reject) => {
    const w = window as Window;
    if (w.jspdf?.jsPDF) { resolve(w.jspdf.jsPDF); return; }
    const s = document.createElement("script");
    s.src = "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js";
    s.onload = () => {
      const ctor = (window as Window).jspdf?.jsPDF;
      if (!ctor) { reject(new Error("jsPDF no expuesto en window.jspdf")); return; }
      resolve(ctor);
    };
    s.onerror = () => reject(new Error("No se pudo cargar jsPDF"));
    document.head.appendChild(s);
  });
  return _jsPDFPromise;
}

// ─────────────────────────────────────────────────────────────
// Default branding (replace per-tenant in multi-tenant deploys)
// ─────────────────────────────────────────────────────────────
export const DEFAULT_BRANDING: CompanyBranding = {
  name:   "Hogaria",
  slogan: "GESTIÓN DE REFORMAS Y OBRA",
  address: "C/ Mayor 1, 28001 Madrid",
  cif:    "B12345678",
  phone:  "+34 910 000 000",
  email:  "info@hogaria.es",
  web:    "www.hogaria.es",
  colors: {
    gold:  [200, 169, 110],
    dark:  [15,  15,  11],
    gray:  [100, 100, 95],
    lgray: [230, 228, 222],
  },
};

// ─────────────────────────────────────────────────────────────
// Helpers (pure)
// ─────────────────────────────────────────────────────────────
const fmtPDF = (n: number) => new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(n);
const fmtDate = (iso: string | null) => iso ? new Date(iso).toLocaleDateString("es-ES") : "—";

function toDomainLines(dto: BudgetDTO["partidas"]): BudgetLine[] {
  return dto.map(p => new BudgetLine(
    p.id, p.categoria, p.descripcion, p.cantidad, p.unidad,
    Money.of(p.precioUnit),
    Percentage.of(p.descuento),
    p.iva != null ? IVARate.of(p.iva) : null,
    p.ref ?? undefined, p.nota ?? undefined,
  ));
}

// ─────────────────────────────────────────────────────────────
// Public API: generate & trigger download
// ─────────────────────────────────────────────────────────────
export async function generateBudgetPDF(ctx: PDFContext): Promise<string> {
  const bytes = await renderBudgetPDF(ctx);
  const filename = `Presupuesto_${ctx.budget.referencia || ctx.budget.id}.pdf`;
  triggerDownload(bytes, filename);
  return filename;
}

// Returns Uint8Array so tests can inspect without hitting the DOM.
export async function renderBudgetPDF(ctx: PDFContext): Promise<Uint8Array> {
  const JsPDF = await loadJsPDF();
  // Using `any` locally: jsPDF's types aren't bundled with the UMD CDN version.
  // All usage is contained in this file; no other code sees these untyped calls.
  const doc = new (JsPDF as never as { new (o: unknown): any })({ orientation: "portrait", unit: "mm", format: "a4" });

  const W = 210, H = 297;
  const ML = 18, MR = W - 18;
  const bW = (MR - ML) / 4;
  const { GOLD, DARK, GRAY, LGRAY, WHITE } = resolveColors(ctx.branding);

  const { budget, clientName, projectName, branding } = ctx;
  const lines  = toDomainLines(budget.partidas);
  const totals = calculateBudget(lines, IVARate.of(budget.ivaDefault));

  // ── HEADER ────────────────────────────────────────────────
  doc.setFillColor(...DARK); doc.rect(0, 0, W, 38, "F");
  doc.setFont("helvetica", "bold"); doc.setFontSize(22);
  doc.setTextColor(...WHITE); doc.text(branding.name.replace(/Pro$/, ""), ML, 16);
  doc.setTextColor(...GOLD);
  const suffix = branding.name.endsWith("Pro") ? "Pro" : "";
  if (suffix) doc.text(suffix, ML + doc.getTextWidth(branding.name.replace(/Pro$/, "")) + 1, 16);

  doc.setFont("helvetica", "normal"); doc.setFontSize(7.5);
  doc.setTextColor(...LGRAY); doc.text(branding.slogan ?? "", ML, 22);

  // Company right column
  const rightX = MR;
  doc.setTextColor(...WHITE); doc.setFontSize(8);
  [
    `${branding.name} — CIF ${branding.cif}`,
    branding.address,
    [branding.phone, branding.email].filter(Boolean).join(" · "),
  ].forEach((line, i) => { doc.text(line, rightX, 11 + i * 4, { align: "right" }); });

  // ── TITLE BLOCK ───────────────────────────────────────────
  let y = 50;
  doc.setTextColor(...DARK); doc.setFont("helvetica", "bold"); doc.setFontSize(16);
  doc.text("PRESUPUESTO", ML, y);
  doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(...GRAY);
  doc.text(budget.referencia || `P-${budget.id}`, ML, y + 6);

  // Metadata table
  y += 14;
  metaBox(doc, "Fecha emisión", fmtDate(budget.fechaCreacion), ML,            bW, y, GRAY, DARK);
  metaBox(doc, "Fecha envío",   fmtDate(budget.fechaEnvio),    ML + bW,       bW, y, GRAY, DARK);
  metaBox(doc, "Validez",       `${budget.validezDias} días`,  ML + bW * 2,   bW, y, GRAY, DARK);
  metaBox(doc, "IVA base",      `${budget.ivaDefault}%`,       ML + bW * 3,   bW, y, GRAY, DARK);

  // ── CLIENT / PROJECT ──────────────────────────────────────
  y += 22;
  doc.setFillColor(...LGRAY); doc.rect(ML, y, MR - ML, 18, "F");
  doc.setFont("helvetica", "bold"); doc.setFontSize(8); doc.setTextColor(...GRAY);
  doc.text("CLIENTE",    ML + 3, y + 5);
  doc.text("PROYECTO",   ML + (MR - ML) / 2 + 3, y + 5);
  doc.setFont("helvetica", "normal"); doc.setFontSize(10); doc.setTextColor(...DARK);
  doc.text(clientName,   ML + 3, y + 12);
  doc.text(projectName,  ML + (MR - ML) / 2 + 3, y + 12);

  // ── LINE ITEMS TABLE ──────────────────────────────────────
  y += 26;
  const cols = [
    { label: "CONCEPTO",    x: ML,           w: 78, align: "left"  as const },
    { label: "CANT.",       x: ML + 80,      w: 16, align: "right" as const },
    { label: "PRECIO",      x: ML + 98,      w: 22, align: "right" as const },
    { label: "DTO.",        x: ML + 122,     w: 14, align: "right" as const },
    { label: "IVA",         x: ML + 138,     w: 12, align: "right" as const },
    { label: "SUBTOTAL",    x: ML + 152,     w: MR - (ML + 152), align: "right" as const },
  ];
  doc.setFillColor(...DARK); doc.rect(ML, y, MR - ML, 8, "F");
  doc.setFont("helvetica", "bold"); doc.setFontSize(7); doc.setTextColor(...WHITE);
  cols.forEach(c => doc.text(c.label, c.align === "right" ? c.x + c.w - 2 : c.x + 2, y + 5.5, { align: c.align }));

  y += 12;
  doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(...DARK);

  // Cache columns by name so we don't index a potentially-sparse array repeatedly.
  // Using `!` is safe — the array is constructed locally above with all six columns.
  const [colConcept, colCant, colPrecio, colDto, colIva, colSub] = cols as [
    typeof cols[0], typeof cols[0], typeof cols[0], typeof cols[0], typeof cols[0], typeof cols[0]
  ];

  for (const p of lines) {
    // Page break: reserve 80mm for totals/footer
    if (y > H - 80) {
      addPageFooter(doc, branding, W, H, GRAY);
      doc.addPage();
      y = MT_TOP;
    }
    const baseAmount = p.base.amount;
    const refLabel = p.ref ? `[${p.ref}] ` : "";
    const descLines = doc.splitTextToSize(`${refLabel}${p.categoria} — ${p.descripcion}`, colConcept.w - 2);
    descLines.forEach((ln: string, i: number) => doc.text(ln, colConcept.x + 2, y + i * 4));
    doc.text(String(p.cantidad),       colCant.x   + colCant.w   - 2, y, { align: "right" });
    doc.text(fmtPDF(p.precioUnit.amount), colPrecio.x + colPrecio.w - 2, y, { align: "right" });
    doc.text(p.descuento.value ? `${p.descuento.value}%` : "—", colDto.x + colDto.w - 2, y, { align: "right" });
    const rate = p.effectiveIVA(IVARate.of(budget.ivaDefault)).value;
    doc.text(`${rate}%`,               colIva.x + colIva.w - 2, y, { align: "right" });
    doc.text(fmtPDF(baseAmount),       colSub.x + colSub.w - 2, y, { align: "right" });
    y += Math.max(6, descLines.length * 4 + 2);

    if (p.nota) {
      doc.setFont("helvetica", "italic"); doc.setFontSize(8); doc.setTextColor(...GRAY);
      const noteLines = doc.splitTextToSize(`↳ ${p.nota}`, colConcept.w + colCant.w - 4);
      noteLines.forEach((ln: string, i: number) => doc.text(ln, colConcept.x + 4, y + i * 3.5));
      y += noteLines.length * 3.5 + 1;
      doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(...DARK);
    }
  }

  // ── TOTALS ────────────────────────────────────────────────
  y += 6;
  doc.setDrawColor(...GRAY); doc.setLineWidth(0.2);
  doc.line(MR - 80, y, MR, y); y += 6;

  const totalRow = (label: string, value: string, bold = false) => {
    doc.setFont("helvetica", bold ? "bold" : "normal"); doc.setFontSize(bold ? 11 : 9);
    doc.setTextColor(...(bold ? DARK : GRAY));
    doc.text(label,  MR - 78, y);
    doc.text(value,  MR,       y, { align: "right" });
    y += bold ? 7 : 5;
  };

  totalRow("Subtotal (sin IVA)", fmtPDF(totals.subtotal.amount));

  if (totals.tramos.size > 1) {
    // IVA tramos — iterate deterministically
    Array.from(totals.tramos.entries()).sort((a, b) => a[0] - b[0]).forEach(([rate, { base, iva }]) => {
      totalRow(`IVA ${rate}% sobre ${fmtPDF(base.amount)}`, fmtPDF(iva.amount));
    });
  } else if (totals.tramos.size === 1) {
    const first = Array.from(totals.tramos.entries())[0];
    if (first) {
      const [rate, { iva }] = first;
      totalRow(`IVA ${rate}%`, fmtPDF(iva.amount));
    }
  }

  y += 2;
  doc.setFillColor(...DARK); doc.rect(MR - 80, y, 80, 10, "F");
  doc.setFont("helvetica", "bold"); doc.setFontSize(12); doc.setTextColor(...WHITE);
  doc.text("TOTAL",            MR - 78, y + 7);
  doc.text(fmtPDF(totals.total.amount), MR - 2, y + 7, { align: "right" });
  y += 18;

  // ── TERMS & CONDITIONS ────────────────────────────────────
  if (budget.condicionesPago || budget.garantia || budget.notas) {
    if (y > H - 60) { doc.addPage(); y = MT_TOP; }
    doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.setTextColor(...DARK);
    doc.text("CONDICIONES", ML, y); y += 5;
    doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor(...GRAY);
    if (budget.condicionesPago) {
      const ls = doc.splitTextToSize(`Pago: ${budget.condicionesPago}`, MR - ML);
      ls.forEach((ln: string) => { doc.text(ln, ML, y); y += 4; });
    }
    if (budget.garantia) {
      const ls = doc.splitTextToSize(`Garantía: ${budget.garantia}`, MR - ML);
      ls.forEach((ln: string) => { doc.text(ln, ML, y); y += 4; });
    }
    if (budget.notas) {
      const ls = doc.splitTextToSize(`Notas: ${budget.notas}`, MR - ML);
      ls.forEach((ln: string) => { doc.text(ln, ML, y); y += 4; });
    }
  }

  // ── SIGNATURE BLOCK (if signed) ───────────────────────────
  if (budget.firma) {
    if (y > H - 40) { doc.addPage(); y = MT_TOP; }
    y += 8;
    doc.setDrawColor(...GOLD); doc.setLineWidth(0.4);
    doc.rect(ML, y, MR - ML, 28);
    doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.setTextColor(...GOLD);
    doc.text("✓ DOCUMENTO FIRMADO ELECTRÓNICAMENTE", ML + 3, y + 5);
    doc.setFont("helvetica", "normal"); doc.setFontSize(7); doc.setTextColor(...DARK);
    const f = budget.firma as { firmante: string; firmanteEmail: string; fechaFirma: string; ip: string; hash: string; token: string };
    doc.text(`Firmante: ${f.firmante} (${f.firmanteEmail})`, ML + 3, y + 11);
    doc.text(`Fecha: ${new Date(f.fechaFirma).toLocaleString("es-ES")}`, ML + 3, y + 15);
    doc.text(`IP: ${f.ip}`,     ML + 3, y + 19);
    doc.setFont("courier", "normal"); doc.setFontSize(6);
    doc.text(`Hash: ${f.hash}`, ML + 3, y + 23);
    doc.text(`Token: ${f.token}`, ML + 3, y + 26);
  }

  addPageFooter(doc, branding, W, H, GRAY);
  return doc.output("arraybuffer") as Uint8Array;
}

// ─────────────────────────────────────────────────────────────
// Utilities (not exported; internal)
// ─────────────────────────────────────────────────────────────
const MT_TOP = 20;

function metaBox(
  doc: any, label: string, value: string, x: number, w: number, y: number,
  gray: [number, number, number], dark: [number, number, number]
): void {
  doc.setFont("helvetica", "bold"); doc.setFontSize(7); doc.setTextColor(...gray);
  doc.text(label.toUpperCase(), x + 2, y + 4);
  doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(...dark);
  doc.text(value, x + 2, y + 10);
}

function addPageFooter(
  doc: any, branding: CompanyBranding, W: number, H: number, gray: [number, number, number],
): void {
  doc.setFont("helvetica", "normal"); doc.setFontSize(7); doc.setTextColor(...gray);
  const page = doc.internal.getCurrentPageInfo().pageNumber;
  doc.text(`${branding.name} · ${branding.cif}`, 18, H - 8);
  doc.text(`Página ${page}`, W - 18, H - 8, { align: "right" });
}

function resolveColors(b: CompanyBranding) {
  const c = b.colors ?? {};
  return {
    GOLD:  c.gold  ?? [200, 169, 110] as [number, number, number],
    DARK:  c.dark  ?? [15,  15,  11 ] as [number, number, number],
    GRAY:  c.gray  ?? [100, 100, 95 ] as [number, number, number],
    LGRAY: c.lgray ?? [230, 228, 222] as [number, number, number],
    WHITE: [255, 255, 255]            as [number, number, number],
  };
}

function triggerDownload(bytes: Uint8Array, filename: string): void {
  // Cast: Uint8Array<ArrayBufferLike> isn't assignable to BlobPart in newer DOM
  // typings, but the runtime contract (BufferSource) is fully satisfied.
  const blob = new Blob([bytes as BlobPart], { type: "application/pdf" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  // Revoke after the click has been processed
  setTimeout(() => URL.revokeObjectURL(url), 100);
}
