import { del, get, put } from "@vercel/blob";
import { ValidationError } from "@reformapro/domain/errors";
import type { IFileStorage } from "../../application/use-cases/file.use-cases.js";

/** Private object storage for project documents. Blob URLs are never exposed in DTOs. */
export class VercelBlobFileStorage implements IFileStorage {
  constructor(private readonly token = process.env.BLOB_READ_WRITE_TOKEN) {}

  async put(input: { projectId: number; filename: string; contentType: string; bytes: Uint8Array }): Promise<{ key: string }> {
    if (!this.token) throw new ValidationError("El almacenamiento de documentos no está configurado");
    const filename = input.filename.replace(/[^a-zA-Z0-9._-]/g, "_");
    const pathname = `projects/${input.projectId}/${crypto.randomUUID()}-${filename}`;
    const result = await put(pathname, Buffer.from(input.bytes), {
      access: "private",
      addRandomSuffix: false,
      contentType: input.contentType,
      token: this.token,
    });
    return { key: result.pathname };
  }

  async delete(key: string): Promise<void> {
    if (!this.token) throw new ValidationError("El almacenamiento de documentos no está configurado");
    await del(key, { token: this.token });
  }

  async get(key: string): Promise<Uint8Array> {
    if (!this.token) throw new ValidationError("El almacenamiento de documentos no está configurado");
    const result = await get(key, { access: "private", token: this.token });
    if (!result || result.statusCode !== 200 || !result.stream) throw new ValidationError("No se pudo recuperar el documento");
    return new Uint8Array(await new Response(result.stream).arrayBuffer());
  }
}
