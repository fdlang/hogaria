/**
 * ClientDashboard — the cliente's home page.
 *
 * Shows stat cards, pending budgets (with call-to-action), and project list.
 * Compare with the original 120-line inline implementation.
 */

import { useMemo } from "react";
import { ProjectsApi } from "@/features/projects/api/projects.api";
import { BudgetsApi }  from "@/features/budgets/api/budgets.api";
import { useProjects } from "../hooks/useProjects";
import { useBudgets }  from "@/features/budgets/hooks/useBudgets";
import { useAuth }     from "@/features/auth/hooks/useAuth";
import { Button, Spinner, EmptyState } from "@/shared/ui";
import { PageHeader } from "@/shared/ui/page-header";
import { StatCard }   from "@/shared/ui/stat-card";
import { ProjectStatusBadge } from "@/shared/ui/badges";
import { formatMoney, formatDate } from "@/shared/lib/formatters";

interface Props {
  apis: { projects: ProjectsApi; budgets: BudgetsApi };
  onOpenProject: (id: number) => void;
  onOpenBudget:  (id: number) => void;
  onSignBudget:  (id: number) => void;
}

export function ClientDashboard({ apis, onOpenProject, onOpenBudget, onSignBudget }: Props) {
  const { user } = useAuth();
  const projects = useProjects(apis.projects);
  const budgets  = useBudgets(apis.budgets);

  const stats = useMemo(() => {
    const proj = projects.data ?? [];
    const bgs  = budgets.data  ?? [];
    return {
      activos:         proj.filter(p => p.estado === "en_curso").length,
      pendientesFirma: bgs.filter(b => b.estado === "enviado").length,
      firmados:        bgs.filter(b => b.estado === "firmado").length,
      inversion:       bgs.filter(b => b.estado === "firmado").reduce((acc, b) => {
        const subtotal = b.partidas.reduce((s, p) => s + p.cantidad * p.precioUnit * (1 - p.descuento / 100), 0);
        const iva      = b.partidas.reduce((s, p) => s + p.cantidad * p.precioUnit * (1 - p.descuento / 100) * ((p.iva ?? b.ivaDefault) / 100), 0);
        return acc + subtotal + iva;
      }, 0),
    };
  }, [projects.data, budgets.data]);

  const pendingBudgets = useMemo(
    () => (budgets.data ?? []).filter(b => b.estado === "enviado"),
    [budgets.data],
  );

  if (projects.loading || budgets.loading) {
    return <div style={{ display: "flex", justifyContent: "center", padding: 60 }}><Spinner size={32} /></div>;
  }
  if (projects.error || budgets.error) {
    return <div role="alert" style={{ color: "#f87171", padding: 20 }}>{projects.error ?? budgets.error}</div>;
  }

  const proj = projects.data ?? [];

  return (
    <section>
      <PageHeader title={`Hola, ${user?.nombre ?? ""}`} subtitle="Resumen de tus proyectos" />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, marginBottom: 30 }}>
        <StatCard label="Proyectos activos"    value={stats.activos}          accent="#34d399" />
        <StatCard label="Pendientes de firma"  value={stats.pendientesFirma}  accent={stats.pendientesFirma > 0 ? "#fbbf24" : "#d8c4ad"} />
        <StatCard label="Presupuestos firmados" value={stats.firmados}         accent="#c17248" />
        <StatCard label="Inversión total"       value={formatMoney(stats.inversion)} accent="#60a5fa" />
      </div>

      {pendingBudgets.length > 0 && (
        <section style={{ marginBottom: 30, padding: 18, background: "#fbbf2408", border: "1px solid #fbbf24", borderRadius: 10 }}>
          <h2 style={{ fontSize: 15, fontWeight: 600, color: "#fbbf24", marginBottom: 10 }}>
            ⏳ Presupuestos esperando tu firma ({pendingBudgets.length})
          </h2>
          <div style={{ display: "grid", gap: 8 }}>
            {pendingBudgets.map(b => (
              <article key={b.id}
                style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: 12, background: "#fffaf4", borderRadius: 8 }}>
                <div>
                  <h3 style={{ fontSize: 13, fontWeight: 600, color: "#302d29" }}>{b.nombre}</h3>
                  <p style={{ fontSize: 12, color: "#71685e" }}>Recibido {formatDate(b.fechaEnvio)} · Validez {b.validezDias} días</p>
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  <Button small variant="ghost" onClick={() => onOpenBudget(b.id)}>Revisar</Button>
                  <Button small onClick={() => onSignBudget(b.id)}>✍ Firmar</Button>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      <h2 style={{ fontSize: 15, fontWeight: 700, color: "#c17248", textTransform: "uppercase", letterSpacing: ".05em", marginBottom: 14 }}>
        Mis proyectos
      </h2>

      {proj.length === 0
        ? <EmptyState icon="◎" title="Aún no tienes proyectos" hint="Nuestro equipo contactará contigo para empezar" />
        : <div role="list" style={{ display: "grid", gap: 10 }}>
            {proj.map(p => (
              <button key={p.id} role="listitem" onClick={() => onOpenProject(p.id)}
                style={{ textAlign: "left", padding: 16, background: "#fffaf4", border: "1px solid #d8c4ad", borderRadius: 10, cursor: "pointer" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
                  <div>
                    <h3 style={{ fontSize: 15, fontWeight: 600, color: "#302d29" }}>{p.nombre}</h3>
                    <p style={{ fontSize: 12, color: "#71685e", marginTop: 2 }}>{p.direccion}</p>
                  </div>
                  <ProjectStatusBadge estado={p.estado} />
                </div>

                <div style={{ marginTop: 10 }}>
                  <div style={{ height: 4, background: "#d8c4ad", borderRadius: 2, overflow: "hidden" }}>
                    <div style={{ width: `${p.progreso}%`, height: "100%", background: "#c17248", transition: "width .3s" }} />
                  </div>
                  <p style={{ fontSize: 12, color: "#71685e", marginTop: 4 }}>
                    {p.progreso}% completado · entrega prevista {formatDate(p.fechaFinPrevista)}
                  </p>
                </div>
              </button>
            ))}
          </div>
      }
    </section>
  );
}
