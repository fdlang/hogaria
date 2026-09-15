/**
 * ProjectForm — create/edit a project.
 * Rendered inside a Modal.
 */

import { useProjectForm } from "../hooks/useProjectForm";
import { ProjectsApi, ProjectDTO } from "../api/projects.api";
import { UserDTO } from "@/features/users/api/users.api";
import { Input, Textarea, Select, Button } from "@/shared/ui";
import { useNotifications } from "@/shared/ui/notifications";
import { PROJECT_TIPOS } from "@reformapro/domain";

interface Props {
  api: ProjectsApi;
  initialProject?: ProjectDTO | null;
  clients: UserDTO[];
  onSaved: (p: ProjectDTO) => void;
  onCancel: () => void;
}

export function ProjectForm({ api, initialProject, clients, onSaved, onCancel }: Props) {
  const form = useProjectForm(api, initialProject ?? null);
  const { push } = useNotifications();

  const handleSubmit = async () => {
    try {
      const saved = await form.submit();
      if (!saved) return;
      push(initialProject ? "Proyecto actualizado" : "Proyecto creado", "success");
      onSaved(saved);
    } catch (e) {
      push((e as { message?: string }).message ?? "Error", "error");
    }
  };

  return (
    <div>
      <Input label="Nombre del proyecto" required
        value={form.state.nombre} error={form.errors.nombre}
        onChange={e => form.setField("nombre", e.target.value)} />

      <Textarea label="Descripción"
        value={form.state.descripcion}
        onChange={e => form.setField("descripcion", e.target.value)} />

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Select label="Cliente" required
          value={form.state.clienteId ?? ""} 
          onChange={e => form.setField("clienteId", parseInt(e.target.value, 10))}>
          <option value="">— Selecciona —</option>
          {clients.map(c => <option key={c.id} value={c.id}>{c.nombre} ({c.email})</option>)}
        </Select>

        <Select label="Tipo"
          value={form.state.tipo}
          onChange={e => form.setField("tipo", e.target.value)}>
          {PROJECT_TIPOS.map(t => <option key={t} value={t}>{t}</option>)}
        </Select>
      </div>
      {form.errors.clienteId && <p role="alert" style={{ fontSize: 11, color: "#f87171", marginTop: -10, marginBottom: 10 }}>{form.errors.clienteId}</p>}

      <Input label="Dirección" required
        value={form.state.direccion} error={form.errors.direccion}
        onChange={e => form.setField("direccion", e.target.value)} />

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
        <Input label="Presupuesto (€)" type="number" min="0" step="100"
          value={form.state.presupuesto} error={form.errors.presupuesto}
          onChange={e => form.setField("presupuesto", parseFloat(e.target.value) || 0)} />
        <Input label="Fecha inicio" type="date"
          value={form.state.fechaInicio}
          onChange={e => form.setField("fechaInicio", e.target.value)} />
        <Input label="Entrega prevista" type="date"
          value={form.state.fechaFinPrevista} error={form.errors.fechaFinPrevista}
          onChange={e => form.setField("fechaFinPrevista", e.target.value)} />
      </div>

      {initialProject && (
        <Select label="Estado"
          value={form.state.estado}
          onChange={e => form.setField("estado", e.target.value as ProjectDTO["estado"])}>
          <option value="planificacion">Planificación</option>
          <option value="en_curso">En curso</option>
          <option value="pausado">Pausado</option>
          <option value="finalizado">Finalizado</option>
        </Select>
      )}

      {!initialProject && (
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "#71685e", marginBottom: 12, padding: 10, background: "#f8efe4", borderRadius: 6 }}>
          <input type="checkbox" checked={form.state.useHitosTemplate}
            onChange={e => form.setField("useHitosTemplate", e.target.checked)} />
          Usar plantilla estándar de hitos (demolición, instalaciones, acabados, entrega)
        </label>
      )}

      <footer style={{ display: "flex", justifyContent: "space-between", marginTop: 20, paddingTop: 16, borderTop: "1px solid #d8c4ad" }}>
        <Button variant="ghost" onClick={onCancel} disabled={form.submitting}>Cancelar</Button>
        <Button onClick={handleSubmit} loading={form.submitting}>
          {initialProject ? "Guardar cambios" : "Crear proyecto"}
        </Button>
      </footer>
    </div>
  );
}
