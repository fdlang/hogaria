import type { IBlobCleanupQueue, IFileRepository, IFileStorage } from "./file.use-cases.js";
import type { IProfessionalDocumentRepository } from "./professional-document.use-cases.js";
import type { IProjectRepository } from "@reformapro/domain/repositories";

export interface PendingDeletionRepository {
  findDeleting(limit: number): Promise<Array<{ id: number; storageKey: string }>>;
  delete(id: number): Promise<void>;
}

/** Finishes two-phase Blob deletions left pending by transient storage failures. */
export class RetryPendingDeletionsUseCase {
  constructor(
    private readonly files: Pick<IFileRepository, "findDeleting" | "findByStorageKey" | "delete">,
    private readonly documents: Pick<IProfessionalDocumentRepository, "findDeleting" | "findByStorageKey" | "delete">,
    private readonly storage: Pick<IFileStorage, "delete">,
    private readonly projects: Pick<IProjectRepository, "findById">,
    private readonly orphanedUploads?: Pick<IBlobCleanupQueue, "find" | "remove" | "fail">,
  ) {}

  async execute(requestedLimit = 50): Promise<{ processed: number; deleted: number; failed: number }> {
    const limit = Number.isSafeInteger(requestedLimit) ? Math.min(50, Math.max(1, requestedLimit)) : 50;
    const [files, documents, orphanedUploads] = await Promise.all([
      this.files.findDeleting(limit),
      this.documents.findDeleting(limit),
      this.orphanedUploads?.find(limit) ?? [],
    ]);
    let deleted = 0;
    let failed = 0;
    for (const record of files) {
      try {
        const project = await this.projects.findById(record.projectId);
        if (!project || project.archivedAt) {
          failed += 1;
          continue;
        }
        await this.storage.delete(record.storageKey);
        await this.files.delete(record.id);
        deleted += 1;
      } catch {
        failed += 1;
      }
    }
    for (const record of documents) {
      try {
        await this.storage.delete(record.storageKey);
        await this.documents.delete(record.id);
        deleted += 1;
      } catch {
        failed += 1;
      }
    }
    for (const record of orphanedUploads) {
      try {
        const [file, document] = await Promise.all([
          this.files.findByStorageKey(record.storageKey),
          this.documents.findByStorageKey(record.storageKey),
        ]);
        if (file || document) {
          await this.orphanedUploads!.remove(record.storageKey);
          deleted += 1;
          continue;
        }
        await this.storage.delete(record.storageKey);
        await this.orphanedUploads!.remove(record.storageKey);
        deleted += 1;
      } catch (error) {
        failed += 1;
        await Promise.resolve(this.orphanedUploads!.fail(record.storageKey, error instanceof Error ? error.message : "Error de limpieza")).catch(() => undefined);
      }
    }
    return { processed: files.length + documents.length + orphanedUploads.length, deleted, failed };
  }
}
