/**
 * Audit / Solicitudes / Files HTTP controllers.
 * Grouped to keep the per-file overhead low — each is small.
 */

import { QueryAuditLogUseCase } from "../../application/use-cases/audit.use-cases.js";
import { ListSolicitudesUseCase, Solicitud, SubmitSolicitudUseCase, UpdateSolicitudStatusUseCase } from "../../application/use-cases/solicitud.use-cases.js";
import { DownloadFileUseCase, UploadFileUseCase, DeleteFileUseCase, ListFilesUseCase, ProjectFile } from "../../application/use-cases/file.use-cases.js";
import { AuditEntry } from "@reformapro/domain/entities";
import { toHttpError } from "./errorMiddleware.js";
import { HttpRequest, HttpResponse } from "./authController.js";

// ─────────────────────────────────────────────────────────────
// Audit
// ─────────────────────────────────────────────────────────────
function toAuditDTO(e: AuditEntry) {
  return {
    id: e.id, action: e.action,
    userId: e.userId, userName: e.userName,
    details: e.details,
    timestamp: e.timestamp.toISOString(),
    ip: e.ip, userAgent: e.userAgent,
  };
}

export function auditController(deps: { query: QueryAuditLogUseCase }) {
  return {
    // GET /audit?page=0&limit=50&action=...&userId=...&from=...&to=...
    async query(req: HttpRequest & { actorId: number; query: Record<string, string> }): Promise<HttpResponse> {
      try {
        const result = await deps.query.execute({
          actorId: req.actorId,
          page:   req.query.page   ? parseInt(req.query.page,   10) : undefined,
          limit:  req.query.limit  ? parseInt(req.query.limit,  10) : undefined,
          action: req.query.action ?? null,
          userId: req.query.userId ? parseInt(req.query.userId, 10) : null,
          from:   req.query.from   ? new Date(req.query.from)   : null,
          to:     req.query.to     ? new Date(req.query.to)     : null,
        });
        return {
          status: 200,
          body: {
            items: result.items.map(toAuditDTO),
            total: result.total, page: result.page, limit: result.limit, pages: result.pages,
          },
        };
      } catch (e) { return toHttpError(e); }
    },
  };
}

// ─────────────────────────────────────────────────────────────
// Solicitudes (public, rate-limited)
// ─────────────────────────────────────────────────────────────
function toSolicitudDTO(s: Solicitud) {
  return { ...s, fecha: s.fecha.toISOString() };
}

export function solicitudController(deps: { submit: SubmitSolicitudUseCase; list: ListSolicitudesUseCase; updateStatus: UpdateSolicitudStatusUseCase }) {
  const ctxOf = (req: HttpRequest) => ({ ip: req.ip, userAgent: req.headers["user-agent"] ?? "unknown" });

  return {
    // POST /solicitudes — public, rate-limited
    async submit(req: HttpRequest): Promise<HttpResponse> {
      try {
        const body = req.body as { nombre: string; email: string; telefono?: string; tipo: string; descripcion: string };
        const result = await deps.submit.execute({ ...body, ctx: ctxOf(req) });
        return { status: 201, body: result };
      } catch (e) { return toHttpError(e); }
    },

    // GET /solicitudes â€” admin only
    async list(req: HttpRequest & { actorId: number }): Promise<HttpResponse> {
      try {
        const solicitudes = await deps.list.execute(req.actorId);
        return { status: 200, body: solicitudes.map(toSolicitudDTO) };
      } catch (e) { return toHttpError(e); }
    },

    // POST /solicitudes/:id/contact — admin only
    async contact(req: HttpRequest & { actorId: number; params: { id: string } }): Promise<HttpResponse> {
      try {
        const solicitud = await deps.updateStatus.execute({ actorId: req.actorId, solicitudId: parseInt(req.params.id, 10), estado: "contactado" });
        return { status: 200, body: toSolicitudDTO(solicitud) };
      } catch (e) { return toHttpError(e); }
    },

    // POST /solicitudes/:id/reject — admin only
    async reject(req: HttpRequest & { actorId: number; params: { id: string } }): Promise<HttpResponse> {
      try {
        const body = req.body as { reason?: string };
        const cmd = { actorId: req.actorId, solicitudId: parseInt(req.params.id, 10), estado: "rechazado" as const, ...(body.reason ? { motivo: body.reason } : {}) };
        const solicitud = await deps.updateStatus.execute(cmd);
        return { status: 200, body: toSolicitudDTO(solicitud) };
      } catch (e) { return toHttpError(e); }
    },
  };
}

// ─────────────────────────────────────────────────────────────
// Files
// ─────────────────────────────────────────────────────────────
export function toFileDTO(f: ProjectFile) {
  return {
    id: f.id, projectId: f.projectId, uploadedBy: f.uploadedBy,
    nombre: f.nombre, tipo: f.tipo, tamaño: f.tamaño,
    sensitive: f.sensitive,
    classification: f.classification ?? (f.sensitive ? "reservado" : "publico"),
    uploadedAt: f.uploadedAt.toISOString(),
  };
}

export function fileController(deps: {
  upload: UploadFileUseCase;
  delete: DeleteFileUseCase;
  list:   ListFilesUseCase;
  download: DownloadFileUseCase;
}) {
  const ctxOf = (req: HttpRequest) => ({ ip: req.ip, userAgent: req.headers["user-agent"] ?? "unknown" });

  return {
    // POST /projects/:projectId/files — authenticated binary upload.
    async upload(req: HttpRequest & { actorId: number; params: { projectId: string } }): Promise<HttpResponse> {
      try {
        const body = (req.body ?? {}) as { nombre: string; tipo: string; tamaño: number; sensitive: boolean; contenidoBase64: string; classification?: string };
        const file = await deps.upload.execute({
          actorId: req.actorId,
          projectId: parseInt(req.params.projectId, 10),
          ctx: ctxOf(req),
          nombre: body.nombre, tipo: body.tipo, tamaño: body.tamaño,
          sensitive: body.sensitive, contenidoBase64: body.contenidoBase64,
          ...(body.classification === undefined ? {} : { classification: body.classification }),
        });
        return { status: 201, body: toFileDTO(file) };
      } catch (e) { return toHttpError(e); }
    },

    // DELETE /files/:id
    async delete(req: HttpRequest & { actorId: number; params: { id: string } }): Promise<HttpResponse> {
      try {
        await deps.delete.execute({ actorId: req.actorId, fileId: parseInt(req.params.id, 10) });
        return { status: 204, body: null };
      } catch (e) { return toHttpError(e); }
    },

    // GET /projects/:projectId/files
    async list(req: HttpRequest & { actorId: number; params: { projectId: string } }): Promise<HttpResponse> {
      try {
        const files = await deps.list.execute({
          actorId: req.actorId,
          projectId: parseInt(req.params.projectId, 10),
        });
        return { status: 200, body: files.map(toFileDTO) };
      } catch (e) { return toHttpError(e); }
    },

    // GET /files/:id/download — authorized binary response from private storage.
    async download(req: HttpRequest & { actorId: number; params: { id: string } }): Promise<HttpResponse> {
      try {
        const { file, bytes } = await deps.download.execute({ actorId: req.actorId, fileId: parseInt(req.params.id, 10) });
        const filename = file.nombre.replace(/[\\"\r\n]/g, "_");
        return {
          status: 200, body: bytes,
          headers: {
            "Content-Type": file.tipo,
            "Content-Length": String(bytes.byteLength),
            "Content-Disposition": `attachment; filename="${filename}"`,
            "Cache-Control": "private, no-store",
          },
        };
      } catch (e) { return toHttpError(e); }
    },
  };
}
