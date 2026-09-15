/**
 * File use cases — project documents and images.
 *
 * Production notes:
 *   - Actual binary storage lives in S3/Cloud Storage; this use-case only
 *     handles metadata + access control.
 *   - Magic-byte validation happens at the upload endpoint, not here.
 *   - Sensitive files (contracts, invoices) are role-gated at read time.
 */

import { IProjectRepository, IUserRepository } from "@reformapro/domain/repositories";
import { IEventEmitter } from "@reformapro/domain/events";
import { ForbiddenError, NotFoundError, ValidationError } from "@reformapro/domain/errors";
import { PermissionPolicy, Profesion } from "@reformapro/domain/services";
import { ClientContext } from "./auth.use-cases.js";

export interface ProjectFile {
  id: number;
  projectId: number;
  uploadedBy: number;
  nombre: string;
  tipo: string;        // mime
  tamaño: number;      // bytes
  storageKey: string;  // S3 key
  sensitive: boolean;
  uploadedAt: Date;
}

export interface IFileRepository {
  save(f: Omit<ProjectFile, "id">): Promise<ProjectFile>;
  findById(id: number): Promise<ProjectFile | null>;
  findByProject(projectId: number): Promise<ProjectFile[]>;
  delete(id: number): Promise<void>;
}

const MAX_FILE_BYTES = 25 * 1024 * 1024; // 25 MB
const ALLOWED_MIMES = new Set([
  "image/jpeg", "image/png", "image/webp", "image/gif",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
]);

export class UploadFileUseCase {
  constructor(
    private readonly users: IUserRepository,
    private readonly projects: IProjectRepository,
    private readonly files: IFileRepository,
    private readonly events: IEventEmitter,
  ) {}

  async execute(cmd: {
    actorId: number; projectId: number;
    nombre: string; tipo: string; tamaño: number; storageKey: string;
    sensitive: boolean; ctx: ClientContext;
  }): Promise<ProjectFile> {
    const actor   = await this.users.findById(cmd.actorId);
    if (!actor) throw new ForbiddenError();
    const project = await this.projects.findById(cmd.projectId);
    if (!project) throw new NotFoundError("Proyecto");

    // Authorization:
    //   - Admin: always
    //   - Cliente: must own the project
    //   - Profesional: must be assigned AND their profession must allow `subirImagen`
    if (actor.rol === "cliente" && project.clienteId !== actor.id) throw new ForbiddenError();
    if (actor.rol === "profesional") {
      const assignment = project.profesionalesAsignados.find(a => a.userId === actor.id);
      if (!assignment) throw new ForbiddenError();
      if (!PermissionPolicy.PROFESSIONAL_ACCESS[assignment.profesion as Profesion]?.subirImagen) {
        throw new ForbiddenError("Tu profesión no permite subir archivos");
      }
      // Profesionales NEVER upload sensitive files (contracts/invoices/plans)
      if (cmd.sensitive) throw new ForbiddenError("Los profesionales no pueden subir archivos sensibles");
    }

    // Content validation
    if (cmd.tamaño > MAX_FILE_BYTES)    throw new ValidationError(`Archivo supera ${MAX_FILE_BYTES / 1024 / 1024} MB`);
    if (!ALLOWED_MIMES.has(cmd.tipo))   throw new ValidationError(`Tipo de archivo no permitido: ${cmd.tipo}`);
    if (!cmd.nombre?.trim())            throw new ValidationError("Nombre de archivo obligatorio");

    const saved = await this.files.save({
      projectId: cmd.projectId,
      uploadedBy: actor.id,
      nombre: cmd.nombre.trim(),
      tipo: cmd.tipo,
      tamaño: cmd.tamaño,
      storageKey: cmd.storageKey,
      sensitive: cmd.sensitive,
      uploadedAt: new Date(),
    });

    await this.events.emit({
      type: "FileUploaded", eventId: crypto.randomUUID(), occurredAt: new Date(),
      actorId: actor.id, actorName: actor.nombre,
      ip: cmd.ctx.ip, userAgent: cmd.ctx.userAgent,
      fileId: saved.id, projectId: cmd.projectId, sensitive: cmd.sensitive,
    });
    return saved;
  }
}

export class DeleteFileUseCase {
  constructor(
    private readonly users: IUserRepository,
    private readonly projects: IProjectRepository,
    private readonly files: IFileRepository,
  ) {}

  async execute(cmd: { actorId: number; fileId: number }): Promise<void> {
    const actor = await this.users.findById(cmd.actorId);
    if (!actor) throw new ForbiddenError();
    const file  = await this.files.findById(cmd.fileId);
    if (!file) throw new NotFoundError("Archivo");

    // Only admin can delete sensitive files; users can delete their own uploads
    if (file.sensitive && actor.rol !== "admin") throw new ForbiddenError();
    if (!file.sensitive && actor.rol !== "admin" && file.uploadedBy !== actor.id) throw new ForbiddenError();

    await this.files.delete(file.id);
  }
}

export class ListFilesUseCase {
  constructor(
    private readonly users: IUserRepository,
    private readonly projects: IProjectRepository,
    private readonly files: IFileRepository,
  ) {}
  async execute(cmd: { actorId: number; projectId: number }): Promise<ProjectFile[]> {
    const actor   = await this.users.findById(cmd.actorId);
    if (!actor) throw new ForbiddenError();
    const project = await this.projects.findById(cmd.projectId);
    if (!project) throw new NotFoundError("Proyecto");

    // Enforce project read permission first
    PermissionPolicy.authorize(actor, "project.read", { project });

    const all = await this.files.findByProject(cmd.projectId);

    // Clientes see all (including sensitive — their contracts/invoices)
    // Profesionales see everything EXCEPT sensitive files unless their profession permits
    if (actor.rol === "profesional") {
      const assignment = project.profesionalesAsignados.find(a => a.userId === actor.id);
      const perms = assignment ? PermissionPolicy.PROFESSIONAL_ACCESS[assignment.profesion as Profesion] : null;
      return all.filter(f => !f.sensitive || perms?.verContrato || perms?.verFactura);
    }

    return all;
  }
}
