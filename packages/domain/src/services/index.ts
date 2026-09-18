import { ForbiddenError } from "../errors/index.js";
import type { Profesion, Project, User } from "../entities/index.js";
export type { Profesion } from "../entities/index.js";

export type Action = "project.update" | "project.read" | "project.update.progress" | "project.update.milestones" | "user.manage";

export class PermissionPolicy {
  static readonly PROFESSIONAL_ACCESS: Record<Profesion, { subirImagen: boolean; verContrato: boolean; verFactura: boolean }> = {
    albanil: { subirImagen: true, verContrato: true, verFactura: false },
    electricista: { subirImagen: true, verContrato: true, verFactura: false },
    fontanero: { subirImagen: true, verContrato: true, verFactura: false },
    pintor: { subirImagen: true, verContrato: false, verFactura: false },
    carpintero: { subirImagen: true, verContrato: true, verFactura: false },
    reformista: { subirImagen: true, verContrato: true, verFactura: true },
  };

  static can(user: User, action: Action, context: { project?: Project } = {}) {
    if (user.rol === "admin") return true;
    if (action === "project.read" && user.rol === "cliente") return context.project?.clienteId === user.id;
    if (user.rol !== "profesional" || !user.profesion || !context.project?.profesionalesAsignados.some(professional => professional.userId === user.id)) return false;
    return action === "project.read" || action === "project.update.progress" || action === "project.update.milestones";
  }

  static authorize(user: User, action: Action, context: { project?: Project } = {}) {
    if (!this.can(user, action, context)) throw new ForbiddenError();
  }
}
