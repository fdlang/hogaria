/**
 * AdminUsers — full user CRUD.
 *
 * Uses useUsers (useResource) + useUserMutations (useMutation) + DataTable
 * for a consistent, minimal component. UserFormView inline — tightly coupled.
 */

import { useState, useMemo } from "react";
import { UsersApi, UserDTO } from "../api/users.api";
import { useUsers, useUserMutations } from "../hooks/useUsers";
import { useUserForm } from "../hooks/useUserForm";
import { usePermissions } from "@/shared/hooks/usePermissions";
import { useNotifications } from "@/shared/ui/notifications";
import { useConfirm } from "@/shared/ui/confirm";
import { Modal, Button, Input, Select } from "@/shared/ui";
import { PageHeader } from "@/shared/ui/page-header";
import { DataTable, ColumnDef } from "@/shared/ui/data-table";
import { RoleBadge, ProfesionBadge } from "@/shared/ui/badges";
import { formatDate } from "@/shared/lib/formatters";
import { PROFESIONES_LIST, Profesion } from "@reformapro/domain";

interface Props { api: UsersApi }

type ModalState =
  | { kind: "closed" }
  | { kind: "create" }
  | { kind: "edit"; user: UserDTO };

type AccountStatus = NonNullable<UserDTO["accountStatus"]>;
const accountStatusOf = (user: UserDTO): AccountStatus => user.accountStatus ?? (user.activo ? "active" : "pending_activation");

