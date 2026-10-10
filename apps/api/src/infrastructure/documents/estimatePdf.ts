import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
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

const pageWidth = 595.28;
const pageHeight = 841.89;
const margin = 42;
const contentWidth = pageWidth - margin * 2;
const colors = {
  ink: rgb(0.12, 0.12, 0.11),
  muted: rgb(0.4, 0.36, 0.32),
  copper: rgb(0.66, 0.31, 0.16),
  copperLight: rgb(0.94, 0.87, 0.81),
  paper: rgb(0.985, 0.973, 0.952),
  line: rgb(0.83, 0.78, 0.72),
  white: rgb(1, 1, 1),
};

export class PdfEstimateRenderer implements EstimatePdfRenderer {
  private readonly documents = new Map<string, Promise<Uint8Array>>();
  private logoBytes: Promise<Uint8Array> | undefined;

  constructor(private readonly logo: () => Promise<Uint8Array> = brand) {}
  async render(d: EstimateDocument) {
    const key = `${d.id}:${d.versionActual}:${new Date(d.updatedAt).getTime()}:${d.propuesta?.hash ?? ""}`;
    const cached = this.documents.get(key);
    if (cached) return cached;

    const document = this.create(d).catch(error => {
      this.documents.delete(key);
      throw error;
    });
    this.documents.set(key, document);
    while (this.documents.size > 8) {
      const oldest = this.documents.keys().next().value as string | undefined;
      if (oldest === undefined) break;
      this.documents.delete(oldest);
    }
    return document;
  }

