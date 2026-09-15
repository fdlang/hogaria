/**
 * ProfesionalDashboard — the profesional's home page.
 * Shows only projects where they are assigned. Highlights their profession
 * and the permissions they have (via PermissionPolicy.PROFESSIONAL_ACCESS).
 */

import { useMemo } from "react";
import { ProjectsApi } from "@/features/projects/api/projects.api";
import { useProjects } from "../hooks/useProjects";
import { useAuth }     from "@/features/auth/hooks/useAuth";
import { Spinner, EmptyState } from "@/shared/ui";
import { PageHeader } from "@/shared/ui/page-header";
import { StatCard }   from "@/shared/ui/stat-card";
import { ProjectStatusBadge, ProfesionBadge } from "@/shared/ui/badges";
import { formatDate } from "@/shared/lib/formatters";
import { PROFESIONES, PermissionPolicy, Profesion } from "@reformapro/domain";

interface Props {
  apis: { projects: ProjectsApi };
  onOpenProject: (id: number) => void;
}

export function ProfesionalDashboard({ apis, onOpenProject }: Props) {
  const { user } = useAuth();
  const projects = useProjects(apis.projects);

  const perms    = user?.profesion ? PermissionPolicy.PROFESSIONAL_ACCESS[user.profesion as Profesion] : null;
  const profInfo = user?.profesion ? PROFESIONES[user.profesion as Profesion] : null;

  const stats = useMemo(() => {
    const data = projects.data ?? [];
    return {
      activos:        data.filter(p => p.estado === "en_curso").length,
      finalizados:    data.filter(p => p.estado === "finalizado").length,
      hitosAbiertos:  data.reduce((n, p) => n + p.hitos.filter(h => !h.completado).length, 0),
    };
  }, [projects.data]);

  if (projects.loading) return <div style={{ display: "flex", justifyContent: "center", padding: 60 }}><Spinner size={32} /></div>;
  if (projects.error)   return <div role="alert" style={{ color: "#f87171", padding: 20 }}>{projects.error}</div>;

  const proj = projects.data ?? [];

  return (
    <section>
      <header style={{ display: "flex", alignItems: "center", gap: 18, marginBottom: 30 }}>
        {profInfo && <div style={{ width: 56, height: 56, borderRadius: "50%", background: `${profInfo.color}18`, color: profInfo.color, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 26 }}>{profInfo.icon}</div>}
        <div style={{ flex: 1 }}>
          <PageHeader
            title={`Hola, ${user?.nombre ?? ""}`}
            subtitle={profInfo?.desc}
          />
        </div>
      </header>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, marginBottom: 30 }}>
        <StatCard label="Proyectos activos"      value={stats.activos}       accent="#34d399" />
        <StatCard label="Hitos pendientes"        value={stats.hitosAbiertos} accent="#fbbf24" />
        <StatCard label="Proyectos finalizados"   value={stats.finalizados}   accent="#c17248" />
      </div>

      {perms && (
        <aside style={{ padding: 14, background: "#f8efe4", border: "1px solid #d8c4ad", borderRadius: 10, marginBottom: 24, fontSize: 12, color: "#71685e" }}>
          <strong style={{ color: "#c17248", display: "block", marginBottom: 6, fontSize: 12, letterSpacing: ".05em", textTransform: "uppercase" }}>Tus permisos</strong>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {Object.entries(perms).map(([k, v]) => (
              <code key={k} style={{ fontSize: 12, padding: "2px 6px", borderRadius: 4, background: v ? "#34d39918" : "#f8717118", color: v ? "#34d399" : "#f87171" }}>
                {v ? "✓" : "✗"} {k.replace(/([A-Z])/g, " $1").toLowerCase()}
              </code>
            ))}
          </div>
        </aside>
      )}

      <h2 style={{ fontSize: 15, fontWeight: 700, color: "#c17248", textTransform: "uppercase", letterSpacing: ".05em", marginBottom: 14 }}>
        Proyectos asignados
      </h2>

      {proj.length === 0
        ? <EmptyState icon="◎" title="Sin proyectos asignados" hint="El administrador te asignará cuando corresponda" />
        : <div role="list" style={{ display: "grid", gap: 10 }}>
            {proj.map(p => {
              const pendingMilestones = p.hitos.filter(h => !h.completado).length;
              return (
                <button key={p.id} role="listitem" onClick={() => onOpenProject(p.id)}
                  style={{ textAlign: "left", padding: 16, background: "#fffaf4", border: "1px solid #d8c4ad", borderRadius: 10, cursor: "pointer" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                    <h3 style={{ fontSize: 15, fontWeight: 600, color: "#302d29" }}>{p.nombre}</h3>
                    <div style={{ display: "flex", gap: 6 }}>
                      {user?.profesion && <ProfesionBadge profesion={user.profesion as Profesion} />}
                      <ProjectStatusBadge estado={p.estado} />
                    </div>
                  </div>
                  <p style={{ fontSize: 12, color: "#71685e" }}>
                    {p.direccion} · {p.progreso}% · entrega {formatDate(p.fechaFinPrevista)}
                    {pendingMilestones > 0 && ` · ${pendingMilestones} hitos pendientes`}
                  </p>
                </button>
              );
            })}
          </div>
      }
    </section>
  );
}
