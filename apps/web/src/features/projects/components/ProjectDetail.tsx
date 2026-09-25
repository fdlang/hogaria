/**
 * ProjectDetail — unified project page (admin / cliente / profesional).
 *
 * Uses the specialised optimistic-update helpers in useProjects.ts:
 *   - useProgressUpdater   — optimistic progreso with rollback on error
 *   - useMilestoneToggler  — optimistic hito toggle with rollback on error
 *
 * The visible action set is gated by usePermissions(), so there's no
 * duplication across roles.
 */

import { useRef, useState, type FormEvent } from "react";
import { ProjectsApi, type ProjectDTO } from "../api/projects.api";
import { UsersApi } from "@/features/users/api/users.api";
import { useProject, useProgressUpdater, useMilestoneToggler } from "../hooks/useProjects";
import { useUsers } from "@/features/users/hooks/useUsers";
import { FilesApi, useProjectFiles } from "@/features/files/api/files.api";
import { usePermissions } from "@/shared/hooks/usePermissions";
import { useNotifications } from "@/shared/ui/notifications";
import { useConfirm } from "@/shared/ui/confirm";
import { Button, Spinner, Badge, EmptyState } from "@/shared/ui";
import { PageHeader } from "@/shared/ui/page-header";
import { ProjectStatusBadge, ProfesionBadge } from "@/shared/ui/badges";
import { formatMoney, formatDate, formatBytes } from "@/shared/lib/formatters";
import { Profesion } from "@reformapro/domain";
import { ChangeOrders } from "@/features/sales/components/ChangeOrders";
import { ExclusiveAction } from "@/shared/lib/exclusive-action";

interface Props {
  apis: { projects: ProjectsApi; files: FilesApi; users: UsersApi };
  projectId: number;
  onBack: () => void;
}

