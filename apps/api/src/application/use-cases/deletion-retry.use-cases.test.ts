import { describe, expect, it, vi } from "vitest";
import { RetryPendingDeletionsUseCase } from "./deletion-retry.use-cases.js";

describe("RetryPendingDeletionsUseCase", () => {
  it("elimina el binario antes de retirar cada metadato pendiente", async () => {
    const calls: string[] = [];
    const files = {
      findDeleting: vi.fn(async () => [{ id: 1, storageKey: "project/1.pdf" }]),
      delete: vi.fn(async (id: number) => { calls.push(`file:${id}`); }),
    };
    const documents = {
      findDeleting: vi.fn(async () => [{ id: 2, storageKey: "professional/2.pdf" }]),
      delete: vi.fn(async (id: number) => { calls.push(`document:${id}`); }),
    };
    const storage = { delete: vi.fn(async (key: string) => { calls.push(`blob:${key}`); }) };

    const projects = { findById: vi.fn(async () => ({ archivedAt: null })) };
    const result = await new RetryPendingDeletionsUseCase(files as never, documents as never, storage as never, projects as never).execute(10);

    expect(result).toEqual({ processed: 2, deleted: 2, failed: 0 });
    expect(calls).toEqual(["blob:project/1.pdf", "file:1", "blob:professional/2.pdf", "document:2"]);
  });

  it("aísla los fallos y conserva el metadato para el siguiente intento", async () => {
    const files = {
      findDeleting: vi.fn(async () => [
        { id: 1, storageKey: "broken" },
        { id: 2, storageKey: "healthy" },
      ]),
      delete: vi.fn(async () => undefined),
    };
    const documents = { findDeleting: vi.fn(async () => []), delete: vi.fn() };
    const storage = { delete: vi.fn(async (key: string) => { if (key === "broken") throw new Error("blob unavailable"); }) };

    const projects = { findById: vi.fn(async () => ({ archivedAt: null })) };
    const result = await new RetryPendingDeletionsUseCase(files as never, documents as never, storage as never, projects as never).execute(10);

    expect(result).toEqual({ processed: 2, deleted: 1, failed: 1 });
    expect(files.delete).toHaveBeenCalledTimes(1);
    expect(files.delete).toHaveBeenCalledWith(2);
  });

  it("limita el trabajo de cada ejecución", async () => {
    const files = { findDeleting: vi.fn(async () => []), delete: vi.fn() };
    const documents = { findDeleting: vi.fn(async () => []), delete: vi.fn() };
    const storage = { delete: vi.fn() };

    const projects = { findById: vi.fn(async () => ({ archivedAt: null })) };
    await new RetryPendingDeletionsUseCase(files as never, documents as never, storage as never, projects as never).execute(999);

    expect(files.findDeleting).toHaveBeenCalledWith(50);
    expect(documents.findDeleting).toHaveBeenCalledWith(50);
  });
  it("never completes a pending file deletion after its project is archived", async () => {
    const files = {
      findDeleting: vi.fn(async () => [{ id: 1, projectId: 7, storageKey: "project/archived.pdf" }]),
      delete: vi.fn(),
    };
    const documents = { findDeleting: vi.fn(async () => []), delete: vi.fn() };
    const storage = { delete: vi.fn() };
    const projects = { findById: vi.fn(async () => ({ archivedAt: new Date() })) };

    const result = await new RetryPendingDeletionsUseCase(files as never, documents as never, storage as never, projects as never).execute(10);

    expect(result).toEqual({ processed: 1, deleted: 0, failed: 1 });
    expect(storage.delete).not.toHaveBeenCalled();
    expect(files.delete).not.toHaveBeenCalled();
  });
});
