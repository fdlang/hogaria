import { ValidationError } from "@reformapro/domain/errors";
import { Money, Percentage } from "@reformapro/domain/value-objects";
import type { Project } from "@reformapro/domain/entities";
export function projectChanges(value: unknown): Partial<Project> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new ValidationError("Cambios de proyecto no válidos");
  const input = value as Record<string, unknown>,
    out: Record<string, unknown> = {};
  const allowed = [
    "progreso",
    "presupuesto",
    "estado",
    "nombre",
    "descripcion",
    "direccion",
    "tipo",
    "fechaInicio",
    "fechaFinPrevista",
    "hitos",
  ];
  if (Object.keys(input).some((k) => !allowed.includes(k)))
    throw new ValidationError("Campo de proyecto no editable");
  const num = (v: unknown, max: number) => {
    if (typeof v !== "number" || !Number.isFinite(v) || v < 0 || v > max)
      throw new ValidationError("Importe o porcentaje no válido");
    return v;
  };
  const date = (v: unknown) => {
    if (
      typeof v !== "string" ||
      !/^\d{4}-\d{2}-\d{2}(T.*)?$/.test(v) ||
      !Number.isFinite(Date.parse(v))
    )
      throw new ValidationError("Fecha no válida");
    if (new Date(v.slice(0, 10)).toISOString().slice(0, 10) !== v.slice(0, 10))
      throw new ValidationError("Fecha inexistente");
    return new Date(v);
  };
  for (const [key, v] of Object.entries(input)) {
    if (key === "progreso") out[key] = Percentage.of(num(v, 100));
    else if (key === "presupuesto") out[key] = Money.of(num(v, 1_000_000_000));
    else if (key === "fechaInicio" || key === "fechaFinPrevista")
      out[key] = date(v);
    else if (key === "estado") {
      if (
        typeof v !== "string" ||
        !["planificacion", "en_curso", "pausado", "finalizado"].includes(v)
      )
        throw new ValidationError("Estado no válido");
      out[key] = v;
    } else if (key === "hitos") {
      if (!Array.isArray(v) || v.length > 500)
        throw new ValidationError("Hitos no válidos");
      const ids = new Set<string>();
      out[key] = v.map((h) => {
        if (
          !h ||
          typeof h !== "object" ||
          !["string", "number"].includes(typeof h.id) ||
          (typeof h.id === "number" && !Number.isSafeInteger(h.id)) ||
          String(h.id).length > 100 ||
          !String(h.id).trim() ||
          ids.has(String(h.id)) ||
          typeof h.nombre !== "string" ||
          !h.nombre.trim() ||
          h.nombre.length > 300 ||
          typeof h.completado !== "boolean"
        )
          throw new ValidationError("Hito no válido o duplicado");
        ids.add(String(h.id));
        return {
          id: String(h.id),
          nombre: h.nombre.trim(),
          completado: h.completado,
          fecha: date(h.fecha),
        };
      });
    } else {
      if (
        typeof v !== "string" ||
        v.length > 5000 ||
        (key !== "descripcion" && !v.trim())
      )
        throw new ValidationError("Texto del proyecto no válido");
      out[key] = v.trim();
    }
  }
  return out as Partial<Project>;
}
