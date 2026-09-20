import type { IUserRepository } from "@reformapro/domain/repositories";
import { ForbiddenError, NotFoundError } from "@reformapro/domain/errors";
import type { IFileStorage } from "./file.use-cases.js";
import { validateUploadedFile } from "./file.use-cases.js";

export interface ProfessionalDocument {
  id: number;
  professionalId: number;
  uploadedBy: number;
  nombre: string;
  tipo: string;
  tamano: number;
  storageKey: string;
  deleting?: boolean;
  uploadedAt: Date;
}

export interface IProfessionalDocumentRepository {
  save(document: Omit<ProfessionalDocument, "id">): Promise<ProfessionalDocument>;
  findById(id: number): Promise<ProfessionalDocument | null>;
  findByProfessional(professionalId: number): Promise<ProfessionalDocument[]>;
  markDeleting(id: number): Promise<void>;
  delete(id: number): Promise<void>;
}

export class ProfessionalDocumentUseCases {
  constructor(
    private readonly users: IUserRepository,
    private readonly documents: IProfessionalDocumentRepository,
    private readonly storage: IFileStorage,
  ) {}

  private async authorize(actorId: number, professionalId?: number) {
    const actor = await this.users.findById(actorId);
    if (!actor?.activo || actor.rol !== "admin") throw new ForbiddenError();
    if (professionalId !== undefined) {
      const professional = await this.users.findById(professionalId);
      if (!professional || professional.rol !== "profesional") throw new NotFoundError("Profesional");
    }
    return actor;
  }

  async list(actorId: number, professionalId: number): Promise<ProfessionalDocument[]> {
    await this.authorize(actorId, professionalId);
    return (await this.documents.findByProfessional(professionalId)).filter(document => !document.deleting);
  }

  async upload(command: { actorId: number; professionalId: number; nombre: string; tipo: string; tamano: number; contenidoBase64: string }): Promise<ProfessionalDocument> {
    await this.authorize(command.actorId, command.professionalId);
    const bytes = validateUploadedFile(command.contenidoBase64, command.nombre, command.tipo, command.tamano);
    const stored = await this.storage.put({
      scope: "professionals", ownerId: command.professionalId,
      filename: command.nombre.trim(), contentType: command.tipo, bytes,
    });
    try {
      return await this.documents.save({
        professionalId: command.professionalId,
        uploadedBy: command.actorId,
        nombre: command.nombre.trim(), tipo: command.tipo, tamano: bytes.byteLength,
        storageKey: stored.key, uploadedAt: new Date(),
      });
    } catch (error) {
      await this.storage.delete(stored.key).catch(() => undefined);
      throw error;
    }
  }

  async download(actorId: number, documentId: number): Promise<{ document: ProfessionalDocument; bytes: Uint8Array }> {
    await this.authorize(actorId);
    const document = await this.documents.findById(documentId);
    if (!document || document.deleting) throw new NotFoundError("Documento");
    return { document, bytes: await this.storage.get(document.storageKey) };
  }

  async delete(actorId: number, documentId: number): Promise<void> {
    await this.authorize(actorId);
    const document = await this.documents.findById(documentId);
    if (!document) throw new NotFoundError("Documento");
    await this.documents.markDeleting(document.id);
    await this.storage.delete(document.storageKey);
    await this.documents.delete(document.id);
  }
}
