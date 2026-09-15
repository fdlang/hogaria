/**
 * DataTable — reusable, accessible, type-safe table.
 *
 * Columns are described declaratively. No per-table HTML duplication.
 * Used by AdminUsers, AdminBudgets, AdminProjects (list view), audit log.
 */

import { ReactNode, useState, useMemo } from "react";
import { Spinner, EmptyState } from "./index";

export interface ColumnDef<T> {
  key: string;
  header: string;
  render: (row: T) => ReactNode;
  sortBy?: (row: T) => string | number;
  width?: number | string;
  align?: "left" | "right" | "center";
}

interface Props<T> {
  data: ReadonlyArray<T>;
  columns: ReadonlyArray<ColumnDef<T>>;
  rowKey: (row: T) => string | number;
  onRowClick?: (row: T) => void;
  loading?: boolean;
  error?: string | null;
  emptyMessage?: string;
  actions?: (row: T) => ReactNode; // trailing action buttons column
}

type SortState = { key: string; dir: "asc" | "desc" } | null;

export function DataTable<T>({ data, columns, rowKey, onRowClick, loading, error, emptyMessage, actions }: Props<T>) {
  const [sort, setSort] = useState<SortState>(null);

  const sorted = useMemo(() => {
    if (!sort) return data;
    const col = columns.find(c => c.key === sort.key);
    if (!col?.sortBy) return data;
    const copy = [...data];
    copy.sort((a, b) => {
      const av = col.sortBy!(a); const bv = col.sortBy!(b);
      if (av < bv) return sort.dir === "asc" ? -1 : 1;
      if (av > bv) return sort.dir === "asc" ?  1 : -1;
      return 0;
    });
    return copy;
  }, [data, sort, columns]);

  const toggleSort = (key: string) => setSort(s =>
    s?.key !== key ? { key, dir: "asc" } :
    s.dir === "asc" ? { key, dir: "desc" } : null
  );

  if (loading) return <div style={{ display: "flex", justifyContent: "center", padding: 40 }}><Spinner size={28} /></div>;
  if (error)   return <div role="alert" style={{ padding: 20, color: "#f87171" }}>{error}</div>;
  if (data.length === 0) return <EmptyState title={emptyMessage ?? "Sin datos"} />;

  return (
    <div style={{ overflowX: "auto", border: "1px solid #2a2a26", borderRadius: 10 }}>
      <table role="table" style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
        <thead>
          <tr style={{ background: "#141411", borderBottom: "1px solid #2a2a26" }}>
            {columns.map(c => (
              <th key={c.key}
                scope="col"
                onClick={c.sortBy ? () => toggleSort(c.key) : undefined}
                aria-sort={sort?.key === c.key ? (sort.dir === "asc" ? "ascending" : "descending") : undefined}
                style={{
                  padding: "12px 14px", textAlign: c.align ?? "left",
                  fontSize: 11, fontWeight: 700, color: "#888",
                  textTransform: "uppercase", letterSpacing: ".07em",
                  width: c.width,
                  cursor: c.sortBy ? "pointer" : "default",
                  userSelect: "none",
                }}>
                {c.header}
                {c.sortBy && sort?.key === c.key && (sort.dir === "asc" ? " ↑" : " ↓")}
              </th>
            ))}
            {actions && <th scope="col" style={{ padding: "12px 14px", width: 1 }} />}
          </tr>
        </thead>
        <tbody>
          {sorted.map(row => (
            <tr key={rowKey(row)}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              style={{ borderBottom: "1px solid #1a1a18", cursor: onRowClick ? "pointer" : "default" }}
              onMouseEnter={e => onRowClick && (e.currentTarget.style.background = "#141411")}
              onMouseLeave={e => onRowClick && (e.currentTarget.style.background = "transparent")}>
              {columns.map(c => (
                <td key={c.key} style={{ padding: "12px 14px", textAlign: c.align ?? "left", color: "#ccc" }}>
                  {c.render(row)}
                </td>
              ))}
              {actions && (
                <td onClick={e => e.stopPropagation()} style={{ padding: "8px 14px", textAlign: "right", whiteSpace: "nowrap" }}>
                  {actions(row)}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
