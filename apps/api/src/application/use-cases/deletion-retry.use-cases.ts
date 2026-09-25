import type { IFileRepository, IFileStorage } from "./file.use-cases.js";
import type { IProfessionalDocumentRepository } from "./professional-document.use-cases.js";

export interface PendingDeletionRepository {
  findDeleting(limit: number): Promise<Array<{ id: number; storageKey: string }>>;
  delete(id: number): Promise<void>;
}

/** Finishes two-phase Blob deletions left pending by transient storage failures. */
export class RetryPendingDeletionsUseCase {
  constructor(
    private readonly files: Pick<IFileRepository, "findDeleting" | "delete">,
    private readonly documents: Pick<IProfessionalDocumentRepository, "findDeleting" | "delete">,
    private readonly storage: Pick<IFileStorage, "delete">,
  ) {}

  async execute(requestedLimit = 50): Promise<{ processed: number; deleted: number; failed: number }> {
    const limit = Number.isSafeInteger(requestedLimit) ? Math.min(50, Math.max(1, requestedLimit)) : 50;
    const [files, documents] = await Promise.all([
      this.files.findDeleting(limit),
      this.documents.findDeleting(limit),
    ]);
    let deleted = 0;
    let failed = 0;
    for (const [repository, records] of [[this.files, files], [this.documents, documents]] as const) {
      for (const record of records) {
        try {
          await this.storage.delete(record.storageKey);
          await repository.delete(record.id);
          deleted += 1;
        } catch {
          failed += 1;
        }
      }
    }
    return { processed: files.length + documents.length, deleted, failed };
  }
}
