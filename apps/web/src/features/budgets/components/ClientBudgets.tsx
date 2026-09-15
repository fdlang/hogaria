/**
 * ClientBudgets — cliente's list of their own budgets.
 * Triggers the SignatureWizard on "Firmar".
 */

import { useState, useMemo, useCallback } from "react";
import { BudgetsApi, BudgetDTO } from "../api/budgets.api";
import { ProjectsApi }           from "@/features/projects/api/projects.api";
import { useBudgets }            from "../hooks/useBudgets";
import { useProjects }           from "@/features/projects/hooks/useProjects";
import { useAuth }                from "@/features/auth/hooks/useAuth";
import { useNotifications }       from "@/shared/ui/notifications";
import { Button, Modal, Spinner, EmptyState } from "@/shared/ui";
import { PageHeader } from "@/shared/ui/page-header";
import { BudgetStatusBadge } from "@/shared/ui/badges";
import { formatDate } from "@/shared/lib/formatters";
import { BudgetDetail } from "./BudgetDetail";
import { SignatureWizard } from "@/features/signatures/components/SignatureWizard";
import { generateBudgetPDF, DEFAULT_BRANDING } from "../pdf/generateBudgetPDF";

interface Props {
  apis: { budgets: BudgetsApi; projects: ProjectsApi };
}

type ModalState =
  | { kind: "closed" }
  | { kind: "view"; budget: BudgetDTO }
  | { kind: "sign"; budget: BudgetDTO };

export function ClientBudgets({ apis }: Props) {
  const { user } = useAuth();
  const budgets  = useBudgets(apis.budgets);
  const projects = useProjects(apis.projects);
  const { push } = useNotifications();

  const projectsById = useMemo(() => {
    const map: Record<number, string> = {};
    (projects.data ?? []).forEach(p => { map[p.id] = p.nombre; });
    return map;
  }, [projects.data]);

  const getProjectName = useCallback((id: number) => projectsById[id] ?? "—", [projectsById]);

  const [modal, setModal] = useState<ModalState>({ kind: "closed" });

  const downloadPDF = async (b: BudgetDTO) => {
    try {
      const filename = await generateBudgetPDF({
        budget: b,
        clientName:  user?.nombre ?? "Cliente",
        projectName: getProjectName(b.proyectoId),
        branding: DEFAULT_BRANDING,
      });
      push(`PDF descargado: ${filename}`, "success");
    } catch (e) { push((e as { message?: string }).message ?? "Error generando PDF", "error"); }
  };

  if (budgets.loading) return <div style={{ display: "flex", justifyContent: "center", padding: 60 }}><Spinner size={32} /></div>;
  if (budgets.error)   return <div role="alert" style={{ color: "#f87171", padding: 20 }}>{budgets.error}</div>;

  // Sort: enviado (pending sign) first → firmado → borrador → rechazado
  const sorted = [...(budgets.data ?? [])].sort((a, b) => {
    const rank: Record<string, number> = { enviado: 0, firmado: 1, borrador: 2, rechazado: 3 };
    return (rank[a.estado] ?? 99) - (rank[b.estado] ?? 99);
  });

  return (
    <section>
      <PageHeader title="Mis presupuestos" subtitle={`${sorted.length} presupuestos`} />

      {sorted.length === 0
        ? <EmptyState icon="✍" title="No hay presupuestos" hint="Aún no tienes presupuestos asignados" />
        : <div role="list" style={{ display: "grid", gap: 10 }}>
            {sorted.map(b => (
              <article key={b.id} role="listitem" className="private-action-card"
                style={{ padding: 16, background: "#fffaf4", border: `1px solid ${b.estado === "enviado" ? "#fbbf24" : "#d8c4ad"}`, borderRadius: 10, display: "grid", gridTemplateColumns: "1fr auto", gap: 16, alignItems: "center" }}>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
                    <h3 style={{ fontSize: 15, fontWeight: 600, color: "#302d29" }}>{b.nombre}</h3>
                    <BudgetStatusBadge estado={b.estado} />
                  </div>
                  <p style={{ fontSize: 12, color: "#71685e" }}>
                    {getProjectName(b.proyectoId)}
                    {b.fechaEnvio && ` · Enviado ${formatDate(b.fechaEnvio)}`}
                    {b.estado === "enviado" && ` · Validez ${b.validezDias} días`}
                  </p>
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  <Button small variant="ghost" onClick={() => setModal({ kind: "view", budget: b })}>Revisar</Button>
                  <Button small variant="ghost" onClick={() => downloadPDF(b)}>PDF</Button>
                  {b.estado === "enviado" && <Button small onClick={() => setModal({ kind: "sign", budget: b })}>✍ Firmar</Button>}
                </div>
              </article>
            ))}
          </div>}

      <Modal open={modal.kind === "view"} onClose={() => setModal({ kind: "closed" })} title="Presupuesto" width={780}>
        {modal.kind === "view" && (
          <BudgetDetail
            budget={modal.budget}
            clientName={user?.nombre ?? ""}
            projectName={getProjectName(modal.budget.proyectoId)}
            onDownloadPDF={() => downloadPDF(modal.budget)}
            onSign={modal.budget.estado === "enviado" ? () => setModal({ kind: "sign", budget: modal.budget }) : undefined}
            canSign={modal.budget.estado === "enviado"}
          />
        )}
      </Modal>

      <SignatureWizard
        open={modal.kind === "sign"}
        budgetId={modal.kind === "sign" ? modal.budget.id : null}
        budgetsApi={apis.budgets}
        onClose={() => setModal({ kind: "closed" })}
        onSigned={() => { setModal({ kind: "closed" }); budgets.refresh(); }}
      />
    </section>
  );
}
