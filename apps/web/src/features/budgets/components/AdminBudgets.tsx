/**
 * AdminBudgets — list view for the admin role.
 *
 * Uses the full stack of shared primitives:
 *   - useResource (via useBudgets hook) for data
 *   - useMutation (via useBudgetMutations) for send/delete
 *   - DataTable for sortable table with actions column
 *   - useConfirm for destructive confirmations
 *   - useNotifications for feedback
 *   - usePermissions for role-gated buttons
 */

import { useMemo, useState, useCallback } from "react";
import { BudgetsApi, BudgetDTO } from "../api/budgets.api";
import { ProjectsApi }           from "@/features/projects/api/projects.api";
import { UsersApi }               from "@/features/users/api/users.api";
import { useBudgets, useBudgetMutations } from "../hooks/useBudgets";
import { useProjects } from "@/features/projects/hooks/useProjects";
import { useUsers }     from "@/features/users/hooks/useUsers";
import { usePermissions } from "@/shared/hooks/usePermissions";
import { useNotifications } from "@/shared/ui/notifications";
import { useConfirm } from "@/shared/ui/confirm";
import { Modal, Button } from "@/shared/ui";
import { PageHeader } from "@/shared/ui/page-header";
import { DataTable, ColumnDef } from "@/shared/ui/data-table";
import { BudgetStatusBadge } from "@/shared/ui/badges";
import { formatDate } from "@/shared/lib/formatters";
import { generateBudgetPDF, DEFAULT_BRANDING } from "../pdf/generateBudgetPDF";
import { BudgetForm }   from "./BudgetForm";
import { BudgetDetail } from "./BudgetDetail";

interface Props {
  apis: { budgets: BudgetsApi; projects: ProjectsApi; users: UsersApi };
}

type ModalState =
  | { kind: "closed" }
  | { kind: "create" }
  | { kind: "edit"; budget: BudgetDTO }
  | { kind: "view"; budget: BudgetDTO };

