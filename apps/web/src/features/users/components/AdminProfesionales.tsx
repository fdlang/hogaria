import { useEffect, useMemo, useRef, useState } from "react";
import { UsersApi, type ProfessionalDocumentDTO, type UserDTO } from "../api/users.api";
import { ProjectsApi } from "@/features/projects/api/projects.api";
import { useUsers } from "../hooks/useUsers";
import { useProjects } from "@/features/projects/hooks/useProjects";
import { Spinner, EmptyState, Badge, Button, Modal } from "@/shared/ui";
import { PageHeader } from "@/shared/ui/page-header";
import { StatCard } from "@/shared/ui/stat-card";
import { ProfesionBadge } from "@/shared/ui/badges";
import { formatDate } from "@/shared/lib/formatters";
import { useNotifications } from "@/shared/ui/notifications";
import { useConfirm } from "@/shared/ui/confirm";
import { PROFESIONES, Profesion } from "@reformapro/domain";

interface Props { apis: { users: UsersApi; projects: ProjectsApi } }
const accountStatusOf = (user: UserDTO) => user.accountStatus ?? (user.activo ? "active" : "pending_activation");

export function AdminProfesionales({ apis }: Props) {
  const users = useUsers(apis.users, "profesional");
  const projects = useProjects(apis.projects);
  const [documentsFor, setDocumentsFor] = useState<UserDTO | null>(null);
  const assignments = useMemo(() => {
    const map = new Map<number, number>();
    (projects.data ?? []).forEach(project => project.profesionalesAsignados.forEach(assignment => map.set(assignment.userId, (map.get(assignment.userId) ?? 0) + 1)));
    return map;
  }, [projects.data]);

  if (users.loading || projects.loading) return <div style={{ display: "flex", justifyContent: "center", padding: 60 }}><Spinner size={32} /></div>;
  if (users.error || projects.error) return <div role="alert" style={{ color: "#b5483f", padding: 20 }}>{users.error ?? projects.error}</div>;
  const userList = (users.data ?? []).filter(user => accountStatusOf(user) !== "archived");
  const totalAssignments = (projects.data ?? []).reduce((total, project) => total + project.profesionalesAsignados.length, 0);

  return <section>
    <PageHeader title="Profesionales" subtitle={`${userList.length} profesionales · ${userList.filter(user => user.activo).length} activos · ${totalAssignments} asignaciones totales`} />
    <p><a href="#/admin/work">Gestionar jornadas, partes y tarifas internas</a></p>
    <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 12, marginBottom: 30 }}>
      {Object.values(PROFESIONES).map(profession => { const total = userList.filter(user => user.profesion === profession.value && user.activo).length; return <StatCard key={profession.value} label={profession.label} value={total} accent={profession.color} hint={total === 1 ? "activo" : "activos"} icon={profession.icon} />; })}
    </section>
    {userList.length === 0 ? <EmptyState icon="◫" title="No hay profesionales" hint="Añade uno desde Usuarios" /> : <div role="list" style={{ display: "grid", gap: 10 }}>
      {userList.map(user => {
        const profession = user.profesion ? PROFESIONES[user.profesion as Profesion] : null;
        return <article key={user.id} role="listitem" className="professional-card" style={{ padding: 16, background: user.activo ? "#fffaf4" : "#f8efe4", border: "1px solid #d8c4ad", borderRadius: 10, opacity: user.activo ? 1 : 0.7 }}>
          <div className="professional-card__main" style={{ display: "flex", alignItems: "center", gap: 14 }}>
            {profession && <div aria-hidden="true" style={{ width: 42, height: 42, borderRadius: "50%", background: `${profession.color}18`, color: profession.color, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20 }}>{profession.icon}</div>}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="professional-card__heading" style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4, flexWrap: "wrap" }}>
                <h3 style={{ fontSize: 14, fontWeight: 600, color: "#302d29" }}>{user.nombre}</h3>
                {user.profesion && <ProfesionBadge profesion={user.profesion as Profesion} />}
                <Badge color="#60a5fa">{assignments.get(user.id) ?? 0} proyectos</Badge>
                {accountStatusOf(user) === "pending_activation" && <Badge color="#a85f3b">Invitación pendiente</Badge>}
              </div>
              <p className="professional-card__meta" style={{ fontSize: 12, color: "#71685e" }}>{user.email}{user.telefono && ` · ${user.telefono}`} · desde {formatDate(user.createdAt)}</p>
              <div style={{ marginTop: 10 }}><Button small variant="ghost" onClick={() => setDocumentsFor(user)}>Documentación</Button></div>
            </div>
          </div>
        </article>;
      })}
    </div>}
    <ProfessionalDocumentsModal api={apis.users} professional={documentsFor} onClose={() => setDocumentsFor(null)} />
  </section>;
}

