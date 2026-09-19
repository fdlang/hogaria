/**
 * AdminProfesionales — dedicated view for the "profesional" user subset.
 *
 * Counts assignments per user (derived from projects), groups by profession.
 * Reuses useUsers and useProjects so data is consistent with other views.
 */

import { useMemo, useState } from "react";
import { UsersApi } from "../api/users.api";
import { ProjectsApi } from "@/features/projects/api/projects.api";
import { useUsers } from "../hooks/useUsers";
import { useProjects } from "@/features/projects/hooks/useProjects";
import { Spinner, EmptyState, Badge } from "@/shared/ui";
import { PageHeader } from "@/shared/ui/page-header";
import { StatCard }   from "@/shared/ui/stat-card";
import { ProfesionBadge } from "@/shared/ui/badges";
import { formatDate } from "@/shared/lib/formatters";
import { Button } from "@/shared/ui";
import { useNotifications } from "@/shared/ui/notifications";
import { PROFESIONES, PermissionPolicy, Profesion } from "@reformapro/domain";

interface Props {
  apis: { users: UsersApi; projects: ProjectsApi };
}

export function AdminProfesionales({ apis }: Props) {
  const users    = useUsers(apis.users, "profesional");
  const projects = useProjects(apis.projects);
  const { push } = useNotifications();
  const [sendingId, setSendingId] = useState<number | null>(null);

  const sendAccess = async (id: number) => {
    try { setSendingId(id); await apis.users.resendInvitation(id); push("Enlace de acceso enviado", "success"); }
    catch (error) { push((error as { message?: string }).message ?? "No se pudo enviar el acceso", "error"); }
    finally { setSendingId(null); }
  };

  const assignments = useMemo(() => {
    const map = new Map<number, number>();
    (projects.data ?? []).forEach(p => p.profesionalesAsignados.forEach(a => {
      map.set(a.userId, (map.get(a.userId) ?? 0) + 1);
    }));
    return map;
  }, [projects.data]);

  if (users.loading || projects.loading) return <div style={{ display: "flex", justifyContent: "center", padding: 60 }}><Spinner size={32} /></div>;
  if (users.error || projects.error)     return <div role="alert" style={{ color: "#f87171", padding: 20 }}>{users.error ?? projects.error}</div>;

  const userList = users.data ?? [];
  const totalAssignments = (projects.data ?? []).reduce((n, p) => n + p.profesionalesAsignados.length, 0);

  return (
    <section>
      <PageHeader
        title="Profesionales"
        subtitle={`${userList.length} profesionales · ${userList.filter(u => u.activo).length} activos · ${totalAssignments} asignaciones totales`}
      />

      {/* Profession summary grid */}
      <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 12, marginBottom: 30 }}>
        {Object.values(PROFESIONES).map(p => {
          const n = userList.filter(u => u.profesion === p.value && u.activo).length;
          return <StatCard key={p.value} label={p.label} value={n} accent={p.color} hint={`${n === 1 ? "activo" : "activos"}`} icon={p.icon} />;
        })}
      </section>

      {/* List */}
      {userList.length === 0
        ? <EmptyState icon="⬡" title="No hay profesionales" hint="Añade uno desde Usuarios" />
        : <div role="list" style={{ display: "grid", gap: 10 }}>
            {userList.map(u => {
              const prof = u.profesion ? PROFESIONES[u.profesion as Profesion] : null;
              const perms = u.profesion ? PermissionPolicy.PROFESSIONAL_ACCESS[u.profesion as Profesion] : null;
              const assigned = assignments.get(u.id) ?? 0;
              return (
                <article key={u.id} role="listitem"
                  style={{ padding: 16, background: u.activo ? "#fffaf4" : "#f8efe4", border: "1px solid #d8c4ad", borderRadius: 10, opacity: u.activo ? 1 : 0.55 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                    {prof && <div style={{ width: 42, height: 42, borderRadius: "50%", background: `${prof.color}18`, color: prof.color, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20 }}>{prof.icon}</div>}
                    <div style={{ flex: 1 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
                        <h3 style={{ fontSize: 14, fontWeight: 600, color: "#302d29" }}>{u.nombre}</h3>
                        {u.profesion && <ProfesionBadge profesion={u.profesion as Profesion} />}
                        <Badge color="#60a5fa">{assigned} proyectos</Badge>
                        {!u.activo && <code style={{ fontSize: 12, color: "#c17248", background: "#c1724818", padding: "1px 5px", borderRadius: 3 }}>PENDIENTE DE ACTIVACIÓN</code>}
                      </div>
                      <p style={{ fontSize: 12, color: "#71685e" }}>{u.email}{u.telefono && ` · ${u.telefono}`} · desde {formatDate(u.createdAt)}</p>
                      <div style={{ marginTop: 8 }}>
                        <Button small variant="ghost" onClick={() => sendAccess(u.id)} disabled={sendingId === u.id}>
                          {sendingId === u.id ? "Enviando…" : "Enviar acceso"}
                        </Button>
                      </div>
                      {perms && (
                        <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 6 }}>
                          {Object.entries(perms).filter(([, v]) => v).map(([k]) => (
                            <code key={k} style={{ fontSize: 12, background: "#fffaf4", color: "#71685e", padding: "1px 5px", borderRadius: 3 }}>
                              {k.replace(/([A-Z])/g, " $1").toLowerCase()}
                            </code>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>}
    </section>
  );
}