export function AdminBudgets({ apis }: Props) {
  const budgets   = useBudgets(apis.budgets);
  const projects  = useProjects(apis.projects);
  const clients   = useUsers(apis.users, "cliente");
  const mutations = useBudgetMutations(apis.budgets);

  const { can } = usePermissions();
  const { push } = useNotifications();
  const confirm = useConfirm();

  const [modal, setModal] = useState<ModalState>({ kind: "closed" });
  const [filterEstado, setFilterEstado] = useState<BudgetDTO["estado"] | "all">("all");

  // O(1) lookups for rendering cliente/proyecto names in rows
  const projectsById = useMemo(() => {
    const map: Record<number, string> = {};
    (projects.data ?? []).forEach(p => { map[p.id] = p.nombre; });
    return map;
  }, [projects.data]);

  const clientsById = useMemo(() => {
    const map: Record<number, string> = {};
    (clients.data ?? []).forEach(c => { map[c.id] = c.nombre; });
    return map;
  }, [clients.data]);

  const getClientName  = useCallback((id: number) => clientsById[id]  ?? "—", [clientsById]);
  const getProjectName = useCallback((id: number) => projectsById[id] ?? "—", [projectsById]);

  const filtered = useMemo(() => {
    const data = budgets.data ?? [];
    return filterEstado === "all" ? data : data.filter(b => b.estado === filterEstado);
  }, [budgets.data, filterEstado]);

  const handleSend = async (b: BudgetDTO) => {
    try {
      await mutations.send.mutate(b.id);
      push("Presupuesto enviado al cliente", "success");
      budgets.refresh();
    } catch (e) { push((e as { message?: string }).message ?? "Error al enviar", "error"); }
  };

  const handleDelete = async (b: BudgetDTO) => {
    const ok = await confirm({
      title: "Eliminar presupuesto",
      message: <>¿Eliminar <strong>{b.nombre}</strong>? Esta acción no se puede deshacer.</>,
      variant: "danger",
      confirmLabel: "Eliminar",
    });
    if (!ok) return;
    try {
      await mutations.remove.mutate(b.id);
      push("Presupuesto eliminado", "success");
      budgets.refresh();
    } catch (e) { push((e as { message?: string }).message ?? "Error al eliminar", "error"); }
  };

  const handleDownloadPDF = async (b: BudgetDTO) => {
    try {
      const filename = await generateBudgetPDF({
        budget: b,
        clientName:  getClientName(b.clienteId),
        projectName: getProjectName(b.proyectoId),
        branding: DEFAULT_BRANDING,
      });
      push(`PDF descargado: ${filename}`, "success");
    } catch (e) { push((e as { message?: string }).message ?? "Error generando PDF", "error"); }
  };

  const columns: ColumnDef<BudgetDTO>[] = [
    { key: "nombre", header: "Presupuesto", sortBy: b => b.nombre,
      render: b => (
        <div>
          <strong style={{ color: "#f0ede6" }}>{b.nombre}</strong>
          {b.referencia && (
            <code style={{ marginLeft: 8, fontSize: 10, background: "#0c0c0b", color: "#555", padding: "2px 6px", borderRadius: 4 }}>{b.referencia}</code>
          )}
        </div>
      )
    },
    { key: "cliente",  header: "Cliente",  sortBy: b => getClientName(b.clienteId),
      render: b => getClientName(b.clienteId) },
    { key: "proyecto", header: "Proyecto", sortBy: b => getProjectName(b.proyectoId),
      render: b => getProjectName(b.proyectoId) },
    { key: "estado",   header: "Estado",   sortBy: b => b.estado,
      render: b => <BudgetStatusBadge estado={b.estado} /> },
    { key: "creado",   header: "Creado",   sortBy: b => b.fechaCreacion, align: "right",
      render: b => formatDate(b.fechaCreacion) },
  ];

  return (
    <section>
      <PageHeader
        title="Presupuestos"
        subtitle={`${budgets.data?.length ?? 0} presupuestos totales`}
        actions={
          <>
            <Button small variant="ghost" onClick={budgets.refresh}>↻ Actualizar</Button>
            {can("budget.create") && <Button small onClick={() => setModal({ kind: "create" })}>+ Nuevo presupuesto</Button>}
          </>
        }
      />

      <div style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap" }}>
        {(["all", "borrador", "enviado", "firmado", "rechazado"] as const).map(s => (
          <button key={s} onClick={() => setFilterEstado(s)}
            style={{
              padding: "6px 12px", fontSize: 11, fontWeight: 600, borderRadius: 6,
              background: filterEstado === s ? "#c8a96e18" : "transparent",
              color:      filterEstado === s ? "#c8a96e" : "#666",
              border: `1px solid ${filterEstado === s ? "#c8a96e" : "#2a2a26"}`,
              cursor: "pointer", textTransform: "uppercase", letterSpacing: ".05em",
            }}>
            {s === "all" ? "Todos" : s}
          </button>
        ))}
      </div>

      <DataTable
        data={filtered}
        columns={columns}
        rowKey={b => b.id}
        loading={budgets.loading}
        error={budgets.error}
        emptyMessage={filterEstado === "all" ? "Aún no hay presupuestos" : `Ninguno con estado "${filterEstado}"`}
        actions={b => (
          <div style={{ display: "flex", gap: 6 }}>
            <Button small variant="ghost" onClick={() => setModal({ kind: "view", budget: b })}>Ver</Button>
            <Button small variant="ghost" onClick={() => handleDownloadPDF(b)}>PDF</Button>
            {b.estado === "borrador" && can("budget.send") && (
              <Button small onClick={() => handleSend(b)} loading={mutations.send.loading}>Enviar</Button>
            )}
            {b.estado !== "firmado" && can("budget.create") && (
              <Button small variant="ghost" onClick={() => setModal({ kind: "edit", budget: b })}>Editar</Button>
            )}
            {b.estado !== "firmado" && can("budget.delete") && (
              <Button small variant="danger" onClick={() => handleDelete(b)}>✕</Button>
            )}
          </div>
        )}
      />

      {/* Create / Edit modal */}
      <Modal
        open={modal.kind === "create" || modal.kind === "edit"}
        onClose={() => setModal({ kind: "closed" })}
        title={modal.kind === "edit" ? "Editar presupuesto" : "Nuevo presupuesto"}
        width={980}
      >
        {(modal.kind === "create" || modal.kind === "edit") && (
          <BudgetForm
            api={apis.budgets}
            initialBudget={modal.kind === "edit" ? modal.budget : null}
            projects={projects.data ?? []}
            clients={clients.data ?? []}
            onSaved={() => { setModal({ kind: "closed" }); budgets.refresh(); }}
            onCancel={() => setModal({ kind: "closed" })}
          />
        )}
      </Modal>

      {/* View detail modal */}
      <Modal
        open={modal.kind === "view"}
        onClose={() => setModal({ kind: "closed" })}
        title="Detalle del presupuesto"
        width={780}
      >
        {modal.kind === "view" && (
          <BudgetDetail
            budget={modal.budget}
            clientName={getClientName(modal.budget.clienteId)}
            projectName={getProjectName(modal.budget.proyectoId)}
            onDownloadPDF={() => handleDownloadPDF(modal.budget)}
          />
        )}
      </Modal>
    </section>
  );
}
