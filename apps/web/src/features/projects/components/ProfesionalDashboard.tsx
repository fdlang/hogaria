/**
 * ProfesionalDashboard — the profesional's home page.
 * Shows only projects where they are assigned and highlights their profession.
 */

import { useMemo } from "react";
import { ProjectsApi } from "@/features/projects/api/projects.api";
import { useProjects } from "../hooks/useProjects";
import { useAuth }     from "@/features/auth/hooks/useAuth";
import { Spinner, EmptyState, Button } from "@/shared/ui";
import { PageHeader } from "@/shared/ui/page-header";
import { StatCard }   from "@/shared/ui/stat-card";
import { ProjectStatusBadge, ProfesionBadge } from "@/shared/ui/badges";
import { formatDate } from "@/shared/lib/formatters";
import { PROFESIONES, Profesion } from "@reformapro/domain";

interface Props {
  apis: { projects: ProjectsApi };
  onOpenProject: (id: number) => void;
  onOpenWork: () => void;
}

export function ProfesionalDashboard({ apis, onOpenProject, onOpenWork }: Props) {
  const { user } = useAuth();
  const projects = useProjects(apis.projects);

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
  if (projects.error)   return <div role="alert" style={{ color: "#b5483f", padding: 20 }}>{projects.error}</div>;

  const proj = projects.data ?? [];

  return (
    <section className="private-page professional-dashboard">
      <header className="professional-dashboard-header" style={{ display: "flex", alignItems: "center", gap: 18, marginBottom: 30 }}>
        {profInfo && <div style={{ width: 56, height: 56, borderRadius: "50%", background: `${profInfo.color}18`, color: profInfo.color, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 26 }}>{profInfo.icon}</div>}
        <div style={{ flex: 1 }}>
          <PageHeader
            title={`Hola, ${user?.nombre ?? ""}`}
            subtitle={profInfo?.desc}
          />
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Button small variant="ghost" loading={projects.loading} onClick={() => void projects.refresh()}>
            Actualizar obras
          </Button>
          <Button className="professional-work-cta" small onClick={onOpenWork}>
            Registrar trabajo
          </Button>
        </div>
      </header>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, marginBottom: 30 }}>
        <StatCard label="Proyectos activos"      value={stats.activos}       accent="#34d399" />
        <StatCard label="Hitos pendientes"        value={stats.hitosAbiertos} accent="#fbbf24" />
        <StatCard label="Proyectos finalizados"   value={stats.finalizados}   accent="#c17248" />
      </div>

      <h2 style={{ fontSize: 15, fontWeight: 700, color: "#c17248", textTransform: "uppercase", letterSpacing: ".05em", marginBottom: 14 }}>
        Proyectos asignados
      </h2>

      {proj.length === 0
        ? <EmptyState icon="◎" title="Sin proyectos asignados" hint="Necesitas una obra asignada para registrar trabajo. Administración te avisará cuando esté disponible." />
        : <div role="list" style={{ display: "grid", gap: 10 }}>
            {proj.map(p => {
              const pendingMilestones = p.hitos.filter(h => !h.completado).length;
              return (
                <button className="private-project-card" key={p.id} role="listitem" onClick={() => onOpenProject(p.id)}
                  style={{ textAlign: "left", padding: 16, background: "#fffaf4", border: "1px solid #d8c4ad", borderRadius: 10, cursor: "pointer" }}>
                  <div className="private-project-card__header" style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
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
