import { useCallback, useEffect, useRef, useState } from "react";
import { Button, Input, Modal } from "@/shared/ui";
import {
  SignatureCanvas,
  type SignatureCanvasHandle,
} from "@/features/signatures/components/SignatureCanvas";
import type {
  ProjectsApi,
  ProjectDTO,
} from "@/features/projects/api/projects.api";
import { formatMoney } from "@/shared/lib/formatters";
import { SalesApi, type EstimateDTO } from "../api/sales.api";
import {
  EstimateContent,
  EstimateDocuments,
  EstimateSearch,
} from "./EstimateContent";
import { estimateStatus, filterEstimates } from "../estimate-search";
import { EstimateHistory } from "./EstimateHistory";

const consent =
  "Acepto la propuesta mostrada y autorizo el inicio de los trabajos descritos en sus condiciones.";
const message = (error: unknown, fallback: string) =>
  (error as { message?: string } | null)?.message ?? fallback;

export function ClientEstimates({
  api,
  projectsApi,
}: {
  api: SalesApi;
  projectsApi: ProjectsApi;
}) {
  const [items, setItems] = useState<EstimateDTO[]>([]);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(0);
  const filtered = filterEstimates(items, query, status);
  const [projects, setProjects] = useState<ProjectDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<EstimateDTO | null>(null);
  const [receipt, setReceipt] = useState<{ hash: string; date: string } | null>(
    null,
  );
  const [changeOpen, setChangeOpen] = useState(false);
  const [changeText, setChangeText] = useState("");
  const [saving, setSaving] = useState(false);
  const [signature, setSignature] = useState("");
  const [password, setPassword] = useState("");
  const [accepted, setAccepted] = useState(false);
  const canvas = useRef<SignatureCanvasHandle>(null);
  const requestId = useRef(0);

  const refresh = useCallback(async () => {
    const request = ++requestId.current;
    setLoading(true);
    setError("");
    const [estimateResult, projectResult] = await Promise.allSettled([
      api.estimates(page, query, status),
      projectsApi.list(),
    ]);
    if (request !== requestId.current) return;
    if (estimateResult.status === "fulfilled") setItems(estimateResult.value);
    else
      setError(
        message(estimateResult.reason, "No se pudieron cargar tus propuestas."),
      );
    if (projectResult.status === "fulfilled") setProjects(projectResult.value);
    else
      setError(
        (previous) =>
          previous ||
          message(projectResult.reason, "No se pudieron cargar tus proyectos."),
      );
    setLoading(false);
  }, [api, projectsApi, page, query, status]);
  useEffect(() => {
    const timer = setTimeout(() => { void refresh(); }, 200);
    return () => { clearTimeout(timer); requestId.current++; };
  }, [refresh]);
  const closeProposal = () => {
    setSelected(null);
    setSignature("");
    setPassword("");
    setAccepted(false);
    canvas.current?.clear();
  };
  const replace = (next: EstimateDTO) =>
    setItems((current) =>
      current.map((item) => (item.id === next.id ? next : item)),
    );
  const sign = async () => {
    if (!selected || !signature || !password || !accepted) return;
    try {
      setSaving(true);
      setError("");
      const result = await api.signEstimate(selected.id, {
        password,
        canvasSignature: signature,
        version: selected.versionActual,
        consentimiento: consent,
      });
      replace(result.estimate);
      closeProposal();
      setReceipt({ hash: result.hash, date: result.fechaFirma });
    } catch (cause) {
      setError(message(cause, "No se pudo registrar la firma."));
    } finally {
      setSaving(false);
    }
  };
  const requestChanges = async () => {
    if (!selected || changeText.trim().length < 10) return;
    try {
      setSaving(true);
      setError("");
      const updated = await api.rejectEstimate(selected.id, changeText);
      replace(updated);
      setChangeOpen(false);
      setChangeText("");
      closeProposal();
    } catch (cause) {
      setError(message(cause, "No se pudo enviar la solicitud de cambios."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="client-estimates">
      <header className="private-page-header" style={{ marginBottom: 24 }}>
        <p className="eyebrow">Área cliente</p>
        <h1>Tu proyecto con Hogaria</h1>
        <p style={{ color: "#71685e" }}>
          Consulta propuestas, solicita cambios con claridad y sigue el avance
          de tu obra.
        </p>
      </header>
      {error && (
        <div
          role="alert"
          style={{
            color: "#a43c32",
            border: "1px solid #e7b8b1",
            padding: 12,
            marginBottom: 16,
          }}
        >
          {error}{" "}
          <Button small variant="ghost" onClick={() => void refresh()}>
            Reintentar
          </Button>
        </div>
      )}
      <section aria-labelledby="client-proposals">
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 12,
            alignItems: "center",
          }}
        >
          <h2 id="client-proposals">Propuestas</h2>
          <Button
            small
            variant="ghost"
            loading={loading}
            onClick={() => void refresh()}
          >
            Actualizar
          </Button>
        </div>
        <EstimateSearch
          query={query}
          status={status}
          statuses={["actualizando", "enviado", "firmado", "aceptado", "rechazado", "caducado"]}
        onQuery={value => { setPage(0); setQuery(value); }}
        onStatus={value => { setPage(0); setStatus(value); }}
        />
        <p role="status">
          {filtered.length} de {items.length} propuestas
        </p>
        {loading ? (
          <p>Cargando propuestas…</p>
        ) : filtered.length ? (
          filtered.map((item) => (
            <ProposalCard
              key={item.id}
              item={item}
              onOpen={() => setSelected(item)}
            />
          ))
        ) : (
          <p>
            {items.length
              ? "No hay presupuestos que coincidan con los filtros."
              : "Aún no tienes propuestas disponibles."}
          </p>
        )}
      </section>
      <nav aria-label="Páginas de presupuestos"><Button small variant="ghost" disabled={page === 0 || loading} onClick={() => setPage(value => value - 1)}>Anterior</Button><span>Página {page + 1}</span><Button small variant="ghost" disabled={items.length < 20 || loading} onClick={() => setPage(value => value + 1)}>Siguiente</Button></nav>
      <section aria-labelledby="client-projects" style={{ marginTop: 36 }}>
        <h2 id="client-projects">Mis proyectos</h2>
        {loading ? (
          <p>Cargando proyectos…</p>
        ) : projects.length ? (
          projects.map((project) => (
            <article
              key={project.id}
              className="private-action-card client-row"
            >
              <div>
                <strong>{project.nombre}</strong>
                <p style={{ margin: "6px 0", color: "#71685e" }}>
                  {project.direccion} · {project.progreso}% completado
                </p>
              </div>
              <a
                className="ui-button ui-button--ghost"
                href={`#/cliente/projects/${project.id}`}
              >
                Ver obra
              </a>
            </article>
          ))
        ) : (
          <p>
            Cuando una propuesta firmada se convierta en obra, aparecerá aquí.
          </p>
        )}
      </section>
      <Modal
        open={selected !== null}
        onClose={closeProposal}
        title={selected?.titulo ?? "Propuesta"}
        width={760}
        className="estimate-modal"
      >
        {selected && (
          <EstimateDocuments
            key={`${selected.id}-${selected.versionActual}`}
            api={api}
            item={selected}
          />
        )}
        {selected && <EstimateHistory key={selected.id} api={api} id={selected.id} />}
        <ProposalDetail
          item={selected}
          canvas={canvas}
          signature={signature}
          password={password}
          accepted={accepted}
          saving={saving}
          onSignature={setSignature}
          onPassword={setPassword}
          onAccepted={setAccepted}
          onRequestChanges={() => setChangeOpen(true)}
          onSign={() => void sign()}
          onClose={closeProposal}
        />
      </Modal>
      <Modal
        open={changeOpen}
        onClose={() => !saving && setChangeOpen(false)}
        title="Solicitar cambios"
        width={600}
      >
        <p>
          Describe qué quieres revisar. El equipo recibirá el mensaje junto a
          esta propuesta.
        </p>
        <label style={{ display: "grid", gap: 6, fontWeight: 600 }}>
          Cambios solicitados
          <textarea
            autoFocus
            rows={6}
            value={changeText}
            onChange={(event) => setChangeText(event.target.value)}
            maxLength={2000}
            style={{
              resize: "vertical",
              padding: 12,
              font: "inherit",
              border: "1px solid var(--line)",
              borderRadius: 8,
            }}
          />
        </label>
        <p style={{ color: "#71685e", fontSize: 12 }}>
          {changeText.trim().length}/2000 · mínimo 10 caracteres
        </p>
        <footer className="client-modal-actions">
          <Button
            variant="ghost"
            disabled={saving}
            onClick={() => setChangeOpen(false)}
          >
            Cancelar
          </Button>
          <Button
            loading={saving}
            disabled={changeText.trim().length < 10}
            onClick={() => void requestChanges()}
          >
            Enviar solicitud
          </Button>
        </footer>
      </Modal>
      <Modal
        open={receipt !== null}
        onClose={() => setReceipt(null)}
        title="Propuesta firmada"
        width={560}
      >
        <h2>Firma registrada correctamente</h2>
        <p>Tu aceptación ha quedado sellada. Conserva esta referencia.</p>
        <p>
          <strong>Fecha:</strong>{" "}
          {receipt ? new Date(receipt.date).toLocaleString("es-ES") : ""}
        </p>
        <code
          style={{
            display: "block",
            wordBreak: "break-all",
            padding: 10,
            background: "#f8efe4",
          }}
        >
          {receipt?.hash}
        </code>
        <footer className="client-modal-actions">
          <Button onClick={() => setReceipt(null)}>Entendido</Button>
        </footer>
      </Modal>
    </section>
  );
}

function ProposalCard({
  item,
  onOpen,
}: {
  item: EstimateDTO;
  onOpen: () => void;
}) {
  return (
    <article className="private-action-card client-row">
      <div>
        <strong>{item.titulo}</strong>
        <p style={{ margin: "6px 0", color: "#71685e" }}>
          {item.numero} · versión {item.versionActual} · {estimateStatus(item.estado)}
        </p>
        {item.propuesta && (
          <strong>{formatMoney(item.propuesta.totalConIva)}</strong>
        )}
        {item.motivoRechazo && (
          <p style={{ color: "#71685e" }}>
            Cambios solicitados: {item.motivoRechazo}
          </p>
        )}
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <Button small variant="ghost" onClick={onOpen}>
          Ver propuesta
        </Button>
        {item.estado === "enviado" && (
          <Button small onClick={onOpen}>
            Revisar y firmar
          </Button>
        )}
      </div>
    </article>
  );
}

function ProposalDetail({
  item,
  canvas,
  signature,
  password,
  accepted,
  saving,
  onSignature,
  onPassword,
  onAccepted,
  onRequestChanges,
  onSign,
  onClose,
}: {
  item: EstimateDTO | null;
  canvas: React.RefObject<SignatureCanvasHandle>;
  signature: string;
  password: string;
  accepted: boolean;
  saving: boolean;
  onSignature: (value: string) => void;
  onPassword: (value: string) => void;
  onAccepted: (value: boolean) => void;
  onRequestChanges: () => void;
  onSign: () => void;
  onClose: () => void;
}) {
  if (!item?.propuesta) return <p>Esta propuesta aún no ha sido enviada.</p>;
  return (
    <>
      <EstimateContent item={item} />
      {item.estado === "enviado" && (
        <>
          <h3>Firma</h3>
          <p style={{ color: "#71685e" }}>
            La firma deja esta versión sellada y no podrá modificarse.
          </p>
          <SignatureCanvas ref={canvas} onChange={onSignature} height={150} />
          <label
            style={{
              display: "flex",
              gap: 8,
              margin: "16px 0",
              fontSize: 13,
              alignItems: "flex-start",
            }}
          >
            <input
              type="checkbox"
              checked={accepted}
              onChange={(event) => onAccepted(event.target.checked)}
            />
            <span>{consent}</span>
          </label>
          <Input
            label="Contraseña"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => onPassword(event.target.value)}
          />
        </>
      )}
      <footer className="client-modal-actions">
        <Button variant="ghost" onClick={onClose}>
          Cerrar
        </Button>
        {item.estado === "enviado" && (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Button variant="ghost" loading={saving} onClick={onRequestChanges}>
              Solicitar cambios
            </Button>
            <Button
              disabled={!signature || !password || !accepted}
              loading={saving}
              onClick={onSign}
            >
              Firmar y aceptar
            </Button>
          </div>
        )}
      </footer>
    </>
  );
}
