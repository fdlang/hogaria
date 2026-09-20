export interface SolicitudFormValues {
  nombre: string;
  email: string;
  telefono: string;
  tipo: string;
  descripcion: string;
}

export type SolicitudFormErrors = Partial<Record<keyof SolicitudFormValues, string>>;

export function validateSolicitud(values: SolicitudFormValues): SolicitudFormErrors {
  const errors: SolicitudFormErrors = {};

  if (!values.nombre.trim()) errors.nombre = "Obligatorio";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email)) errors.email = "Introduce un email válido";

  if (!isValidSpanishPhone(values.telefono)) {
    errors.telefono = "Introduce un teléfono español válido";
  }

  if (!values.tipo) errors.tipo = "Selecciona un proyecto";
  if (values.descripcion.trim().length < 20) errors.descripcion = "Mínimo 20 caracteres";

  return errors;
}
import { isValidSpanishPhone } from "@reformapro/domain";
