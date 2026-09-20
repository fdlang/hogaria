import { describe, expect, it } from "vitest";
import { Email } from "@reformapro/domain/value-objects";
import { InMemoryUserRepository } from "../../infrastructure/database/inMemoryRepositories.js";
import { ProfessionalDocumentUseCases, type IProfessionalDocumentRepository, type ProfessionalDocument } from "./professional-document.use-cases.js";
import type { IFileStorage } from "./file.use-cases.js";

const hasher = { hash: async (value: string) => value, verify: async (value: string, hash: string) => value === hash };
const pdf = btoa("%PDF-1.4\nhello");

class Documents implements IProfessionalDocumentRepository {
  items: ProfessionalDocument[] = [];
  async save(value: Omit<ProfessionalDocument, "id">) { const item = { ...value, id: this.items.length + 1 }; this.items.push(item); return item; }
  async findById(id: number) { return this.items.find(item => item.id === id) ?? null; }
  async findByProfessional(id: number) { return this.items.filter(item => item.professionalId === id); }
  async markDeleting(id: number) { const item = await this.findById(id); if (item) item.deleting = true; }
  async delete(id: number) { this.items = this.items.filter(item => item.id !== id); }
}
class Storage implements IFileStorage {
  values = new Map<string, Uint8Array>();
  async put(input: { scope: "projects" | "professionals"; ownerId: number; filename: string; contentType: string; bytes: Uint8Array }) { const key = `${input.scope}/${input.ownerId}/${input.filename}`; this.values.set(key, input.bytes); return { key }; }
  async delete(key: string) { this.values.delete(key); }
  async get(key: string) { return this.values.get(key)!; }
}

async function setup() {
  const users = new InMemoryUserRepository(hasher);
  const admin = await users.save({ id: 0, email: Email.of("admin@example.com"), nombre: "Admin", rol: "admin", activo: true, createdAt: new Date() });
  const professional = await users.save({ id: 0, email: Email.of("pro@example.com"), nombre: "Pro", rol: "profesional", profesion: "reformista", activo: true, createdAt: new Date() });
  const client = await users.save({ id: 0, email: Email.of("client@example.com"), nombre: "Client", rol: "cliente", activo: true, createdAt: new Date() });
  const documents = new Documents(); const storage = new Storage();
  return { admin, professional, client, documents, storage, cases: new ProfessionalDocumentUseCases(users, documents, storage) };
}

describe("professional documents", () => {
  it("allows an administrator to upload, list and download a private professional document", async () => {
    const { admin, professional, cases } = await setup();
    const document = await cases.upload({ actorId: admin.id, professionalId: professional.id, nombre: "certificado.pdf", tipo: "application/pdf", tamano: atob(pdf).length, contenidoBase64: pdf });
    expect((await cases.list(admin.id, professional.id)).map(item => item.nombre)).toEqual(["certificado.pdf"]);
    expect((await cases.download(admin.id, document.id)).bytes.byteLength).toBeGreaterThan(0);
  });

  it("does not expose professional documents to clients or professionals", async () => {
    const { admin, professional, client, cases } = await setup();
    const document = await cases.upload({ actorId: admin.id, professionalId: professional.id, nombre: "certificado.pdf", tipo: "application/pdf", tamano: atob(pdf).length, contenidoBase64: pdf });
    await expect(cases.list(client.id, professional.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(cases.download(professional.id, document.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