export function ProjectDetail({ apis, projectId, onBack }: Props) {
  const project       = useProject(apis.projects, projectId);
  const updateProgress = useProgressUpdater(apis.projects, project);
  const toggleMilestone = useMilestoneToggler(apis.projects, project);
  const files          = useProjectFiles(apis.files, projectId);
  const { can, isAdmin, isCliente, isProfesional } = usePermissions();
  const professionals  = useUsers(apis.users, "profesional", isAdmin);
  const { push }       = useNotifications();
  const confirm        = useConfirm();
  const [editingProgress, setEditingProgress] = useState<number | null>(null);
  const [selectedProfessional, setSelectedProfessional] = useState("");
  const [assigning, setAssigning] = useState(false);
  const [transitioning, setTransitioning] = useState<ProjectDTO["estado"] | null>(null);
  const projectAction = useRef(new ExclusiveAction());
  const [projectSaving, setProjectSaving] = useState(false);
  const [planningSaving, setPlanningSaving] = useState(false);

  const runProjectAction = (action: () => Promise<unknown>) => projectAction.current.run(async () => {
    setProjectSaving(true);
    try { await action(); }
    finally { setProjectSaving(false); }
  });

  const handleProgressSave = async () => {
    if (editingProgress === null) return;
    try { const ran = await runProjectAction(() => updateProgress(editingProgress)); if (!ran) return; setEditingProgress(null); push("Progreso actualizado", "success"); }
    catch (e) { push((e as { message?: string }).message ?? "Error", "error"); }
  };

  const handleMilestoneToggle = async (id: string | number) => {
    try { const ran = await runProjectAction(() => toggleMilestone(id)); if (!ran) return; push("Hito actualizado", "success"); }
    catch (e) { push((e as { message?: string }).message ?? "Error", "error"); }
  };

  const handleAssignProfessional = async () => {
    if (!selectedProfessional) return;
    try {
      setAssigning(true);
      const professional = (professionals.data ?? []).find(item => item.id === Number(selectedProfessional));
      if (!professional?.profesion) throw new Error("Selecciona un profesional con oficio configurado");
      await apis.projects.assign(projectId, professional.id);
      setSelectedProfessional("");
      await project.refresh();
      push("Profesional asignado", "success");
    } catch (e) { push((e as { message?: string }).message ?? "No se pudo asignar", "error"); }
    finally { setAssigning(false); }
  };

  const handleUnassignProfessional = async (userId: number) => {
    const ok = await confirm({ title: "Quitar del proyecto", message: "El profesional dejará de acceder a esta obra.", variant: "danger", confirmLabel: "Quitar" });
    if (!ok) return;
    try { await apis.projects.unassign(projectId, userId); await project.refresh(); push("Profesional desasignado", "success"); }
    catch (e) { push((e as { message?: string }).message ?? "No se pudo desasignar", "error"); }
  };

  const handleTransition = async (estado: ProjectDTO["estado"]) => {
    const ok = await confirm({ title: "Cambiar estado de la obra", message: `La obra pasará a ${estado.replace("_", " ")}.`, confirmLabel: "Confirmar" });
    if (!ok) return;
    try { setTransitioning(estado); await apis.projects.update(projectId, { estado, revision: project.data?.revision ?? 0 }); await project.refresh(); push("Estado actualizado", "success"); }
    catch (e) { push((e as { message?: string }).message ?? "No se pudo actualizar el estado", "error"); }
    finally { setTransitioning(null); }
  };

  const handlePlanningSave = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const milestoneName = String(form.get("milestoneName") ?? "").trim();
    const milestoneDate = String(form.get("milestoneDate") ?? "");
    const hitos = milestoneName
      ? [...(project.data?.hitos ?? []), { id: crypto.randomUUID(), nombre: milestoneName, completado: false, fecha: milestoneDate }]
      : project.data?.hitos ?? [];
    try {
      setPlanningSaving(true);
      await apis.projects.update(projectId, {
        fechaInicio: String(form.get("startDate")),
        fechaFinPrevista: String(form.get("endDate")),
        hitos,
        revision: project.data?.revision ?? 0,
      });
      await project.refresh();
      event.currentTarget.reset();
      push("Planificacion guardada", "success");
    } catch (cause) {
      push((cause as { message?: string }).message ?? "No se pudo guardar la planificacion", "error");
    } finally {
      setPlanningSaving(false);
    }
  };

  const handleFileUpload = async (file: File, sensitive: boolean, classification?: "publico" | "tecnico" | "contrato" | "factura" | "reservado") => {
    try { await files.upload(file, sensitive, classification); push(`${file.name} subido`, "success"); }
    catch (e) { push((e as { message?: string }).message ?? "Error", "error"); }
  };

  const handleFileDelete = async (fileId: number, name: string, sensitive: boolean) => {
    const ok = await confirm({
      title: sensitive ? "⚠ Archivo sensible" : "Eliminar archivo",
      message: sensitive
        ? <>Vas a eliminar <strong>{name}</strong>, un archivo marcado como sensible. La acción quedará registrada en el audit log.</>
        : <>¿Eliminar <strong>{name}</strong>?</>,
      variant: "danger",
      confirmLabel: "Eliminar",
    });
    if (!ok) return;
    try { await files.remove(fileId); push("Archivo eliminado", "success"); }
    catch (e) { push((e as { message?: string }).message ?? "Error", "error"); }
  };

  const handleFileDownload = async (fileId: number, name: string) => {
    try {
      const blob = await apis.files.download(fileId);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url; link.download = name; link.click();
      URL.revokeObjectURL(url);
    } catch (e) { push((e as { message?: string }).message ?? "No se pudo descargar el archivo", "error"); }
  };

  if (project.loading) return <div style={{ display: "flex", justifyContent: "center", padding: 60 }}><Spinner size={32} /></div>;
  if (project.error || !project.data) {
    return <div role="alert" style={{ color: "#b5483f", padding: 20 }}><p>{project.error ?? "Proyecto no encontrado"}</p><div style={{ display: "flex", gap: 8, marginTop: 12 }}><Button small onClick={() => void project.refresh()}>Reintentar</Button><Button small variant="ghost" onClick={onBack}>Volver</Button></div></div>;
  }

  const p = project.data;
  const canUpdateProgress = can("project.update.progress",   { project: p as never });
  const canEditMilestones = can("project.update.milestones", { project: p as never });
  const canManageProject  = can("project.update");
  const canUploadFiles    = can("project.read", { project: p as never });
  const projectAssignments = p.profesionalesAsignados ?? [];
  const assignableProfessionals = (professionals.data ?? []).filter(item => item.activo && item.profesion && !projectAssignments.some(assignment => assignment.userId === item.id));
  const nextStates: Record<ProjectDTO["estado"], ProjectDTO["estado"][]> = { planificacion: ["en_curso"], en_curso: ["pausado", "finalizado"], pausado: ["en_curso", "finalizado"], finalizado: [] };
  const startReady = new Date(p.fechaFinPrevista).getTime() > new Date(p.fechaInicio).getTime() && projectAssignments.length > 0 && p.hitos.length > 0;

  return (
    <section className="project-detail">
      <nav className="project-detail__back" style={{ marginBottom: 20 }}>
        <Button variant="ghost" small onClick={onBack}>← Volver</Button>
      </nav>

      <PageHeader
        title={p.nombre}
        subtitle={`${p.direccion} · ${p.tipo}`}
        actions={<>
          <ProjectStatusBadge estado={p.estado} />
          {isProfesional && ["planificacion", "en_curso"].includes(p.estado) && (
            <a className="professional-work-link" href={`#/profesional/work?projectId=${p.id}`}>
              Registrar trabajo
            </a>
          )}
        </>}
      />
      {isAdmin && nextStates[p.estado].length > 0 && <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 20 }}>
        {nextStates[p.estado].map(estado => <Button key={estado} small variant="ghost" loading={transitioning === estado} disabled={transitioning !== null || (estado === "en_curso" && p.estado === "planificacion" && !startReady) || (estado === "finalizado" && p.progreso !== 100)} onClick={() => void handleTransition(estado)}>{estado === "en_curso" ? "Iniciar/Reanudar obra" : estado === "pausado" ? "Pausar obra" : "Finalizar obra"}</Button>)}
        {p.estado === "planificacion" && !startReady && <p style={{ width: "100%", color: "#71685e", fontSize: 12 }}>Completa las fechas, asigna un profesional y crea al menos un hito para iniciar la obra.</p>}
        {nextStates[p.estado].includes("finalizado") && p.progreso !== 100 && <p style={{ width: "100%", color: "#71685e", fontSize: 12 }}>Completa el progreso al 100 % para finalizar la obra.</p>}
      </div>}

      <div className="project-detail-layout" style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 24, alignItems: "flex-start" }}>
        {/* ─── MAIN ──────────────────────────────────── */}
        <div className="project-detail__main">
          {isAdmin && p.estado === "planificacion" && (
            <section className="project-detail__section" style={{ marginBottom: 30 }}>
              <h2 style={sectionTitle}>Planificacion de inicio</h2>
              <form className="private-filter-bar" onSubmit={handlePlanningSave}>
                <label>Fecha de inicio<input name="startDate" type="date" required defaultValue={p.fechaInicio.slice(0, 10)} /></label>
                <label>Entrega prevista<input name="endDate" type="date" required defaultValue={p.fechaFinPrevista.slice(0, 10)} /></label>
                <label>Nuevo hito<input name="milestoneName" maxLength={300} placeholder={p.hitos.length ? "Opcional" : "Ej. Demoliciones terminadas"} required={p.hitos.length === 0} /></label>
                <label>Fecha del hito<input name="milestoneDate" type="date" defaultValue={p.fechaFinPrevista.slice(0, 10)} required={p.hitos.length === 0} /></label>
                <Button type="submit" small loading={planningSaving}>Guardar planificacion</Button>
              </form>
            </section>
          )}
          {/* Progress */}
          <section className="project-detail__section" style={{ marginBottom: 30 }}>
            <h2 style={sectionTitle}>Progreso</h2>
            <div className="project-detail__progress-card" style={{ padding: 20, background: "#fffaf4", border: "1px solid #d8c4ad", borderRadius: 10 }}>
              {editingProgress === null ? (
                <>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                    <strong style={{ fontSize: 28, color: "#302d29" }}>{p.progreso}%</strong>
                    {canUpdateProgress && <Button small variant="ghost" onClick={() => setEditingProgress(p.progreso)}>Editar</Button>}
                  </div>
                  <div style={{ height: 8, background: "#d8c4ad", borderRadius: 4, overflow: "hidden" }}>
                    <div style={{ width: `${p.progreso}%`, height: "100%", background: "#c17248", transition: "width .3s" }} />
                  </div>
                </>
              ) : (
                <div className="project-progress-editor" style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <input type="range" aria-label="Porcentaje de progreso de la obra" min="0" max="100" value={editingProgress}
                    onChange={e => setEditingProgress(parseInt(e.target.value, 10))}
                    style={{ flex: 1 }} />
                  <strong style={{ minWidth: 50, textAlign: "right", color: "#c17248" }}>{editingProgress}%</strong>
                  <Button small loading={projectSaving} disabled={projectSaving} onClick={handleProgressSave}>Guardar</Button>
                  <Button small variant="ghost" disabled={projectSaving} onClick={() => setEditingProgress(null)}>Cancelar</Button>
                </div>
              )}
            </div>
          </section>

          {/* Milestones */}
          <section className="project-detail__section" style={{ marginBottom: 30 }}>
            <h2 style={sectionTitle}>Hitos ({p.hitos.filter(h => h.completado).length}/{p.hitos.length})</h2>
            {p.hitos.length === 0
              ? <p style={{ fontSize: 12, color: "#71685e" }}>No hay hitos definidos.</p>
              : <ul className="project-milestone-list" style={{ listStyle: "none", padding: 0, display: "grid", gap: 6 }}>
                  {p.hitos.map(h => (
                    <li className="project-milestone-item" key={h.id}
                      style={{ display: "flex", alignItems: "center", gap: 10, padding: 12, background: h.completado ? "#34d39908" : "#fffaf4", border: `1px solid ${h.completado ? "#34d399" : "#d8c4ad"}`, borderRadius: 8 }}>
                      <input type="checkbox" aria-label={`${h.completado ? "Marcar pendiente" : "Marcar completado"}: ${h.nombre}`} checked={h.completado} disabled={!canEditMilestones || projectSaving}
                        onChange={() => handleMilestoneToggle(h.id)}
                        style={{ cursor: canEditMilestones ? "pointer" : "not-allowed" }} />
                      <div style={{ flex: 1 }}>
                        <p style={{ fontSize: 13, color: h.completado ? "#34d399" : "#302d29", textDecoration: h.completado ? "line-through" : "none" }}>{h.nombre}</p>
                        <p style={{ fontSize: 12, color: "#71685e" }}>{formatDate(h.fecha)}</p>
                      </div>
                    </li>
                  ))}
                </ul>
            }
          </section>

          {/* Files */}
          <section className="project-detail__section">
            <div className="project-documents-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <h2 style={sectionTitle}>Documentos ({files.data.length})</h2>
              {canUploadFiles && <FileUploadButton onUpload={handleFileUpload} canMarkSensitive={canManageProject} />}
            </div>
            {files.loading
              ? <div style={{ display: "flex", justifyContent: "center", padding: 24 }}><Spinner /></div>
              : files.error
                ? <div role="alert" style={{ color: "#b5483f" }}><p>{files.error}</p><Button small variant="ghost" onClick={() => void files.refresh()}>Reintentar</Button></div>
              : files.data.length === 0
              ? <EmptyState icon="📄" title="Sin documentos" hint={isAdmin ? "Sube planos, fotos, contratos o facturas" : isCliente ? "Comparte fotos o documentos generales" : "Sube fotos o documentación técnica"} />
              : <ul className="project-file-list" style={{ listStyle: "none", padding: 0, display: "grid", gap: 6 }}>
                  {files.data.map(f => (
                    <li className="project-file-item" key={f.id}
                      style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: 10, background: "#fffaf4", border: "1px solid #d8c4ad", borderRadius: 8 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                        <span style={{ fontSize: 18 }}>{f.tipo.startsWith("image/") ? "🖼" : f.tipo === "application/pdf" ? "📄" : "📎"}</span>
                        <button type="button" onClick={() => handleFileDownload(f.id, f.nombre)} title={`Descargar ${f.nombre}`} style={{ minWidth: 0, textAlign: "left", border: 0, padding: 0, background: "transparent", cursor: "pointer" }}>
                          <p style={{ fontSize: 13, color: "#302d29", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.nombre}</p>
                          <p style={{ fontSize: 12, color: "#71685e" }}>{formatBytes(f.tamaño)} · {formatDate(f.uploadedAt)}</p>
                        </button>
                        {f.sensitive && <Badge color="#b5483f">SENSIBLE</Badge>}
                      </div>
                      {canManageProject && <Button small variant="danger" onClick={() => handleFileDelete(f.id, f.nombre, f.sensitive)}>✕</Button>}
                    </li>
                  ))}
                </ul>
            }
          </section>
        </div>

        {/* ─── SIDEBAR ───────────────────────────────── */}
        <aside className="project-detail__sidebar">
          <div className="project-detail__aside-card" style={{ padding: 18, background: "#f8efe4", border: "1px solid #d8c4ad", borderRadius: 10, marginBottom: 14 }}>
            <h3 style={{ ...sectionTitle, marginBottom: 10 }}>Detalles</h3>
            <dl style={{ display: "grid", gap: 10, fontSize: 12 }}>
              {(isAdmin || isCliente) && p.financialSummary && <>
                <Meta k="Base imponible" v={formatMoney(p.financialSummary.baseAmount)} />
                <Meta k="IVA" v={formatMoney(p.financialSummary.vatAmount)} />
                <Meta k="Total" v={formatMoney(p.financialSummary.totalAmount)} />
              </>}
              {(isAdmin || isCliente) && !p.financialSummary && p.presupuesto !== undefined && <Meta k="Base imponible histórica" v={formatMoney(p.presupuesto)} />}
              <Meta k="Fecha inicio"      v={formatDate(p.fechaInicio)} />
              <Meta k="Entrega prevista"  v={formatDate(p.fechaFinPrevista)} />
              <Meta k="Tipo"               v={p.tipo} />
            </dl>
          </div>

          {canManageProject && (
            <div className="project-detail__aside-card" style={{ padding: 18, background: "#f8efe4", border: "1px solid #d8c4ad", borderRadius: 10 }}>
              <h3 style={{ ...sectionTitle, marginBottom: 10 }}>Equipo ({projectAssignments.length})</h3>
              <ul style={{ listStyle: "none", padding: 0, display: "grid", gap: 6 }}>
                {projectAssignments.map(a => (
                  <li key={a.userId} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "#302d29" }}>
                    <ProfesionBadge profesion={a.profesion as Profesion} />
                    {canManageProject && <Button small variant="ghost" onClick={() => handleUnassignProfessional(a.userId)}>Quitar</Button>}
                  </li>
                ))}
              </ul>
              {canManageProject && (
                <div style={{ display: "flex", gap: 6, marginTop: 12 }}>
                  <select aria-label="Asignar profesional" value={selectedProfessional} onChange={event => setSelectedProfessional(event.target.value)} style={{ minWidth: 0, flex: 1 }}>
                    <option value="">{professionals.loading ? "Cargando profesionales…" : "Asignar profesional"}</option>
                    {assignableProfessionals.map(item => <option key={item.id} value={item.id}>{item.nombre} · {item.profesion}</option>)}
                  </select>
                  <Button small onClick={handleAssignProfessional} disabled={!selectedProfessional || assigning}>{assigning ? "…" : "Añadir"}</Button>
                </div>
              )}
            </div>
          )}
        </aside>
      </div>
      {(isAdmin || isCliente) && <ChangeOrders api={apis.projects} projectId={projectId} admin={isAdmin} onChanged={project.refresh} />}
    </section>
  );
}