function ProfessionalDocumentsModal({ api, professional, onClose }: { api: UsersApi; professional: UserDTO | null; onClose: () => void }) {
  const { push } = useNotifications();
  const confirm = useConfirm();
  const inputRef = useRef<HTMLInputElement>(null);
  const [documents, setDocuments] = useState<ProfessionalDocumentDTO[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (!professional) { setDocuments([]); return; }
    let active = true;
    setLoading(true);
    api.listProfessionalDocuments(professional.id)
      .then(items => { if (active) setDocuments(items); })
      .catch(error => { if (active) push((error as { message?: string }).message ?? "No se pudo cargar la documentación", "error"); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [api, professional, push]);

  const upload = async (file: File | undefined) => {
    if (!professional || !file) return;
    setUploading(true);
    try { const created = await api.uploadProfessionalDocument(professional.id, file); setDocuments(current => [created, ...current]); push("Documento guardado", "success"); }
    catch (error) { push((error as { message?: string }).message ?? "No se pudo subir el documento", "error"); }
    finally { setUploading(false); if (inputRef.current) inputRef.current.value = ""; }
  };
  const download = async (document: ProfessionalDocumentDTO) => {
    try { const blob = await api.downloadProfessionalDocument(document.id); const url = URL.createObjectURL(blob); const link = window.document.createElement("a"); link.href = url; link.download = document.nombre; link.click(); URL.revokeObjectURL(url); }
    catch (error) { push((error as { message?: string }).message ?? "No se pudo descargar el documento", "error"); }
  };
  const remove = async (document: ProfessionalDocumentDTO) => {
    if (!await confirm({ title: "Eliminar documento", message: <>¿Eliminar <strong>{document.nombre}</strong>?</>, variant: "danger", confirmLabel: "Eliminar" })) return;
    try { await api.deleteProfessionalDocument(document.id); setDocuments(current => current.filter(item => item.id !== document.id)); push("Documento eliminado", "success"); }
    catch (error) { push((error as { message?: string }).message ?? "No se pudo eliminar el documento", "error"); }
  };

  return <Modal open={professional !== null} onClose={onClose} title={professional ? `Documentación · ${professional.nombre}` : "Documentación"} width={640}>
    <p style={{ color: "#71685e", fontSize: 13, marginBottom: 16 }}>Documentación interna del profesional. Solo es accesible para administración.</p>
    <input ref={inputRef} type="file" accept="application/pdf,image/jpeg,image/png,image/webp,image/gif" hidden onChange={event => void upload(event.target.files?.[0])} />
    <Button small loading={uploading} disabled={uploading} onClick={() => inputRef.current?.click()}>+ Subir documentación</Button>
    {loading ? <div style={{ padding: 24, textAlign: "center" }}><Spinner size={24} /></div> : documents.length === 0 ? <p style={{ padding: "24px 0", color: "#71685e" }}>No hay documentos guardados.</p> : <ul style={{ listStyle: "none", padding: 0, marginTop: 18, display: "grid", gap: 8 }}>
      {documents.map(document => <li key={document.id} style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", padding: 10, border: "1px solid #d8c4ad", borderRadius: 8 }}>
        <div style={{ flex: 1, minWidth: 0 }}><strong style={{ display: "block", overflowWrap: "anywhere" }}>{document.nombre}</strong><span style={{ color: "#71685e", fontSize: 12 }}>{formatDate(document.uploadedAt)} · {(document.tamano / 1024).toFixed(0)} KB</span></div>
        <Button small variant="ghost" onClick={() => void download(document)}>Descargar</Button><Button small variant="danger" onClick={() => void remove(document)}>Eliminar</Button>
      </li>)}
    </ul>}
  </Modal>;
}