  private async create(d: EstimateDocument) {
    const p = d.propuesta;
    if (!p) throw new ValidationError("No hay propuesta publicada");
    if (p.partidas.length > 1000 || JSON.stringify(p).length > 500_000)
      throw new ValidationError(
        "El presupuesto supera el tamaño admitido para PDF",
      );
    const pdf = await PDFDocument.create();
    pdf.setTitle(`Presupuesto ${d.numero} · v${d.versionActual}`);
    pdf.setAuthor("Hogaria");
    pdf.setSubject(`Propuesta para ${d.clienteNombre}`);
    pdf.setKeywords(["Hogaria", "presupuesto", d.numero]);
    const issued = new Date(p.enviadoAt ?? d.createdAt);
    pdf.setCreationDate(issued);
    pdf.setModificationDate(issued);
    const regular = await pdf.embedFont(StandardFonts.Helvetica),
      bold = await pdf.embedFont(StandardFonts.HelveticaBold);
    this.logoBytes ??= this.logo().catch(error => {
      this.logoBytes = undefined;
      throw error;
    });
    const logo = await pdf.embedPng(await this.logoBytes);
    let page!: PDFPage,
      y = 0;
    const addPage = (continuation = false) => {
      page = pdf.addPage([pageWidth, pageHeight]);
      page.drawRectangle({ x: 0, y: 0, width: pageWidth, height: pageHeight, color: colors.paper });
      const image = logo.scaleToFit(150, 38);
      page.drawImage(logo, {
        x: margin,
        y: 784,
        width: image.width,
        height: image.height,
      });
      page.drawText(continuation ? "CONTINUACIÓN" : "PROPUESTA COMERCIAL", {
        x: 405,
        y: 808,
        size: 7.5,
        font: bold,
        color: colors.copper,
      });
      page.drawText(`${d.numero} · V${d.versionActual}`, {
        x: 405,
        y: 792,
        size: 8,
        font: regular,
        color: colors.muted,
      });
      page.drawLine({
        start: { x: margin, y: 770 },
        end: { x: pageWidth - margin, y: 770 },
        color: colors.line,
        thickness: 0.8,
      });
      y = 742;
    };
    addPage();
    const normalize = (input: unknown) => {
      const value = String(input ?? "")
        .normalize("NFC")
        .replace(/\r/g, "")
        .replace(/\t/g, "    ");
      try {
        regular.encodeText(value.replace(/\n/g, " "));
      } catch {
        throw new ValidationError(
          "El presupuesto contiene caracteres que la fuente PDF no admite. Revisa símbolos o emojis del texto",
        );
      }
      return value;
    };
    const wrap = (input: unknown, font: PDFFont, size: number, width: number) => {
      const lines: string[] = [];
      for (const paragraph of normalize(input).split("\n")) {
        let line = "";
        for (const token of paragraph.match(/\S+\s*|\s+/g) ?? [""]) {
          for (const char of token) {
            if (line && font.widthOfTextAtSize(line + char, size) > width) {
              lines.push(line.trimEnd());
              line = "";
            }
            line += char;
          }
        }
        lines.push(line.trimEnd());
      }
      return lines.length ? lines : [""];
    };
    const text = (input: unknown, size = 10, strong = false) => {
      const value = normalize(input);
      const font = strong ? bold : regular;
      for (const paragraph of value.split("\n")) {
        let line = "";
        const draw = () => {
          if (y < 64) addPage(true);
          page.drawText(line, {
            x: margin,
            y,
            size,
            font,
            color: colors.ink,
          });
          y -= size * 1.45;
          line = "";
        };
        // Prefer whole words; only split a token when it cannot fit a page.
        for (const token of paragraph.match(/\S+\s*|\s+/g) ?? []) {
          if (line && font.widthOfTextAtSize(line + token, size) > contentWidth) draw();
          for (const char of token) {
            if (font.widthOfTextAtSize(line + char, size) > contentWidth) draw();
            line += char;
          }
        }
        draw();
      }
      y -= 5;
    };
    const euro = new Intl.NumberFormat("es-ES", {
        style: "currency",
        currency: "EUR",
        useGrouping: true,
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });
    const money = (n: number) => euro.format(n);
    const date = (date: Date | null) =>
      date
        ? new Date(date).toLocaleDateString("es-ES", {
            timeZone: "Europe/Madrid",
          })
        : "—";
    const label = (value: string, x: number, labelY: number) => page.drawText(normalize(value).toUpperCase(), {
      x,
      y: labelY,
      size: 7,
      font: bold,
      color: colors.copper,
    });
    const titleLines = wrap(p.titulo, bold, 22, contentWidth - 36);
    const heroHeight = Math.max(137, 112 + titleLines.length * 25);
    const heroBottom = y - heroHeight;
    page.drawRectangle({
      x: margin,
      y: heroBottom,
      width: contentWidth,
      height: heroHeight,
      color: colors.copperLight,
      borderColor: colors.line,
      borderWidth: 0.7,
    });
    label("Presupuesto preparado para", margin + 18, y - 23);
    y -= 51;
    titleLines.forEach(line => {
      page.drawText(line, { x: margin + 18, y, size: 22, font: bold, color: colors.ink });
      y -= 25;
    });
    page.drawText(normalize(d.clienteNombre), { x: margin + 18, y: y - 3, size: 12, font: bold, color: colors.copper });
    const status = normalize(d.estado).replace(/_/g, " ").replace(/^./, character => character.toUpperCase());
    const metaY = heroBottom + 18;
    for (const [metaLabel, value, x] of [
      ["Emitido", date(p.enviadoAt), margin + 18],
      ["Válido hasta", date(p.expiresAt), 220],
      ["Estado", status, 400],
    ] as const) {
      label(metaLabel, x, metaY + 13);
      page.drawText(normalize(value), { x, y: metaY, size: 8.5, font: regular, color: colors.muted });
    }
    y = heroBottom - 24;
    if (p.referencia) {
      text(`Referencia: ${p.referencia}`, 8.5);
      y -= 3;
    }
    label("Alcance económico", margin, y);
    y -= 25;
    const tableHeader = () => {
      page.drawRectangle({ x: margin, y: y - 23, width: contentWidth, height: 27, color: colors.copper });
      for (const [heading, x] of [
        ["PARTIDA", margin + 10],
        ["CANT.", 290],
        ["PRECIO", 355],
        ["IVA", 445],
        ["IMPORTE", 491],
      ] as const) {
        page.drawText(heading, { x, y: y - 13, size: 7.5, font: bold, color: colors.white });
      }
      y -= 31;
    };
    tableHeader();
    for (const [index, line] of p.partidas.entries()) {
      const titleRows = wrap(`${index + 1}. ${line.categoria} · ${line.descripcion}`, bold, 9, 230);
      const detail = [
        line.descuento ? `Descuento: ${line.descuento}%` : "",
        line.notaCliente ?? "",
      ].filter(Boolean).join(" · ");
      const detailRows = detail ? wrap(detail, regular, 7.5, 230) : [];
      const rows = [
        ...titleRows.map(value => ({ value, font: bold, size: 9, height: 11, color: colors.ink })),
        ...detailRows.map(value => ({ value, font: regular, size: 7.5, height: 9, color: colors.muted })),
      ];
      const subtotal = calculateEstimateLineTotals(line).totalSinIva;
      let firstSegment = true;
      while (rows.length) {
        if (y < 115) {
          addPage(true);
          tableHeader();
        }
        const available = y - 63;
        let contentHeight = 0;
        let count = 0;
        while (count < rows.length && contentHeight + rows[count]!.height <= available - 15) {
          contentHeight += rows[count]!.height;
          count += 1;
        }
        if (count === 0) {
          addPage(true);
          tableHeader();
          continue;
        }
        const segment = rows.splice(0, count);
        const rowHeight = Math.max(44, 15 + contentHeight);
        if (index % 2 === 0) {
          page.drawRectangle({ x: margin, y: y - rowHeight + 5, width: contentWidth, height: rowHeight, color: colors.white });
        }
        let rowY = y - 10;
        segment.forEach(row => {
          page.drawText(row.value, { x: margin + 10, y: rowY, size: row.size, font: row.font, color: row.color });
          rowY -= row.height;
        });
        if (firstSegment) {
          for (const [value, x, width] of [
            [`${line.cantidad} ${line.unidad}`, 290, 50],
            [money(line.precioVentaUnitario), 355, 75],
            [`${line.iva}%`, 445, 30],
            [money(subtotal), 491, 58],
          ] as const) {
            const normalized = normalize(value);
            const naturalWidth = regular.widthOfTextAtSize(normalized, 8);
            const valueSize = naturalWidth > width ? Math.max(6, 8 * width / naturalWidth) : 8;
            const valueWidth = regular.widthOfTextAtSize(normalized, valueSize);
            page.drawText(normalized, { x: x + Math.max(0, width - valueWidth), y: y - 10, size: valueSize, font: regular, color: colors.ink });
          }
        }
        page.drawLine({
          start: { x: margin, y: y - rowHeight + 5 },
          end: { x: pageWidth - margin, y: y - rowHeight + 5 },
          color: colors.line,
          thickness: 0.45,
        });
        y -= rowHeight;
        firstSegment = false;
        if (rows.length) {
          addPage(true);
          tableHeader();
        }
      }
    }
    if (y < 180) addPage(true);
    y -= 18;
    const totalsX = 316;
    const totalsWidth = pageWidth - margin - totalsX;
    page.drawRectangle({ x: totalsX, y: y - 94, width: totalsWidth, height: 104, color: colors.copperLight, borderColor: colors.line, borderWidth: 0.7 });
    let totalY = y - 18;
    for (const [totalLabel, value, font, size, divider] of [
      ["Base imponible", money(p.totalSinIva ?? 0), regular, 9, false],
      ["IVA", money(p.totalIva ?? 0), regular, 9, true],
      ["TOTAL", money(p.totalConIva), bold, 14, false],
    ] as const) {
      page.drawText(totalLabel, { x: totalsX + 14, y: totalY, size, font, color: totalLabel === "TOTAL" ? colors.copper : colors.muted });
      const valueWidth = font.widthOfTextAtSize(value, size);
      page.drawText(value, { x: totalsX + totalsWidth - 14 - valueWidth, y: totalY, size, font, color: colors.ink });
      if (divider) page.drawLine({ start: { x: totalsX + 14, y: totalY - 11 }, end: { x: totalsX + totalsWidth - 14, y: totalY - 11 }, color: colors.line, thickness: 0.7 });
      totalY -= divider ? 31 : 24;
    }
    y -= 116;
    const section = (title: string, body: string) => {
      let remaining = wrap(body, regular, 9.5, contentWidth - 28);
      let continuation = false;
      while (remaining.length) {
        if (y < 125) addPage(true);
        const capacity = Math.max(1, Math.floor((y - 90) / 13));
        const lines = remaining.slice(0, capacity);
        remaining = remaining.slice(capacity);
        const height = 39 + lines.length * 13;
        page.drawRectangle({ x: margin, y: y - height, width: contentWidth, height, color: colors.white, borderColor: colors.line, borderWidth: 0.7 });
        label(`${title}${continuation ? " · continuación" : ""}`, margin + 14, y - 21);
        let lineY = y - 43;
        lines.forEach(line => {
          if (line) page.drawText(line, { x: margin + 14, y: lineY, size: 9.5, font: regular, color: colors.ink });
          lineY -= 13;
        });
        y -= height + 14;
        continuation = true;
      }
    };
    for (const [title, body] of [
      ["Condiciones de pago", p.condicionesPago],
      ["Garantía", p.garantia],
      ["Observaciones", p.notasCliente],
    ] as const) {
      if (body) section(title, normalize(body));
    }
    if (p.firmadoAt) {
      section(
        "Aceptación digital",
        `Aceptación registrada el ${date(p.firmadoAt)}. La evidencia de aceptación se conserva en el área privada.`,
      );
      if (p.hash) text(`Huella de la propuesta: ${p.hash}`, 7);
    }
    const pages = pdf.getPages();
    pages.forEach((pg, index) => {
      pg.drawLine({
        start: { x: margin, y: 43 },
        end: { x: pageWidth - margin, y: 43 },
        color: colors.line,
        thickness: 0.6,
      });
      pg.drawText("HOGARIA · REFORMAS INTEGRALES", {
        x: margin,
        y: 27,
        size: 7.5,
        font: bold,
        color: colors.muted,
      });
      const footer = `614 786 341 · info@hogaria.design     ${index + 1} / ${pages.length}`;
      const footerWidth = regular.widthOfTextAtSize(footer, 7.5);
      pg.drawText(footer, {
        x: pageWidth - margin - footerWidth,
        y: 27,
        size: 7.5,
        font: regular,
        color: colors.muted,
      });
    });
    return pdf.save({ useObjectStreams: true });
  }
}