const sectionTitle = { fontSize: 12, fontWeight: 700, color: "#c17248", textTransform: "uppercase" as const, letterSpacing: ".05em", marginBottom: 10 };

function Meta({ k, v }: { k: string; v: string }) {
  return (
    <div className="project-detail__meta" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingBottom: 8, borderBottom: "1px solid #decdb8" }}>
      <dt style={{ color: "#71685e" }}>{k}</dt>
      <dd style={{ color: "#302d29", fontWeight: 600 }}>{v}</dd>
    </div>
  );
}

function FileUploadButton({ onUpload, canMarkSensitive }: {
  onUpload: (file: File, sensitive: boolean, classification: "publico" | "tecnico" | "contrato" | "factura" | "reservado") => Promise<void>;
  canMarkSensitive: boolean;
}) {
  const [classification, setClassification] = useState<"publico" | "tecnico" | "contrato" | "factura" | "reservado">("publico");
  const [uploading, setUploading] = useState(false);
  return (
    <div className="file-upload-controls" style={{ display: "flex", alignItems: "center", gap: 10 }}>
      {canMarkSensitive && (
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#71685e" }}>
          Tipo de documento
          <select value={classification} onChange={e => setClassification(e.target.value as typeof classification)}>
            <option value="publico">General</option><option value="tecnico">Documentación técnica</option><option value="contrato">Contrato</option><option value="factura">Factura</option><option value="reservado">Reservado</option>
          </select>
        </label>
      )}
      <label style={{ position: "relative", overflow: "hidden", cursor: uploading ? "wait" : "pointer", padding: "6px 12px", fontSize: 12, fontWeight: 600, background: "#c17248", color: "#302d29", borderRadius: 6 }}>
        {uploading ? "Subiendo…" : "+ Subir archivo"}
        <input type="file" aria-label="Seleccionar archivo para subir" disabled={uploading} style={{ position: "absolute", inset: 0, opacity: 0, cursor: uploading ? "wait" : "pointer" }}
          onChange={async e => {
            const file = e.target.files?.[0];
            if (file) {
              setUploading(true);
              try { await onUpload(file, ["contrato", "factura", "reservado"].includes(classification), classification); }
              finally { setUploading(false); }
            }
            e.target.value = "";
          }} />
      </label>
    </div>
  );
}
