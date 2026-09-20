import { useEffect, useRef, useState } from "react";
import { Button } from "@/shared/ui";
import type { EstimateDTO, SalesApi } from "../api/sales.api";
import { estimateStatus } from "../estimate-search";
import "../estimates.css";

export function EstimateSearch({
  query,
  status,
  onQuery,
  onStatus,
  statuses = ["borrador", "en_revision", "enviado", "firmado", "aceptado", "rechazado", "caducado"],
}: {
  query: string;
  status: string;
  onQuery: (s: string) => void;
  onStatus: (s: string) => void;
  statuses?: string[];
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
          {statuses.map((s) => (
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
export function EstimateDocuments({
  api,
  item,
  reusePdf = true,
}: {
  api: SalesApi;
  item: EstimateDTO;
  reusePdf?: boolean;
}) {
  const [documentUrl, setDocumentUrl] = useState(""),
    [busy, setBusy] = useState(true),
    [error, setError] = useState(""),
    [retry, setRetry] = useState(0);
  const lock = useRef(false);
  const filename = `presupuesto-${item.numero.replace(/[^a-zA-Z0-9_-]/g, "-")}-v${item.versionActual}.pdf`;

  useEffect(() => {
    let active = true;
    let url = "";
    setBusy(true);
    setError("");
    setDocumentUrl("");
    void api.downloadPdf(item.id, item.versionActual, item.updatedAt, { reuse: reusePdf })
      .then(blob => {
        if (!active) return;
        url = URL.createObjectURL(blob);
        setDocumentUrl(url);
      })
      .catch(e => {
        if (!active) return;
        setError((e as { message?: string })?.message ?? "No se pudo cargar el PDF.");
      })
      .finally(() => { if (active) setBusy(false); });
    return () => {
      active = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [api, item.id, item.updatedAt, item.versionActual, retry, reusePdf]);

  function download() {
    if (!documentUrl || lock.current) return;
    lock.current = true;
    const link = document.createElement("a");
    link.href = documentUrl;
    link.download = filename;
    document.body.append(link);
    link.click();
    link.remove();
    lock.current = false;
  }

  if (!item.propuesta) return <p>Este presupuesto todavía no tiene contenido disponible.</p>;
  return (
    <section className="estimate-document-actions" aria-label="Documento PDF">
      <header className="estimate-document-actions__heading">
        <div>
          <span>Preparado para</span>
          <strong>{item.clienteNombre}</strong>
          <small>{item.numero} · Versión {item.versionActual} · {estimateStatus(item.estado)}</small>
        </div>
        <Button variant="ghost" disabled={!documentUrl} onClick={download}>
          Descargar PDF
        </Button>
      </header>
      {busy && <p role="status">Preparando la vista previa del PDF…</p>}
      {error && <div className="estimate-document-actions__error">
        <p role="alert">{error}</p>
        <Button small variant="ghost" onClick={() => setRetry(value => value + 1)}>Reintentar</Button>
      </div>}
      {documentUrl && (
        <iframe
          className="estimate-pdf-viewer"
          src={documentUrl}
          title="Vista previa del presupuesto en PDF"
        />
      )}
    </section>
  );
}
