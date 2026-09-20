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

import { useState } from "react";
import { ProjectsApi } from "../api/projects.api";
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
  const { can, isAdmin, isCliente } = usePermissions();
  const professionals  = useUsers(apis.users, "profesional", isAdmin);
  const { push }       = useNotifications();
  const confirm        = useConfirm();
  const [editingProgress, setEditingProgress] = useState<number | null>(null);
  const [selectedProfessional, setSelectedProfessional] = useState("");
  const [assigning, setAssigning] = useState(false);

  const handleProgressSave = async () => {
    if (editingProgress === null) return;
    try { await updateProgress(editingProgress); setEditingProgress(null); push("Progreso actualizado", "success"); }
    catch (e) { push((e as { message?: string }).message ?? "Error", "error"); }
  };

  const handleMilestoneToggle = async (id: string | number) => {
    try { await toggleMilestone(id); push("Hito actualizado", "success"); }
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
    return <div role="alert" style={{ color: "#b5483f", padding: 20 }}>{project.error ?? "Proyecto no encontrado"}</div>;
  }

  const p = project.data;
  const canUpdateProgress = can("project.update.progress",   { project: p as never });
  const canEditMilestones = can("project.update.milestones", { project: p as never });
  const canManageProject  = can("project.update");
  const canUploadFiles    = can("project.read", { project: p as never });
  const assignableProfessionals = (professionals.data ?? []).filter(item => item.activo && item.profesion && !p.profesionalesAsignados.some(assignment => assignment.userId === item.id));

  return (
    <section>
      <nav style={{ marginBottom: 20 }}>
        <Button variant="ghost" small onClick={onBack}>← Volver</Button>
      </nav>

      <PageHeader
        title={p.nombre}
        subtitle={`${p.direccion} · ${p.tipo}`}
        actions={<ProjectStatusBadge estado={p.estado} />}
      />

      <div className="project-detail-layout" style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 24, alignItems: "flex-start" }}>
        {/* ─── MAIN ──────────────────────────────────── */}
        <div>
          {/* Progress */}
          <section style={{ marginBottom: 30 }}>
            <h2 style={sectionTitle}>Progreso</h2>
            <div style={{ padding: 20, background: "#fffaf4", border: "1px solid #d8c4ad", borderRadius: 10 }}>
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
                  <input type="range" min="0" max="100" value={editingProgress}
                    onChange={e => setEditingProgress(parseInt(e.target.value, 10))}
                    style={{ flex: 1 }} />
                  <strong style={{ minWidth: 50, textAlign: "right", color: "#c17248" }}>{editingProgress}%</strong>
                  <Button small onClick={handleProgressSave}>Guardar</Button>
                  <Button small variant="ghost" onClick={() => setEditingProgress(null)}>Cancelar</Button>
                </div>
              )}
            </div>
          </section>

          {/* Milestones */}
          <section style={{ marginBottom: 30 }}>
            <h2 style={sectionTitle}>Hitos ({p.hitos.filter(h => h.completado).length}/{p.hitos.length})</h2>
            {p.hitos.length === 0
              ? <p style={{ fontSize: 12, color: "#71685e" }}>No hay hitos definidos.</p>
              : <ul style={{ listStyle: "none", padding: 0, display: "grid", gap: 6 }}>
                  {p.hitos.map(h => (
                    <li key={h.id}
                      style={{ display: "flex", alignItems: "center", gap: 10, padding: 12, background: h.completado ? "#34d39908" : "#fffaf4", border: `1px solid ${h.completado ? "#34d399" : "#d8c4ad"}`, borderRadius: 8 }}>
                      <input type="checkbox" checked={h.completado} disabled={!canEditMilestones}
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
          <section>
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
              : <ul style={{ listStyle: "none", padding: 0, display: "grid", gap: 6 }}>
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
        <aside>
          <div style={{ padding: 18, background: "#f8efe4", border: "1px solid #d8c4ad", borderRadius: 10, marginBottom: 14 }}>
            <h3 style={{ ...sectionTitle, marginBottom: 10 }}>Detalles</h3>
            <dl style={{ display: "grid", gap: 10, fontSize: 12 }}>
              {(isAdmin || isCliente) && p.presupuesto !== undefined && <Meta k="Presupuesto" v={formatMoney(p.presupuesto)} />}
              <Meta k="Fecha inicio"      v={formatDate(p.fechaInicio)} />
              <Meta k="Entrega prevista"  v={formatDate(p.fechaFinPrevista)} />
              <Meta k="Tipo"               v={p.tipo} />
            </dl>
          </div>

          {(p.profesionalesAsignados.length > 0 || canManageProject) && (
            <div style={{ padding: 18, background: "#f8efe4", border: "1px solid #d8c4ad", borderRadius: 10 }}>
              <h3 style={{ ...sectionTitle, marginBottom: 10 }}>Equipo ({p.profesionalesAsignados.length})</h3>
              <ul style={{ listStyle: "none", padding: 0, display: "grid", gap: 6 }}>
                {p.profesionalesAsignados.map(a => (
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
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingBottom: 8, borderBottom: "1px solid #decdb8" }}>
      <dt style={{ color: "#71685e" }}>{k}</dt>
      <dd style={{ color: "#302d29", fontWeight: 600 }}>{v}</dd>
    </div>
  );
}

function FileUploadButton({ onUpload, canMarkSensitive }: {
  onUpload: (file: File, sensitive: boolean, classification: "publico" | "tecnico" | "contrato" | "factura" | "reservado") => void;
  canMarkSensitive: boolean;
}) {
  const [classification, setClassification] = useState<"publico" | "tecnico" | "contrato" | "factura" | "reservado">("publico");
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
      <label style={{ cursor: "pointer", padding: "6px 12px", fontSize: 12, fontWeight: 600, background: "#c17248", color: "#302d29", borderRadius: 6 }}>
        + Subir archivo
        <input type="file" style={{ display: "none" }}
          onChange={e => {
            const file = e.target.files?.[0];
            if (file) onUpload(file, ["contrato", "factura", "reservado"].includes(classification), classification);
            e.target.value = "";
          }} />
      </label>
    </div>
  );
}
