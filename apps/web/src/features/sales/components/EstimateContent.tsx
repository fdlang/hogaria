import { useRef, useState } from "react";
import { Button } from "@/shared/ui";
import { formatDate, formatMoney } from "@/shared/lib/formatters";
import type { EstimateDTO, SalesApi } from "../api/sales.api";
import { estimateStatus } from "../estimate-search";
import "../estimates.css";

export function EstimateSearch({
  query,
  status,
  onQuery,
  onStatus,
}: {
  query: string;
  status: string;
  onQuery: (s: string) => void;
  onStatus: (s: string) => void;
}) {
  return (
    <div className="estimate-search">
      <label>
        Buscar presupuestos
        <input
          type="search"
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          placeholder="Número, título o referencia"
        />
      </label>
      <label>
        Estado
        <select value={status} onChange={(e) => onStatus(e.target.value)}>
          <option value="">Todos los estados</option>
          {[
            "borrador",
            "en_revision",
            "enviado",
            "firmado",
            "aceptado",
            "rechazado",
            "caducado",
          ].map((s) => (
            <option key={s} value={s}>
              {estimateStatus(s)}
            </option>
          ))}
        </select>
      </label>
      {(query || status) && (
        <Button
          small
          variant="ghost"
          onClick={() => {
            onQuery("");
            onStatus("");
          }}
        >
          Limpiar filtros
        </Button>
      )}
    </div>
  );
}
export function EstimateContent({ item }: { item: EstimateDTO | null }) {
  if (!item) return null;
  const p = item.propuesta;
  if (!p)
    return (
      <p>
        Este presupuesto es un borrador interno. Publica una versión para
        consultar la propuesta y su PDF.
      </p>
    );
  return (
    <div className="estimate-document">
      <h2>{p.titulo}</h2>
      <p>
        {item.numero} · Versión {item.versionActual} ·{" "}
        {estimateStatus(item.estado)}
      </p>
      {p.referencia && <p>Referencia: {p.referencia}</p>}
      <p>
        Enviado: {p.enviadoAt ? formatDate(p.enviadoAt) : "—"}
        {p.expiresAt ? ` · Válido hasta: ${formatDate(p.expiresAt)}` : ""}
      </p>
      <table className="estimate-document__lines">
        <thead>
          <tr>
            <th>Partida</th>
            <th>Cantidad</th>
            <th>Precio unitario</th>
            <th>Descuento</th>
            <th>IVA</th>
            <th>Importe sin IVA</th>
          </tr>
        </thead>
        <tbody>
          {p.partidas.map((line) => (
            <tr key={line.id}>
              <td data-label="Partida">
                <strong>{line.descripcion}</strong>
                <small>{line.categoria}</small>
                {line.notaCliente && <p>{line.notaCliente}</p>}
              </td>
              <td data-label="Cantidad">
                {line.cantidad} {line.unidad}
              </td>
              <td data-label="Precio unitario">
                {formatMoney(line.precioVentaUnitario)}
              </td>
              <td data-label="Descuento">{line.descuento}%</td>
              <td data-label="IVA">{line.iva}%</td>
              <td data-label="Importe sin IVA">
                {formatMoney(
                  line.cantidad *
                    line.precioVentaUnitario *
                    (1 - line.descuento / 100),
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <dl className="estimate-document__totals">
        <div>
          <dt>Base imponible</dt>
          <dd>{formatMoney(p.totalSinIva)}</dd>
        </div>
        <div>
          <dt>IVA</dt>
          <dd>{formatMoney(p.totalIva)}</dd>
        </div>
        <div>
          <dt>Total</dt>
          <dd>{formatMoney(p.totalConIva)}</dd>
        </div>
      </dl>
      {[
        ["Condiciones de pago", p.condicionesPago],
        ["Garantía", p.garantia],
        ["Observaciones", p.notasCliente],
      ].map(
        ([title, body]) =>
          body && (
            <section key={title}>
              <h3>{title}</h3>
              <p className="estimate-document__text">{body}</p>
            </section>
          ),
      )}
      {item.motivoRechazo && (
        <section>
          <h3>Cambios solicitados</h3>
          <p>{item.motivoRechazo}</p>
        </section>
      )}
      {p.firmadoAt && (
        <p>
          Aceptación registrada: {formatDate(p.firmadoAt)}
          {p.hash && (
            <>
              {" "}
              · Huella: <code>{p.hash}</code>
            </>
          )}
        </p>
      )}
    </div>
  );
}
export function EstimateDocuments({
  api,
  item,
}: {
  api: SalesApi;
  item: EstimateDTO;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const lock = useRef(false);
  if (!item.propuesta) return null;
  async function download() {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const blob = await api.downloadPdf(item.id, item.versionActual),
        url = URL.createObjectURL(blob),
        a = document.createElement("a");
      a.href = url;
      a.download = `presupuesto-${item.numero.replace(/[^a-zA-Z0-9_-]/g, "-")}-v${item.versionActual}.pdf`;
      document.body.append(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
      setNotice("PDF preparado para descargar.");
    } catch (e) {
      setError(
        (e as { message?: string })?.message ?? "No se pudo descargar el PDF.",
      );
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <section className="estimate-document-actions" aria-label="Documento PDF">
      <Button
        variant="ghost"
        loading={busy}
        disabled={busy}
        onClick={() => void download()}
      >
        Descargar PDF
      </Button>
      {error && <p role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
    </section>
  );
}
