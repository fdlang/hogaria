import type { AuditEntryDTO } from "./api/audit.api";

export const BUSINESS_ACTIONS = [
  "ACCESO_CORRECTO",
  "USUARIO_CREADO",
  "USUARIO_DESACTIVADO",
  "CONTRASENA_RESETEADA",
  "OPORTUNIDAD_CREADA",
  "PRESUPUESTO_CREADO",
  "PRESUPUESTO_ENVIADO",
  "PRESUPUESTO_RECHAZADO",
  "DOCUMENTO_FIRMADO",
  "PRESUPUESTO_ACEPTADO",
  "PROYECTO_CREADO",
  "PROYECTO_ACTUALIZADO",
  "PROYECTO_FINALIZADO",
  "ARCHIVO_SUBIDO",
  "ORDEN_CAMBIO_PUBLICADA",
] as const;

const TITLES: Record<string, string> = {
  ACCESO_CORRECTO: "Inicio de sesión",
  USUARIO_CREADO: "Usuario creado",
  USUARIO_DESACTIVADO: "Usuario desactivado",
  CONTRASENA_RESETEADA: "Contraseña restablecida",
  OPORTUNIDAD_CREADA: "Oportunidad creada",
  PRESUPUESTO_CREADO: "Presupuesto creado",
  PRESUPUESTO_ENVIADO: "Presupuesto publicado",
  PRESUPUESTO_RECHAZADO: "Cambios solicitados en el presupuesto",
  DOCUMENTO_FIRMADO: "Presupuesto firmado",
  PRESUPUESTO_ACEPTADO: "Presupuesto convertido en proyecto",
  PROYECTO_CREADO: "Proyecto creado",
  PROYECTO_ACTUALIZADO: "Proyecto actualizado",
  PROYECTO_FINALIZADO: "Proyecto finalizado",
  ARCHIVO_SUBIDO: "Documento añadido",
  ORDEN_CAMBIO_PUBLICADA: "Orden de cambio publicada",
};

const FIELD_LABELS: Record<string, string> = {
  estado: "estado",
  progreso: "progreso",
  hitos: "hitos",
  profesionalesAsignados: "profesionales asignados",
  fechaInicio: "fecha de inicio",
  fechaFinPrevista: "fecha prevista de finalización",
  presupuesto: "presupuesto",
};

const TABLE_LABELS: Record<string, string> = {
  users: "usuarios",
  projects: "proyectos",
  estimates: "presupuestos",
  budget_versions: "versiones de presupuesto",
  change_orders: "órdenes de cambio",
  project_files: "documentos de proyecto",
  professional_documents: "documentos profesionales",
  opportunities: "oportunidades",
};

const value = (details: Record<string, unknown>, key: string) => {
  const item = details[key];
  return typeof item === "string" || typeof item === "number" ? String(item) : "";
};
const reference = (details: Record<string, unknown>, key: string, label: string) => {
  const id = value(details, key);
  return id ? `${label} #${id}` : label;
};
const changedFields = (details: Record<string, unknown>) =>
  Array.isArray(details.changedFields)
    ? details.changedFields
        .filter((field): field is string => typeof field === "string")
        .map(field => FIELD_LABELS[field] ?? field)
    : [];

export const isTechnicalAudit = (action: string) => action.startsWith("DB_");

export function auditActionLabel(action: string) {
  if (TITLES[action]) return TITLES[action];
  if (isTechnicalAudit(action)) return "Registro técnico de base de datos";
  return action
    .toLocaleLowerCase("es")
    .split("_")
    .filter(Boolean)
    .map((word, index) => index === 0 ? word.charAt(0).toLocaleUpperCase("es") + word.slice(1) : word)
    .join(" ");
}

export function auditDescription(entry: AuditEntryDTO) {
  const details = entry.details;
  switch (entry.action) {
    case "ACCESO_CORRECTO": return "Acceso correcto al área privada.";
    case "USUARIO_CREADO": return `Se dio de alta ${reference(details, "userId", "un usuario")}.`;
    case "USUARIO_DESACTIVADO": return `Se desactivó ${reference(details, "userId", "un usuario")}.`;
    case "CONTRASENA_RESETEADA": return `Se restableció el acceso de ${reference(details, "userId", "un usuario")}.`;
    case "OPORTUNIDAD_CREADA": return `Se registró ${reference(details, "opportunityId", "la oportunidad")}.`;
    case "PRESUPUESTO_CREADO": return `Se preparó ${reference(details, "estimateId", "el presupuesto")}.`;
    case "PRESUPUESTO_ENVIADO": return `Se publicó la versión ${value(details, "version") || "actual"} de ${reference(details, "estimateId", "el presupuesto")}.`;
    case "PRESUPUESTO_RECHAZADO": return `El cliente solicitó cambios en ${reference(details, "estimateId", "el presupuesto")}.`;
    case "DOCUMENTO_FIRMADO": return `El cliente firmó ${reference(details, "estimateId", "el presupuesto")}.`;
    case "PRESUPUESTO_ACEPTADO": return `${reference(details, "estimateId", "El presupuesto")} se convirtió en ${reference(details, "projectId", "el proyecto")}.`;
    case "PROYECTO_CREADO": return `Se creó ${reference(details, "projectId", "el proyecto")} desde ${reference(details, "estimateId", "el presupuesto")}.`;
    case "PROYECTO_ACTUALIZADO": {
      const fields = changedFields(details);
      return `Se actualizó ${reference(details, "projectId", "el proyecto")}${fields.length ? `: ${fields.join(", ")}` : ""}.`;
    }
    case "PROYECTO_FINALIZADO": return `Se marcó como finalizado ${reference(details, "projectId", "el proyecto")}.`;
    case "ARCHIVO_SUBIDO": return `Se añadió un documento a ${reference(details, "projectId", "el proyecto")}.`;
    case "ORDEN_CAMBIO_PUBLICADA": return `Se publicó ${reference(details, "changeOrderId", "una orden de cambio")} para ${reference(details, "projectId", "el proyecto")}.`;
    default: return technicalDescription(entry);
  }
}

function technicalDescription(entry: AuditEntryDTO) {
  const match = /^DB_(.+)_(INSERT|UPDATE|DELETE)$/.exec(entry.action);
  if (!match) return "Se registró una acción del sistema.";
  const table = TABLE_LABELS[match[1]!.toLocaleLowerCase("es")] ?? match[1]!.toLocaleLowerCase("es").replaceAll("_", " ");
  const operation = { INSERT: "creación", UPDATE: "actualización", DELETE: "eliminación" }[match[2]!] ?? "operación";
  const id = value(entry.details, "recordId");
  return `Control interno de ${operation} en ${table}${id ? `, registro #${id}` : ""}.`;
}

export function auditTone(action: string) {
  if (/DESACTIVADO|RECHAZADO|INVALIDO|INCORRECTO|DELETE/.test(action)) return "danger";
  if (/CREADO|FIRMADO|ACEPTADO|FINALIZADO|CORRECTO/.test(action)) return "success";
  if (/ENVIADO|SUBIDO|ACTUALIZADO/.test(action)) return "info";
  return "neutral";
}
