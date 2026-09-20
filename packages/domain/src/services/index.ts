import { ForbiddenError } from "../errors/index.js";
import type { Profesion, Project, User } from "../entities/index.js";
export type { Profesion } from "../entities/index.js";

export type Action = "project.update" | "project.read" | "project.update.progress" | "project.update.milestones" | "user.manage";

export class PermissionPolicy {
  static readonly PROFESSIONAL_ACCESS: Record<Profesion, { subirImagen: boolean; verDocumentacionTecnica: boolean }> = {
    albanil: { subirImagen: true, verDocumentacionTecnica: true },
    electricista: { subirImagen: true, verDocumentacionTecnica: true },
    fontanero: { subirImagen: true, verDocumentacionTecnica: true },
    pintor: { subirImagen: true, verDocumentacionTecnica: true },
    carpintero: { subirImagen: true, verDocumentacionTecnica: true },
    reformista: { subirImagen: true, verDocumentacionTecnica: true },
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
