/**
 * useProjectForm — form state for create/edit project.
 */

import { useState, useEffect, useCallback } from "react";
import { ProjectsApi, ProjectDTO } from "../api/projects.api";
import { HITOS_TEMPLATE, PROJECT_TIPOS } from "@reformapro/domain";

export interface ProjectFormState {
  nombre: string;
  descripcion: string;
  clienteId: number | null;
  direccion: string;
  tipo: string;
  presupuesto: number;
  fechaInicio: string;         // YYYY-MM-DD
  fechaFinPrevista: string;
  estado: ProjectDTO["estado"];
  useHitosTemplate: boolean;    // only on create
}

const EMPTY: ProjectFormState = {
  nombre: "", descripcion: "", clienteId: null,
  direccion: "", tipo: PROJECT_TIPOS[0] ?? "Reforma integral",
  presupuesto: 0,
  fechaInicio: new Date().toISOString().slice(0, 10),
  fechaFinPrevista: new Date(Date.now() + 60 * 86400_000).toISOString().slice(0, 10),
  estado: "planificacion",
  useHitosTemplate: true,
};

export type ProjectFormErrors = Partial<Record<keyof ProjectFormState, string>>;

export function useProjectForm(api: ProjectsApi, initial: ProjectDTO | null = null) {
  const [state, setState]     = useState<ProjectFormState>(EMPTY);
  const [errors, setErrors]   = useState<ProjectFormErrors>({});
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!initial) { setState(EMPTY); return; }
    setState({
      nombre: initial.nombre,
      descripcion: initial.descripcion,
      clienteId: initial.clienteId,
      direccion: initial.direccion,
      tipo: initial.tipo,
      presupuesto: initial.presupuesto,
      fechaInicio: initial.fechaInicio.slice(0, 10),
      fechaFinPrevista: initial.fechaFinPrevista.slice(0, 10),
      estado: initial.estado,
      useHitosTemplate: false,
    });
  }, [initial]);

  const setField = useCallback(<K extends keyof ProjectFormState>(k: K, v: ProjectFormState[K]) => {
    setState(s => ({ ...s, [k]: v }));
    if (errors[k]) setErrors(e => { const { [k]: _, ...rest } = e; return rest; });
  }, [errors]);

  const validate = useCallback((): ProjectFormErrors => {
    const e: ProjectFormErrors = {};
    if (!state.nombre.trim())      e.nombre    = "Obligatorio";
    if (!state.clienteId)          e.clienteId = "Selecciona cliente";
    if (!state.direccion.trim())   e.direccion = "Obligatoria";
    if (state.presupuesto < 0)     e.presupuesto = "No negativo";
    if (new Date(state.fechaFinPrevista) <= new Date(state.fechaInicio)) {
      e.fechaFinPrevista = "Debe ser posterior a la fecha de inicio";
    }
    return e;
  }, [state]);

  const submit = useCallback(async () => {
    const errs = validate();
    if (Object.keys(errs).length) { setErrors(errs); return null; }
    setSubmitting(true); setErrors({});
    try {
      const base: Partial<ProjectDTO> = {
        nombre: state.nombre.trim(),
        descripcion: state.descripcion,
        clienteId: state.clienteId!,
        direccion: state.direccion,
        tipo: state.tipo,
        presupuesto: state.presupuesto,
        estado: state.estado,
        fechaInicio: state.fechaInicio,
        fechaFinPrevista: state.fechaFinPrevista,
      };
      if (initial) return await api.update(initial.id, base);

      // New project — optionally seed milestones from template
      if (state.useHitosTemplate) {
        const start = new Date(state.fechaInicio).getTime();
        base.hitos = HITOS_TEMPLATE.map((h, i) => ({
          id: i + 1,
          nombre: h.nombre,
          completado: false,
          fecha: new Date(start + h.offset * 86400_000).toISOString(),
        }));
      }
      return await api.create(base);
    } finally { setSubmitting(false); }
  }, [api, initial, state, validate]);

  return { state, setField, errors, submitting, submit };
}