export function AdminUsers({ api }: Props) {
  const users     = useUsers(api);
  const mutations = useUserMutations(api);
  const { can }   = usePermissions();
  const { push } = useNotifications();
  const confirm   = useConfirm();

  const [modal, setModal] = useState<ModalState>({ kind: "closed" });
  const [filterRol, setFilterRol] = useState<UserDTO["rol"] | "all">("all");
  const [filterStatus, setFilterStatus] = useState<AccountStatus | "current" | "all">("current");
  const [search, setSearch] = useState("");
  const [reactivatingId, setReactivatingId] = useState<number | null>(null);

  const filtered = useMemo(() => {
    return (users.data ?? []).filter(u => {
      if (filterRol !== "all" && u.rol !== filterRol) return false;
      const status = accountStatusOf(u);
      if (filterStatus === "current" && status === "archived") return false;
      if (filterStatus !== "current" && filterStatus !== "all" && status !== filterStatus) return false;
      if (search) {
        const q = search.toLowerCase();
        if (!u.nombre.toLowerCase().includes(q) && !u.email.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [users.data, filterRol, filterStatus, search]);

  const handleDelete = async (user: UserDTO) => {
    const ok = await confirm({
      title: "Archivar usuario",
      message: <>¿Archivar a <strong>{user.nombre}</strong>? Los proyectos históricos se conservarán. Puedes reactivarle después.</>,
      variant: "danger",
      confirmLabel: "Archivar",
    });
    if (!ok) return;
    try {
      await mutations.remove.mutate(user.id);
      push("Usuario archivado. Puedes recuperarlo desde el filtro Archivados.", "success");
      users.refresh();
    } catch (e) { push((e as { message?: string }).message ?? "Error", "error"); }
  };

  const handleReactivate = async (user: UserDTO) => {
    if (reactivatingId !== null) return;
    const isPending = accountStatusOf(user) === "pending_activation";
    const ok = await confirm({
      title: isPending ? "Reenviar acceso" : "Reactivar acceso",
      message: <>Se enviará un nuevo enlace de un solo uso a <strong>{user.email}</strong> únicamente si el anterior ya ha caducado.</>,
      confirmLabel: "Enviar acceso",
    });
    if (!ok) return;
    try {
      setReactivatingId(user.id);
      const result = await api.reactivate(user.id);
      push(result.sent ? (isPending ? "Nuevo enlace de acceso enviado" : "Enlace de reactivación enviado") : "Ya existe un envío en curso o un enlace de acceso vigente", result.sent ? "success" : "info");
      users.refresh();
    } catch (e) { push((e as { message?: string }).message ?? "No se pudo enviar el acceso", "error"); }
    finally { setReactivatingId(null); }
  };

  const columns: ColumnDef<UserDTO>[] = [
    { key: "nombre", header: "Usuario", sortBy: u => u.nombre,
      render: u => (
        <div>
          <strong style={{ color: u.activo ? "#302d29" : "#71685e" }}>{u.nombre}</strong>
          <div style={{ fontSize: 12, color: "#71685e", marginTop: 2 }}>{u.email}</div>
        </div>
      )
    },
    { key: "rol", header: "Rol", sortBy: u => u.rol, render: u => <RoleBadge rol={u.rol} /> },
    { key: "profesion", header: "Profesión",
      render: u => u.rol === "profesional" && u.profesion ? <ProfesionBadge profesion={u.profesion as Profesion} /> : <span style={{ color: "#85786b" }}>—</span> },
    { key: "telefono",  header: "Teléfono",  render: u => u.telefono || <span style={{ color: "#85786b" }}>—</span> },
    { key: "activo", header: "Estado", sortBy: accountStatusOf,
      render: u => accountStatusOf(u) === "active"
        ? <span style={{ fontSize: 12, color: "#247a55" }}>● Activo</span>
        : accountStatusOf(u) === "pending_activation"
          ? <span style={{ fontSize: 12, color: "#a85f3b" }}>● Invitación pendiente</span>
          : <span style={{ fontSize: 12, color: "#71685e" }}>● Archivado</span> },
    { key: "desde", header: "Desde", sortBy: u => u.createdAt, align: "right",
      render: u => formatDate(u.createdAt) },
  ];

  return (
    <section className="private-page">
      <PageHeader
        title="Usuarios"
        subtitle={`${users.data?.length ?? 0} usuarios · ${(users.data ?? []).filter(u => u.activo).length} activos`}
        actions={
          <>
            <Button small variant="ghost" aria-label="Actualizar usuarios" onClick={users.refresh}>↻</Button>
            {can("user.manage") && <Button small onClick={() => setModal({ kind: "create" })}>+ Nuevo usuario</Button>}
          </>
        }
      />

      <div className="private-filter-bar" style={{ display: "flex", gap: 12, marginBottom: 20 }}>
        <div style={{ flex: 1 }}>
          <Input placeholder="Buscar por nombre o email…" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <select value={filterRol} onChange={e => setFilterRol(e.target.value as typeof filterRol)}
          style={{ background: "#fffaf4", border: "1px solid #cdb69d", borderRadius: 8, padding: "9px 13px", color: "#302d29", minWidth: 160 }}>
          <option value="all">Todos los roles</option>
          <option value="admin">Admins</option>
          <option value="cliente">Clientes</option>
          <option value="profesional">Profesionales</option>
        </select>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value as typeof filterStatus)}
          style={{ background: "#fffaf4", border: "1px solid #cdb69d", borderRadius: 8, padding: "9px 13px", color: "#302d29", minWidth: 145 }}>
          <option value="current">Usuarios actuales</option>
          <option value="active">Activos</option>
          <option value="pending_activation">Invitación pendiente</option>
          <option value="archived">Archivados</option>
          <option value="all">Todos los estados</option>
        </select>
      </div>

      <DataTable
        data={filtered}
        columns={columns}
        rowKey={u => u.id}
        loading={users.loading}
        error={users.error}
        emptyMessage={search ? `Sin resultados para "${search}"` : "No hay usuarios en este estado"}
        actions={u => (
          <div style={{ display: "flex", gap: 6 }}>
            {can("user.manage") && <Button small variant="ghost" onClick={() => setModal({ kind: "edit", user: u })}>Editar</Button>}
            {can("user.manage") && accountStatusOf(u) === "pending_activation" && <Button small loading={reactivatingId === u.id} disabled={reactivatingId !== null} onClick={() => void handleReactivate(u)}>Reenviar acceso</Button>}
            {can("user.manage") && accountStatusOf(u) === "archived" && <Button small loading={reactivatingId === u.id} disabled={reactivatingId !== null} onClick={() => void handleReactivate(u)}>Reactivar</Button>}
            {can("user.manage") && u.activo && <Button small variant="danger" aria-label={`Archivar a ${u.nombre}`} onClick={() => handleDelete(u)}>✕</Button>}
          </div>
        )}
      />

      <Modal open={modal.kind !== "closed"} onClose={() => setModal({ kind: "closed" })}
        title={modal.kind === "edit" ? "Editar usuario" : "Nuevo usuario"} width={560}>
        {modal.kind !== "closed" && (
          <UserFormView
            api={api}
            initialUser={modal.kind === "edit" ? modal.user : null}
            onSaved={() => { setModal({ kind: "closed" }); users.refresh(); }}
            onCancel={() => setModal({ kind: "closed" })}
          />
        )}
      </Modal>
    </section>
  );
}

// ─────────────────────────────────────────────────────────
// UserFormView — inline form (small + tightly coupled)
// ─────────────────────────────────────────────────────────
function UserFormView({ api, initialUser, onSaved, onCancel }: {
  api: UsersApi; initialUser: UserDTO | null;
  onSaved: (u: UserDTO) => void; onCancel: () => void;
}) {
  const form = useUserForm(api, initialUser);
  const { push } = useNotifications();

  const submit = async () => {
    try {
      const res = await form.submit();
      if (!res) return;
      if ("invitationSent" in res) {
        push(res.invitationSent ? "Usuario creado e invitación enviada" : "Usuario creado", "success");
        onSaved(res.user);
      } else {
        push("Usuario actualizado", "success");
        onSaved(res);
      }
    } catch (e) { push((e as { message?: string }).message ?? "Error", "error"); }
  };

  return (
    <div>
      <Input label="Nombre completo" required
        value={form.state.nombre} error={form.errors.nombre}
        onChange={e => form.setField("nombre", e.target.value)} />

      <Input label="Email" type="email" required
        value={form.state.email} error={form.errors.email}
        disabled={!!initialUser}
        onChange={e => form.setField("email", e.target.value)} />

      <Select label="Rol" required
        value={form.state.rol} disabled={!!initialUser}
        onChange={e => form.setField("rol", e.target.value as UserDTO["rol"])}>
        <option value="cliente">Cliente</option>
        <option value="profesional">Profesional</option>
        <option value="admin">Administrador</option>
      </Select>

      {form.state.rol === "profesional" && (
        <Select label="Profesión" required
          error={form.errors.profesion}
          value={form.state.profesion ?? ""}
          onChange={e => form.setField("profesion", e.target.value as Profesion)}>
          <option value="">— Selecciona —</option>
          {PROFESIONES_LIST.map(p => <option key={p.value} value={p.value}>{p.icon} {p.label}</option>)}
        </Select>
      )}

      <Input label="Teléfono (opcional)"
        value={form.state.telefono ?? ""} error={form.errors.telefono}
        onChange={e => form.setField("telefono", e.target.value)} />

      {initialUser && (
        <>
          <Input label="Nueva contraseña (dejar en blanco para no cambiar)"
            type="password" placeholder="Mínimo 12 caracteres, letras y números"
            value={form.state.newPassword ?? ""} error={form.errors.newPassword}
            onChange={e => form.setField("newPassword", e.target.value)} />

        </>
      )}

      <footer style={{ display: "flex", justifyContent: "space-between", marginTop: 20, paddingTop: 16, borderTop: "1px solid #d8c4ad" }}>
        <Button variant="ghost" onClick={onCancel} disabled={form.submitting}>Cancelar</Button>
        <Button onClick={submit} loading={form.submitting}>
          {initialUser ? "Guardar cambios" : "Crear usuario"}
        </Button>
      </footer>
    </div>
  );
}
