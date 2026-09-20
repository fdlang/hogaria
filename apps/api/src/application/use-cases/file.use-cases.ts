/**
 * File use cases — project documents and images.
 *
 * Production notes:
 *   - Private binary storage is accessed through IFileStorage;
 *     this use case validates content, persists metadata and enforces access.
 *   - File signatures are checked here, before storage.
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
  classification?: "publico" | "contrato" | "factura" | "reservado";
  uploadedAt: Date;
}

export interface IFileRepository {
  save(f: Omit<ProjectFile, "id">): Promise<ProjectFile>;
  findById(id: number): Promise<ProjectFile | null>;
  findByProject(projectId: number): Promise<ProjectFile[]>;
  delete(id: number): Promise<void>;
}

export interface IFileStorage {
  put(input: { projectId: number; filename: string; contentType: string; bytes: Uint8Array }): Promise<{ key: string }>;
  delete(key: string): Promise<void>;
  get(key: string): Promise<Uint8Array>;
}

// Server uploads on Vercel stay below the platform request-body limit.
const MAX_FILE_BYTES = 3 * 1024 * 1024;
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
    private readonly storage: IFileStorage,
    private readonly events: IEventEmitter,
  ) {}

  async execute(cmd: {
    actorId: number; projectId: number;
    nombre: string; tipo: string; tamaño: number;
    sensitive: boolean; contenidoBase64: string; classification?: string; ctx: ClientContext;
  }): Promise<ProjectFile> {
    const actor   = await this.users.findById(cmd.actorId);
    if (!actor) throw new ForbiddenError();
    const project = await this.projects.findById(cmd.projectId);
    if (!project) throw new NotFoundError("Proyecto");
    if(typeof cmd.sensitive!=="boolean")throw new ValidationError("Indica la privacidad del documento");
    const classification=cmd.classification??(cmd.sensitive?"reservado":"publico");
    if(!["publico","contrato","factura","reservado"].includes(classification))throw new ValidationError("Clasificación de documento no válida");
    if((classification==="publico")===cmd.sensitive)throw new ValidationError("La clasificación y privacidad no coinciden");
    if(actor.rol!=="admin"&&classification!== "publico"&&classification!=="reservado")throw new ForbiddenError("Solo administración clasifica contratos y facturas");

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

    // Metadata alone is never accepted: persist exactly the bytes selected in the browser.
    const bytes = decodeBase64(cmd.contenidoBase64);
    if (bytes.byteLength === 0) throw new ValidationError("El archivo está vacío");
    if (bytes.byteLength > MAX_FILE_BYTES) throw new ValidationError(`Archivo supera ${MAX_FILE_BYTES / 1024 / 1024} MB`);

    // Content validation
    if (cmd.tamaño > MAX_FILE_BYTES)    throw new ValidationError(`Archivo supera ${MAX_FILE_BYTES / 1024 / 1024} MB`);
    if (!ALLOWED_MIMES.has(cmd.tipo))   throw new ValidationError(`Tipo de archivo no permitido: ${cmd.tipo}`);
    if (typeof cmd.nombre !== "string" || !cmd.nombre.trim() || cmd.nombre.length > 255)            throw new ValidationError("Nombre de archivo obligatorio");
    assertFileSignature(bytes, cmd.tipo);

    const stored = await this.storage.put({ projectId: cmd.projectId, filename: cmd.nombre.trim(), contentType: cmd.tipo, bytes });
    let saved: ProjectFile;
    try {
      saved = await this.files.save({
      projectId: cmd.projectId,
      uploadedBy: actor.id,
      nombre: cmd.nombre.trim(),
      tipo: cmd.tipo,
      tamaño: bytes.byteLength,
      storageKey: stored.key,
      sensitive: cmd.sensitive,
      classification: classification as ProjectFile["classification"] & string,
      uploadedAt: new Date(),
      });
    } catch (error) {
      await this.storage.delete(stored.key).catch(() => undefined);
      throw error;
    }

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
    private readonly storage: IFileStorage,
  ) {}

  async execute(cmd: { actorId: number; fileId: number }): Promise<void> {
    const actor = await this.users.findById(cmd.actorId);
    if (!actor) throw new ForbiddenError();
    const file  = await this.files.findById(cmd.fileId);
    if (!file) throw new NotFoundError("Archivo");

    // Only admin can delete sensitive files; users can delete their own uploads
    const project = await this.projects.findById(file.projectId);
    if (!project) throw new NotFoundError("Proyecto");
    PermissionPolicy.authorize(actor, "project.read", { project });
    if (file.sensitive && actor.rol !== "admin") throw new ForbiddenError();
    if (!file.sensitive && actor.rol !== "admin" && file.uploadedBy !== actor.id) throw new ForbiddenError();

    await this.storage.delete(file.storageKey);
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
      return all.filter(f => canReadFile(f, perms));
    }

    return all;
  }
}

export class DownloadFileUseCase {
  constructor(
    private readonly users: IUserRepository,
    private readonly projects: IProjectRepository,
    private readonly files: IFileRepository,
    private readonly storage: IFileStorage,
  ) {}
  async execute(cmd: { actorId: number; fileId: number }): Promise<{ file: ProjectFile; bytes: Uint8Array }> {
    const actor = await this.users.findById(cmd.actorId);
    if (!actor) throw new ForbiddenError();
    const file = await this.files.findById(cmd.fileId);
    if (!file) throw new NotFoundError("Archivo");
    const project = await this.projects.findById(file.projectId);
    if (!project) throw new NotFoundError("Proyecto");
    PermissionPolicy.authorize(actor, "project.read", { project });
    if (actor.rol === "profesional") {
      const assignment = project.profesionalesAsignados.find(a => a.userId === actor.id);
      const perms = assignment ? PermissionPolicy.PROFESSIONAL_ACCESS[assignment.profesion as Profesion] : null;
      if (!canReadFile(file,perms)) throw new ForbiddenError();
    }
    return { file, bytes: await this.storage.get(file.storageKey) };
  }
}

function canReadFile(file:ProjectFile,perms:{verContrato:boolean;verFactura:boolean}|null|undefined):boolean {
  if(!file.sensitive&&(!file.classification||file.classification==="publico"))return true;
  if(file.classification==="contrato")return !!perms?.verContrato;
  if(file.classification==="factura")return !!perms?.verFactura;
  return false; // Legacy sensitive files stay reserved until classified by admin.
}
function decodeBase64(value: string): Uint8Array {
  if (typeof value !== "string" || !/^[A-Za-z0-9+/]*={0,2}$/.test(value) || value.length % 4 !== 0) {
    throw new ValidationError("Contenido de archivo inválido", "contenidoBase64");
  }
  const binary = atob(value);
  return Uint8Array.from(binary, char => char.charCodeAt(0));
}

function startsWith(bytes: Uint8Array, signature: number[]) {
  return bytes.length >= signature.length && signature.every((byte, index) => bytes[index] === byte);
}

/** MIME is client-controlled, so verify the bytes before storage. */
function assertFileSignature(bytes: Uint8Array, mime: string) {
  const valid = (() => {
    switch (mime) {
      case "image/jpeg": return startsWith(bytes, [0xff, 0xd8, 0xff]);
      case "image/png": return startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
      case "image/gif": return startsWith(bytes, [0x47, 0x49, 0x46, 0x38, 0x37, 0x61]) || startsWith(bytes, [0x47, 0x49, 0x46, 0x38, 0x39, 0x61]);
      case "image/webp": return startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP";
      case "application/pdf": return startsWith(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d]);
      case "application/msword":
      case "application/vnd.ms-excel": return startsWith(bytes, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
      case "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
      case "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": return startsWith(bytes, [0x50, 0x4b, 0x03, 0x04]);
      default: return false;
    }
  })();
  if (!valid) throw new ValidationError("El contenido no coincide con el tipo de archivo declarado", "contenidoBase64");
}
