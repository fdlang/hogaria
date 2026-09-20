import { PDFDocument, StandardFonts, rgb, type PDFPage } from "pdf-lib";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { ValidationError } from "@reformapro/domain/errors";
import { calculateEstimateLineTotals } from "@reformapro/domain";
import type {
  EstimateDocument,
  EstimatePdfRenderer,
} from "../../application/use-cases/estimate-document.use-cases.js";

async function brand() {
  for (const root of [process.cwd(), resolve(process.cwd(), "../..")]) {
    try {
      return await readFile(
        resolve(root, "apps/web/public/brand/hogaria-wordmark.png"),
      );
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
  throw new Error("No se encuentra el recurso de marca del PDF");
}
export class PdfEstimateRenderer implements EstimatePdfRenderer {
  constructor(private readonly logo: () => Promise<Uint8Array> = brand) {}
  async render(d: EstimateDocument) {
    const p = d.propuesta;
    if (!p) throw new ValidationError("No hay propuesta publicada");
    if (p.partidas.length > 1000 || JSON.stringify(p).length > 500_000)
      throw new ValidationError(
        "El presupuesto supera el tamaño admitido para PDF",
      );
    const pdf = await PDFDocument.create();
    pdf.setTitle(`Presupuesto ${d.numero} · v${d.versionActual}`);
    pdf.setAuthor("Hogaria");
    const issued = new Date(p.enviadoAt ?? d.createdAt);
    pdf.setCreationDate(issued);
    pdf.setModificationDate(issued);
    const regular = await pdf.embedFont(StandardFonts.Helvetica),
      bold = await pdf.embedFont(StandardFonts.HelveticaBold);
    const logo = await pdf.embedPng(await this.logo());
    let page: PDFPage,
      y = 0;
    const addPage = () => {
      page = pdf.addPage([595.28, 841.89]);
      const image = logo.scaleToFit(180, 45);
      page.drawImage(logo, {
        x: 42,
        y: 778,
        width: image.width,
        height: image.height,
      });
      page.drawLine({
        start: { x: 42, y: 764 },
        end: { x: 553, y: 764 },
        color: rgb(0.75, 0.67, 0.59),
        thickness: 1,
      });
      y = 742;
    };
    addPage();
    const text = (input: unknown, size = 10, strong = false) => {
      const value = String(input ?? "")
        .normalize("NFC")
        .replace(/\r/g, "")
        .replace(/\t/g, "    ");
      const font = strong ? bold : regular;
      try {
        font.encodeText(value.replace(/\n/g, " "));
      } catch {
        throw new ValidationError(
          "El presupuesto contiene caracteres que la fuente PDF no admite. Revisa símbolos o emojis del texto",
        );
      }
      for (const paragraph of value.split("\n")) {
        let line = "";
        const draw = () => {
          if (y < 64) addPage();
          page.drawText(line, {
            x: 42,
            y,
            size,
            font,
            color: rgb(0.19, 0.18, 0.16),
          });
          y -= size * 1.45;
          line = "";
        };
        // Prefer whole words; only split a token when it cannot fit a page.
        for (const token of paragraph.match(/\S+\s*|\s+/g) ?? []) {
          if (line && font.widthOfTextAtSize(line + token, size) > 510) draw();
          for (const char of token) {
            if (font.widthOfTextAtSize(line + char, size) > 510) draw();
            line += char;
          }
        }
        draw();
      }
      y -= 5;
    };
    const money = (n: number) =>
      new Intl.NumberFormat("es-ES", {
        style: "currency",
        currency: "EUR",
      }).format(n);
    const date = (date: Date | null) =>
      date
        ? new Date(date).toLocaleDateString("es-ES", {
            timeZone: "Europe/Madrid",
          })
        : "—";
    text(`PRESUPUESTO ${d.numero} · Versión ${d.versionActual}`, 14, true);
    text(`Cliente: ${d.clienteNombre}`, 11, true);
    text(p.titulo, 16, true);
    if (p.referencia) text(`Referencia: ${p.referencia}`);
    text(
      `Estado: ${d.estado} · Emitido: ${date(p.enviadoAt)} · Válido hasta: ${date(p.expiresAt)}`,
    );
    for (const [index, line] of p.partidas.entries()) {
      if (y < 155) addPage();
      text(`${index + 1}. ${line.categoria} · ${line.descripcion}`, 11, true);
      const subtotal = calculateEstimateLineTotals(line).totalSinIva;
      text(
        `${line.cantidad} ${line.unidad} × ${money(line.precioVentaUnitario)} · Descuento: ${line.descuento}% · IVA: ${line.iva}%`,
      );
      text(`Importe sin IVA: ${money(subtotal)}`);
      if (line.notaCliente) text(line.notaCliente);
    }
    if (y < 160) addPage();
    text(`Base imponible: ${money(p.totalSinIva ?? 0)}`, 11, true);
    text(`IVA: ${money(p.totalIva ?? 0)}`, 11);
    text(`TOTAL: ${money(p.totalConIva)}`, 15, true);
    for (const [title, body] of [
      ["Condiciones de pago", p.condicionesPago],
      ["Garantía", p.garantia],
      ["Observaciones", p.notasCliente],
    ]) {
      if (body) {
        if (y < 110) addPage();
        text(title, 12, true);
        text(body);
      }
    }
    if (p.firmadoAt) {
      text(`Aceptación registrada: ${date(p.firmadoAt)}`, 11, true);
      if (p.hash) text(`Huella de la propuesta: ${p.hash}`, 8);
      text(
        "Copia informativa de la propuesta aceptada. La evidencia de aceptación se conserva en el área privada.",
        9,
      );
    }
    const pages = pdf.getPages();
    pages.forEach((pg, index) =>
      pg.drawText(
        `Hogaria · 614 786 341 · info@hogaria.design     ${index + 1} / ${pages.length}`,
        { x: 42, y: 30, size: 9, font: regular, color: rgb(0.4, 0.36, 0.32) },
      ),
    );
    return pdf.save({ useObjectStreams: false });
  }
}
