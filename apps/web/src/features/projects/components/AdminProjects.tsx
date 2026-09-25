/**
 * AdminProjects — list view using the shared DataTable + useResource primitive.
 *
 * The component is pure presentational. State & I/O come from hooks.
 * Filters are local; sorting is provided by DataTable.
 */

import { useDeferredValue, useState } from "react";
import { ProjectsApi, ProjectDTO } from "../api/projects.api";
import { useProjectPage } from "../hooks/useProjects";
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
  const [searchTerm, setSearchTerm]     = useState("");
  const [statusFilter, setStatusFilter] = useState<ProjectDTO["estado"] | "all">("all");
  const deferredSearch = useDeferredValue(searchTerm);
  const [page, setPage] = useState(1);
  const projects = useProjectPage(api, page, deferredSearch, statusFilter);

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
    { key: "presupuesto", header: "Importe de obra", sortBy: p => p.financialSummary?.totalAmount ?? p.presupuesto ?? 0, align: "right",
      render: p => <div>{formatMoney(p.financialSummary?.totalAmount ?? p.presupuesto ?? 0)}{!p.financialSummary && <small style={{ display: "block", color: "#71685e" }}>Base sin IVA</small>}</div> },
    { key: "entrega",     header: "Entrega",  sortBy: p => p.fechaFinPrevista, align: "right",
      render: p => formatDate(p.fechaFinPrevista) },
  ];

  return (
    <section className="private-page">
      <PageHeader
        title="Proyectos"
        subtitle={`${projects.data?.total ?? 0} proyectos`}
        actions={
          <>
            <Button small variant="ghost" onClick={projects.refresh}>↻ Actualizar</Button>
          </>
        }
      />

      <div className="private-filter-bar" style={{ display: "flex", gap: 12, marginBottom: 20 }}>
        <div style={{ flex: 1 }}>
          <Input placeholder="Buscar por nombre o dirección…" value={searchTerm} onChange={e => { setSearchTerm(e.target.value); setPage(1); }} />
        </div>
        <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value as typeof statusFilter); setPage(1); }}
          style={{ background: "#fffaf4", border: "1px solid #cdb69d", borderRadius: 8, padding: "9px 13px", color: "#302d29", minWidth: 160 }}>
          <option value="all">Todos</option>
          <option value="planificacion">Planificación</option>
          <option value="en_curso">En curso</option>
          <option value="pausado">Pausado</option>
          <option value="finalizado">Finalizado</option>
        </select>
      </div>

      <DataTable
        data={projects.data?.items ?? []}
        columns={columns}
        rowKey={p => p.id}
        onRowClick={p => onOpenProject(p.id)}
        loading={projects.loading}
        error={projects.error}
        emptyMessage="No hay proyectos que coincidan con los filtros"
      />
      <div className="private-pagination" style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 10, marginTop: 18 }}>
        <Button small variant="ghost" disabled={page <= 1 || projects.loading} onClick={() => setPage(value => value - 1)}>Anterior</Button>
        <span>Página {projects.data?.page ?? page} de {projects.data?.pages ?? 1}</span>
        <Button small variant="ghost" disabled={page >= (projects.data?.pages ?? 1) || projects.loading} onClick={() => setPage(value => value + 1)}>Siguiente</Button>
      </div>
    </section>
  );
}
