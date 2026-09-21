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
import { EstimateDocuments, EstimateSearch } from "./EstimateContent";
import { estimateStatus, filterEstimates } from "../estimate-search";
import { EstimateHistory } from "./EstimateHistory";

const consent =
  "Acepto la propuesta mostrada y autorizo el inicio de los trabajos descritos en sus condiciones.";
const message = (error: unknown, fallback: string) =>
  (error as { message?: string } | null)?.message ?? fallback;

export function ClientEstimates({
  api,
  projectsApi,
  view = "projects",
}: {
  api: SalesApi;
  projectsApi: ProjectsApi;
  view?: "projects" | "budgets";
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
    try {
      if (view === "budgets") {
        const estimates = await api.estimates(page, query, status);
        if (request !== requestId.current) return;
        setItems(estimates);
      } else {
        const assignedProjects = await projectsApi.list();
        if (request !== requestId.current) return;
        setProjects(assignedProjects);
      }
    } catch (cause) {
      if (request !== requestId.current) return;
      setError(message(cause, view === "budgets" ? "No se pudieron cargar tus propuestas." : "No se pudieron cargar tus proyectos."));
    }
    if (request !== requestId.current) return;
    setLoading(false);
  }, [api, projectsApi, page, query, status, view]);
  useEffect(() => {
    const timer = setTimeout(() => { void refresh(); }, 200);
    return () => { clearTimeout(timer); requestId.current++; };
  }, [refresh]);
  useEffect(() => {
    const refreshArea = () => { void refresh(); };
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") refreshArea();
    };
    window.addEventListener("focus", refreshArea);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => {
      window.removeEventListener("focus", refreshArea);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [refresh]);
  const closeProposal = () => {
    setSelected(null);
    setSignature("");
    setPassword("");
    setAccepted(false);
    canvas.current?.clear();
  };
  const closeChanges = () => {
    if (saving) return;
    setChangeOpen(false);
    setChangeText("");
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
      {view === "projects" && <header className="client-estimates__hero">
        <div className="client-estimates__intro">
          <p className="eyebrow">Área cliente</p>
          <h1>
            Tu proyecto con
            <img
              className="client-estimates__brand-logo"
              src="/brand/hogaria-wordmark.png"
              alt="Hogaria"
              width="2362"
              height="511"
              decoding="async"
            />
          </h1>
          <p>
            Consulta tus propuestas, revisa cada decisión y sigue el avance de
            tu obra desde un único lugar.
          </p>
        </div>
        <dl className="client-estimates__summary" aria-label="Resumen de tu cuenta">
          <div>
            <dt>Obras activas</dt>
            <dd>{projects.filter(project => project.estado !== "finalizado").length}</dd>
          </div>
          <div>
            <dt>Próximo paso</dt>
            <dd><a href={projects.length ? "#client-projects" : "#/cliente/budgets"}>{projects.length ? "Seguir la obra" : "Consultar presupuestos"}</a></dd>
          </div>
        </dl>
      </header>}
      {view === "budgets" && <header className="private-page-header">
        <p className="eyebrow">Documentación comercial</p>
        <h1>Presupuestos</h1>
        <p>Consulta, descarga y revisa cada propuesta que Hogaria haya publicado para ti.</p>
      </header>}
      {error && (
        <div
          className="client-estimates__alert"
          role="alert"
        >
          {error}{" "}
          <Button small variant="ghost" onClick={() => void refresh()}>
            Reintentar
          </Button>
        </div>
      )}
      {view === "budgets" && <>
      <section className="client-estimates__section" aria-labelledby="client-proposals">
        <div className="client-estimates__section-heading">
          <div>
            <p className="eyebrow">Documentación comercial</p>
            <h2 id="client-proposals">Propuestas</h2>
            <p>Consulta el detalle y el estado de cada versión enviada.</p>
          </div>
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
          statuses={["enviado", "firmado", "aceptado", "rechazado", "caducado"]}
        onQuery={value => { setPage(0); setQuery(value); }}
        onStatus={value => { setPage(0); setStatus(value); }}
        />
        <p className="client-estimates__results" role="status">
          {filtered.length} propuestas en esta página
        </p>
        {loading ? (
          <p>Cargando propuestas…</p>
        ) : filtered.length ? (
          filtered.map((item) => (
            <ProposalCard
              key={item.id}
              item={item}
              onPrepare={() => { if (item.propuesta) void api.downloadPdf(item.id, item.versionActual, item.updatedAt, { reuse: false }).catch(() => undefined); }}
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
      <nav className="client-estimates__pagination" aria-label="Páginas de presupuestos"><Button small variant="ghost" disabled={page === 0 || loading} onClick={() => setPage(value => value - 1)}>Anterior</Button><span>Página {page + 1}</span><Button small variant="ghost" disabled={items.length < 20 || loading} onClick={() => setPage(value => value + 1)}>Siguiente</Button></nav>
      </>}
      {view === "projects" && <section className="client-estimates__section client-estimates__section--projects" aria-labelledby="client-projects">
        <div className="client-estimates__section-heading">
          <div>
            <p className="eyebrow">Ejecución y seguimiento</p>
            <h2 id="client-projects">Mis proyectos</h2>
            <p>Revisa el estado actual y accede al detalle de cada obra.</p>
          </div>
          <Button small variant="ghost" loading={loading} onClick={() => void refresh()}>
            Actualizar proyectos
          </Button>
        </div>
        {loading ? (
          <p>Cargando proyectos…</p>
        ) : projects.length ? (
          projects.map((project) => (
            <article
              key={project.id}
              className="private-action-card client-row client-project-card"
            >
              <div>
                <span className="client-project-card__status">{projectStatus(project.estado)}</span>
                <strong>{project.nombre}</strong>
                <p>{project.direccion}</p>
                <div className="client-project-card__progress" aria-label={`${project.progreso}% completado`}>
                  <span style={{ width: `${Math.min(100, Math.max(0, project.progreso))}%` }} />
                </div>
                <small>{project.progreso}% completado</small>
              </div>
              <Button
                small
                variant="ghost"
                onClick={() => { window.location.hash = `#/cliente/projects/${project.id}`; }}
              >
                Ver obra
              </Button>
            </article>
          ))
        ) : (
          <p>Cuando una propuesta firmada se convierta en obra, aparecerá aquí.</p>
        )}
      </section>}
      <Modal
        open={selected !== null && !changeOpen}
        onClose={closeProposal}
        title={selected ? `Propuesta para ${selected.clienteNombre}` : "Propuesta"}
        width={900}
        className="estimate-modal"
      >
        {selected && (
          <EstimateDocuments
            key={`${selected.id}-${selected.versionActual}`}
            api={api}
            item={selected}
            reusePdf={false}
          />
        )}
        {selected && <EstimateHistory key={selected.id} api={api} id={selected.id} reusePdf={false} />}
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
          onRequestChanges={() => { setChangeText(""); setChangeOpen(true); }}
          onSign={() => void sign()}
          onClose={closeProposal}
        />
      </Modal>
      <Modal
        open={changeOpen}
        onClose={closeChanges}
        title="Solicitar cambios"
        width={600}
        className="client-area-modal"
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
            onClick={closeChanges}
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
        className="client-area-modal"
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

const projectStatus = (status: ProjectDTO["estado"]) => ({
  planificacion: "En planificación",
  en_curso: "Obra en curso",
  pausado: "Obra pausada",
  finalizado: "Obra finalizada",
})[status];

function ProposalCard({
  item,
  onPrepare,
  onOpen,
}: {
  item: EstimateDTO;
  onPrepare: () => void;
  onOpen: () => void;
}) {
  return (
    <article className={`private-action-card client-row client-proposal-card client-proposal-card--${item.estado}`}>
      <div>
        <span className="client-proposal-card__status">{estimateStatus(item.estado)}</span>
        <strong>{item.titulo}</strong>
        <p>
          {item.numero} · versión {item.versionActual}
        </p>
        {item.propuesta && (
          <strong>{formatMoney(item.propuesta.totalConIva)}</strong>
        )}
        {item.motivoRechazo && (
          <p style={{ color: "#71685e" }}>
            Cambios solicitados: {item.motivoRechazo}
          </p>
        )}
        {item.estado === "firmado" && (
          <p style={{ color: "#71685e" }}>
            Firma completada · pendiente de alta como obra por Hogaria
          </p>
        )}
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <Button small variant="ghost" onMouseEnter={onPrepare} onFocus={onPrepare} onPointerDown={onPrepare} onClick={onOpen}>
          Ver propuesta
        </Button>
        {item.estado === "enviado" && (
          <Button small onMouseEnter={onPrepare} onFocus={onPrepare} onPointerDown={onPrepare} onClick={onOpen}>
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
