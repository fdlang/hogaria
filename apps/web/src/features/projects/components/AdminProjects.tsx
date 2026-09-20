/**
 * AdminProjects — list view using the shared DataTable + useResource primitive.
 *
 * The component is pure presentational. State & I/O come from hooks.
 * Filters are local; sorting is provided by DataTable.
 */

import { useState, useMemo } from "react";
import { ProjectsApi, ProjectDTO } from "../api/projects.api";
import { useProjects, useProjectMutations } from "../hooks/useProjects";
import { usePermissions } from "@/shared/hooks/usePermissions";
import { useNotifications } from "@/shared/ui/notifications";
import { useConfirm } from "@/shared/ui/confirm";
import { Button, Input } from "@/shared/ui";
import { PageHeader } from "@/shared/ui/page-header";
import { DataTable, ColumnDef } from "@/shared/ui/data-table";
import { ProjectStatusBadge } from "@/shared/ui/badges";
import { formatMoney, formatDate } from "@/shared/lib/formatters";

interface Props {
  api: ProjectsApi;
  onOpenProject: (id: number) => void;
}

export function AdminProjects({ api, onOpenProject }: Props) {
  const projects = useProjects(api);
  const mutations = useProjectMutations(api);
  const { can } = usePermissions();
  const { push } = useNotifications();
  const confirm = useConfirm();

  const [searchTerm, setSearchTerm]     = useState("");
  const [statusFilter, setStatusFilter] = useState<ProjectDTO["estado"] | "all">("all");

  const filtered = useMemo(() => {
    const data = projects.data ?? [];
    return data.filter(p => {
      if (statusFilter !== "all" && p.estado !== statusFilter) return false;
      if (searchTerm && !p.nombre.toLowerCase().includes(searchTerm.toLowerCase())) return false;
      return true;
    });
  }, [projects.data, searchTerm, statusFilter]);

  const handleDelete = async (project: ProjectDTO) => {
    const ok = await confirm({
      title: "Eliminar proyecto",
      message: <>¿Eliminar <strong>{project.nombre}</strong>? Esta acción no se puede deshacer.</>,
      variant: "danger",
      confirmLabel: "Eliminar",
    });
    if (!ok) return;
    try {
      await mutations.remove.mutate(project.id);
      push("Proyecto eliminado", "success");
      projects.refresh();
    } catch (e) { push((e as { message?: string }).message ?? "Error al eliminar", "error"); }
  };

  const columns: ColumnDef<ProjectDTO>[] = [
    { key: "nombre",      header: "Proyecto", sortBy: p => p.nombre,
      render: p => (
        <div>
          <strong style={{ color: "#302d29" }}>{p.nombre}</strong>
          <div style={{ fontSize: 12, color: "#71685e", marginTop: 2 }}>{p.direccion}</div>
        </div>
      )
    },
    { key: "estado",      header: "Estado",   sortBy: p => p.estado, render: p => <ProjectStatusBadge estado={p.estado} /> },
    { key: "progreso",    header: "Progreso", sortBy: p => p.progreso, align: "right",
      render: p => (
        <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 120 }}>
          <div style={{ flex: 1, height: 4, background: "#d8c4ad", borderRadius: 2, overflow: "hidden" }}>
            <div style={{ width: `${p.progreso}%`, height: "100%", background: "#c17248" }} />
          </div>
          <span style={{ fontSize: 12, color: "#71685e", minWidth: 30 }}>{p.progreso}%</span>
        </div>
      )
    },
    { key: "presupuesto", header: "Presupuesto", sortBy: p => p.presupuesto ?? 0, align: "right",
      render: p => formatMoney(p.presupuesto ?? 0) },
    { key: "entrega",     header: "Entrega",  sortBy: p => p.fechaFinPrevista, align: "right",
      render: p => formatDate(p.fechaFinPrevista) },
  ];

  return (
    <section>
      <PageHeader
        title="Proyectos"
        subtitle={`${projects.data?.length ?? 0} proyectos totales`}
        actions={
          <>
            <Button small variant="ghost" onClick={projects.refresh}>↻ Actualizar</Button>
          </>
        }
      />

      <div className="private-filter-bar" style={{ display: "flex", gap: 12, marginBottom: 20 }}>
        <div style={{ flex: 1 }}>
          <Input placeholder="Buscar por nombre…" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
        </div>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value as typeof statusFilter)}
          style={{ background: "#fffaf4", border: "1px solid #cdb69d", borderRadius: 8, padding: "9px 13px", color: "#302d29", minWidth: 160 }}>
          <option value="all">Todos</option>
          <option value="planificacion">Planificación</option>
          <option value="en_curso">En curso</option>
          <option value="pausado">Pausado</option>
          <option value="finalizado">Finalizado</option>
        </select>
      </div>

      <DataTable
        data={filtered}
        columns={columns}
        rowKey={p => p.id}
        onRowClick={p => onOpenProject(p.id)}
        loading={projects.loading}
        error={projects.error}
        emptyMessage="No hay proyectos que coincidan con los filtros"
        actions={p => can("project.update") ? (
          <Button small variant="danger" onClick={() => handleDelete(p)}>✕</Button>
        ) : null}
      />
    </section>
  );
}
