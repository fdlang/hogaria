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
import type { UserRole } from "@reformapro/domain/entities";
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
  classification?: "publico" | "tecnico" | "contrato" | "factura" | "reservado";
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
    if (!actor?.activo) throw new ForbiddenError();
    const project = await this.projects.findById(cmd.projectId);
    if (!project) throw new NotFoundError("Proyecto");
    if(typeof cmd.sensitive!=="boolean")throw new ValidationError("Indica la privacidad del documento");
    let classification=cmd.classification??(cmd.sensitive?"reservado":"publico");
    if(!["publico","tecnico","contrato","factura","reservado"].includes(classification))throw new ValidationError("Clasificación de documento no válida");

    // Authorization:
    //   - Admin: always
    //   - Cliente: must own the project
    //   - Profesional: must be assigned AND their profession must allow `subirImagen`
    if (actor.rol === "cliente" && project.clienteId !== actor.id) throw new ForbiddenError();
    if (actor.rol === "cliente") {
      if (cmd.sensitive || classification !== "publico") throw new ForbiddenError("Los clientes solo pueden compartir documentos públicos de su obra");
    }
    if (actor.rol === "profesional") {
      const assignment = project.profesionalesAsignados.find(a => a.userId === actor.id);
      if (!assignment) throw new ForbiddenError();
      if (!PermissionPolicy.PROFESSIONAL_ACCESS[assignment.profesion as Profesion]?.subirImagen) {
        throw new ForbiddenError("Tu profesión no permite subir archivos");
      }
      // Profesionales NEVER upload sensitive files (contracts/invoices/plans)
      if (cmd.sensitive) throw new ForbiddenError("Los profesionales no pueden subir archivos sensibles");
      // Worker uploads are operational evidence, never customer-facing financial
      // or contractual documents. The server assigns the classification instead
      // of trusting the browser-provided value.
      classification = "tecnico";
    }
    if (actor.rol === "admin") {
      const sensitiveClassification = ["contrato","factura","reservado"].includes(classification);
      if (sensitiveClassification !== cmd.sensitive) throw new ValidationError("La clasificación y privacidad no coinciden");
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
    if (!actor?.activo) throw new ForbiddenError();
    const file  = await this.files.findById(cmd.fileId);
    if (!file) throw new NotFoundError("Archivo");

    // Only admin can delete sensitive files; users can delete their own uploads
    const project = await this.projects.findById(file.projectId);
    if (!project) throw new NotFoundError("Proyecto");
    if (!PermissionPolicy.can(actor, "project.read", { project })) throw new NotFoundError("Proyecto");
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
    if (!actor?.activo) throw new ForbiddenError();
    const project = await this.projects.findById(cmd.projectId);
    if (!project) throw new NotFoundError("Proyecto");

    // Enforce project read permission first
    if (!PermissionPolicy.can(actor, "project.read", { project })) throw new NotFoundError("Proyecto");

    const all = await this.files.findByProject(cmd.projectId);

    return all.filter(file => canReadFile(file, actor.rol));
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
    if (!actor?.activo) throw new ForbiddenError();
    const file = await this.files.findById(cmd.fileId);
    if (!file) throw new NotFoundError("Archivo");
    const project = await this.projects.findById(file.projectId);
    if (!project) throw new NotFoundError("Proyecto");
    if (!PermissionPolicy.can(actor, "project.read", { project })) throw new NotFoundError("Archivo");
    if (!canReadFile(file,actor.rol)) throw new NotFoundError("Archivo");
    return { file, bytes: await this.storage.get(file.storageKey) };
  }
}

function canReadFile(file:ProjectFile,role:UserRole):boolean {
  if(role==="admin")return true;
  const classification=file.classification??(file.sensitive?"reservado":"publico");
  if(role==="profesional")return classification==="publico"||classification==="tecnico";
  if(role==="cliente")return classification!=="reservado";
  return false;
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

function containsAscii(bytes: Uint8Array, value: string) {
  const pattern = new TextEncoder().encode(value);
  outer: for (let i = 0; i <= bytes.length - pattern.length; i += 1) {
    for (let j = 0; j < pattern.length; j += 1) if (bytes[i + j] !== pattern[j]) continue outer;
    return true;
  }
  return false;
}

/** MIME is client-controlled, so verify the bytes before storage. */
function assertFileSignature(bytes: Uint8Array, mime: string) {
  const valid = (() => {
    switch (mime) {
      case "image/jpeg": return startsWith(bytes, [0xff, 0xd8, 0xff]);
      case "image/png": return startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
      case "image/gif": return startsWith(bytes, [0x47, 0x49, 0x46, 0x38, 0x37, 0x61]) || startsWith(bytes, [0x47, 0x49, 0x46, 0x38, 0x39, 0x61]);
      case "image/webp": return startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP";
      case "application/pdf": return startsWith(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d]) &&
        !["/JavaScript", "/JS", "/OpenAction", "/Launch", "/EmbeddedFile", "/RichMedia"].some(marker => containsAscii(bytes, marker));
      default: return false;
    }
  })();
  if (!valid) throw new ValidationError("El contenido no coincide con el tipo de archivo declarado", "contenidoBase64");
}
