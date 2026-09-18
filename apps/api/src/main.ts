/**
 * API server — minimal HTTP bootstrap.
 *
 * Intentionally thin. In production replace with NestJS / Fastify / Express:
 *   - the controllers already return HttpResponse shapes (status + body)
 *   - the error middleware is framework-agnostic
 *   - the use cases don't know anything about HTTP
 *
 * This implementation uses Node's built-in `http` module so the project runs
 * without any framework dependency, and serves as a concrete example of how
 * the pieces compose.
 */

import http from "node:http";
import type { IncomingMessage, ServerResponse } from "node:http";
import { URL } from "node:url";
import { buildApp } from "./bootstrap.js";
import { authController, requireAuth, HttpRequest, HttpResponse } from "./interfaces/http/authController.js";
import { userController }    from "./interfaces/http/userController.js";
import { projectController } from "./interfaces/http/projectController.js";
import { auditController, solicitudController, fileController } from "./interfaces/http/otherControllers.js";
import { salesController } from "./interfaces/http/salesController.js";
import { toHttpError } from "./interfaces/http/errorMiddleware.js";
import { ValidationError } from "@reformapro/domain/errors";

const PORT = Number(process.env.PORT ?? 3001);
const isProduction = process.env.NODE_ENV === "production" || process.env.VERCEL === "1";
const allowedOrigins = (process.env.ALLOWED_ORIGINS ?? "").split(",").map(origin => origin.trim()).filter(Boolean);

// ── Composition root ─────────────────────────────────────────
// ── Router ────────────────────────────────────────────────────
type Req     = HttpRequest & { actorId?: number; params: Record<string, string>; query: Record<string, string> };
type Handler = (req: Req) => Promise<HttpResponse>;

interface Route {
  method: string;
  pattern: RegExp;
  keys: string[];
  handler: Handler;
  protected?: boolean | undefined;
}

function route(method: string, path: string, handler: Handler, opts: { protected?: boolean } = {}): Route {
  const keys: string[] = [];
  const pattern = new RegExp("^" + path.replace(/:([a-zA-Z]+)/g, (_, k) => { keys.push(k); return "([^/]+)"; }) + "$");
  return { method, pattern, keys, handler, protected: opts.protected };
}

interface Runtime {
  routes: Route[];
  authMiddleware: ReturnType<typeof requireAuth>;
}

let runtimePromise: Promise<Runtime> | null = null;

function getRuntime(): Promise<Runtime> {
  if (runtimePromise) return runtimePromise;

  runtimePromise = buildApp().then(app => {
    const auth = authController({ loginUseCase: app.useCases.login, users: app.users, tokens: app.tokens });
    const users = userController({
      create: app.useCases.createUser, update: app.useCases.updateUser,
      delete: app.useCases.deleteUser, list: app.useCases.listUsers,
      activation: app.useCases.activation,
    });
    const projects = projectController({
      update: app.useCases.updateProject,
      delete: app.useCases.deleteProject, list: app.useCases.listProjects,
      get: app.useCases.getProject,
      assign: app.useCases.assignProjectProfessional,
      unassign: app.useCases.unassignProjectProfessional,
    });
    const audit = auditController({ query: app.useCases.queryAuditLog });
    const solicitudes = solicitudController({ submit: app.useCases.submitSolicitud, list: app.useCases.listSolicitudes, updateStatus: app.useCases.updateSolicitudStatus });
    const files = fileController({
      upload: app.useCases.uploadFile, delete: app.useCases.deleteFile, list: app.useCases.listFiles,
      download: app.useCases.downloadFile,
    });
    const sales = salesController({ opportunities: app.useCases.opportunities, estimates: app.useCases.estimates, changes: app.useCases.changes });

    return { authMiddleware: requireAuth(app.tokens, app.users), routes: [
  // Auth (public)
  route("POST", "/auth/login",  async req => auth.login(req)),
  route("GET",  "/auth/me",     async req => auth.me(req)),
  route("POST", "/auth/logout", async ()  => auth.logout()),
  route("POST", "/auth/activate", async req => users.activate(req)),

  // Commercial pipeline: opportunity -> versioned estimate -> project.
  route("GET",   "/opportunities",       req => sales.listOpportunities(req as never), { protected: true }),
  route("POST",  "/opportunities",       req => sales.createOpportunity(req as never), { protected: true }),
  route("PATCH", "/opportunities/:id",   req => sales.updateOpportunity(req as never), { protected: true }),
  route("GET",   "/estimates",           req => sales.listEstimates(req as never),     { protected: true }),
  route("POST",  "/estimates",           req => sales.createEstimate(req as never),    { protected: true }),
  route("GET",   "/estimates/:id",       req => sales.getEstimate(req as never),       { protected: true }),
  route("PATCH", "/estimates/:id",       req => sales.updateEstimate(req as never),    { protected: true }),
  route("POST",  "/estimates/:id/send",  req => sales.sendEstimate(req as never),      { protected: true }),
  route("POST",  "/estimates/:id/sign",  req => sales.signEstimate(req as never),      { protected: true }),
  route("POST",  "/estimates/:id/reject",req => sales.rejectEstimate(req as never),    { protected: true }),
  route("POST",  "/estimates/:id/revise",req => sales.reviseEstimate(req as never),    { protected: true }),
  route("POST",  "/estimates/:id/accept",req => sales.acceptEstimate(req as never),    { protected: true }),
  route("GET",   "/projects/:projectId/change-orders", req => sales.listChanges(req as never), { protected: true }),
  route("POST",  "/projects/:projectId/change-orders", req => sales.createChange(req as never), { protected: true }),

  // Users
  route("GET",    "/users",        req => users.list(req   as never), { protected: true }),
  route("POST",   "/users",        req => users.create(req as never), { protected: true }),
  route("PATCH",  "/users/:id",    req => users.update(req as never), { protected: true }),
  route("DELETE", "/users/:id",    req => users.delete(req as never), { protected: true }),
  route("POST", "/users/:id/invitation", req => users.resendInvitation(req as never), { protected: true }),

  // Projects
  route("GET",    "/projects",          req => projects.list(req   as never), { protected: true }),
  route("GET",    "/projects/:id",      req => projects.get(req    as never), { protected: true }),
  route("PATCH",  "/projects/:id",      req => projects.update(req as never), { protected: true }),
  route("DELETE", "/projects/:id",      req => projects.delete(req as never), { protected: true }),
  route("POST",   "/projects/:id/professionals", req => projects.assign(req as never), { protected: true }),
  route("DELETE", "/projects/:id/professionals/:userId", req => projects.unassign(req as never), { protected: true }),

  // Audit
  route("GET", "/audit", req => audit.query(req as never), { protected: true }),

  // Solicitudes (POST is public)
  route("POST", "/solicitudes", req => solicitudes.submit(req as never)),
  route("GET", "/solicitudes", req => solicitudes.list(req as never), { protected: true }),
  route("POST", "/solicitudes/:id/contact", req => solicitudes.contact(req as never), { protected: true }),
  route("POST", "/solicitudes/:id/reject", req => solicitudes.reject(req as never), { protected: true }),

  // Files
  route("GET",    "/projects/:projectId/files", req => files.list(req   as never), { protected: true }),
  route("POST",   "/projects/:projectId/files", req => files.upload(req as never), { protected: true }),
  route("DELETE", "/files/:id",                 req => files.delete(req as never), { protected: true }),
  route("GET",    "/files/:id/download",        req => files.download(req as never), { protected: true }),
    ] };
  }).catch(error => {
    // A rejected initialisation must not poison future serverless invocations.
    runtimePromise = null;
    throw error;
  });

  return runtimePromise;
}

// ── HTTP server ────────────────────────────────────────────────
export async function apiHandler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  try {
    const origin = typeof req.headers.origin === "string" ? req.headers.origin : undefined;
    const requestHost = typeof req.headers["x-forwarded-host"] === "string" ? req.headers["x-forwarded-host"] : req.headers.host;
    const originHost = origin?.replace(/^https?:\/\//, "").split("/")[0];
    const isSameOrigin = origin ? originHost === requestHost : true;
    if (origin && !isSameOrigin && !allowedOrigins.includes(origin)) {
      if (isProduction) {
        res.writeHead(403, { "Content-Type": "application/json" }).end(JSON.stringify({ code: "FORBIDDEN", message: "Origen no permitido" }));
        return;
      }
      res.setHeader("Access-Control-Allow-Origin", "*");
    } else if (origin) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Vary", "Origin");
    }
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
    if (req.method === "OPTIONS") { res.writeHead(204).end(); return; }

    const { routes, authMiddleware } = await getRuntime();
    const url = new URL(req.url ?? "/", `http://${req.headers.host}`);
    // Vercel forwards requests through /api/:path*. Local development may call
    // the API directly, so normalize both forms before route matching.
    const pathname = url.pathname.replace(/^\/api(?=\/|$)/, "") || "/";
    const match = routes.find(r => r.method === req.method && r.pattern.test(pathname));

    if (!match) { res.writeHead(404).end(JSON.stringify({ code: "NOT_FOUND", message: "Ruta no encontrada" })); return; }

    // Parse path params
    const m = pathname.match(match.pattern)!;
    const params: Record<string, string> = {};
    match.keys.forEach((k, i) => { params[k] = m[i + 1]!; });

    // Parse query
    const query: Record<string, string> = {};
    url.searchParams.forEach((v, k) => { query[k] = v; });

    // Parse body
    const body = await parseJsonBody(req);

    const httpReq: Req = {
      body, headers: req.headers as Record<string, string>, ip: getClientIP(req),
      params, query,
    };

    if (match.protected) {
      const authResult = await authMiddleware(httpReq);
      if ("status" in authResult) {
        res.writeHead(authResult.status, { "Content-Type": "application/json" }).end(JSON.stringify(authResult.body));
        return;
      }
      httpReq.actorId = authResult.actorId;
    }

    const result = await match.handler(httpReq);
    const headers = result.headers ?? {};
    if (result.body instanceof Uint8Array) {
      res.writeHead(result.status, headers).end(result.body as unknown as string);
      return;
    }
    res.writeHead(result.status, { "Content-Type": "application/json", ...headers }).end(
      result.body === null ? "" : JSON.stringify(result.body)
    );
  } catch (err) {
    const { status, body } = toHttpError(err);
    res.writeHead(status, { "Content-Type": "application/json" }).end(JSON.stringify(body));
  }
}

// A standalone listener is useful locally. Vercel imports apiHandler directly,
// so no persistent process is started in serverless production.
if (!process.env.VERCEL) {
  http.createServer(apiHandler).listen(PORT, () => {
    console.log(`[api] listening on http://localhost:${PORT}`);
  });
}

// ── Helpers ────────────────────────────────────────────────────
function parseJsonBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    if (req.method === "GET" || req.method === "DELETE") { resolve({}); return; }
    let raw = "";
    let tooLarge = false;
    req.on("data", (chunk: Buffer) => {
      raw += chunk.toString();
      // A 3 MiB file is ~4.2 MB after base64 encoding; keep below Vercel's 4.5 MB ceiling.
      if (raw.length > 4_400_000) tooLarge = true;
    });
    req.on("end", () => {
      if (tooLarge) { reject(new ValidationError("La solicitud supera el límite permitido")); return; }
      try { resolve(raw ? JSON.parse(raw) : {}); } catch { reject(new ValidationError("JSON inválido")); }
    });
    req.on("error", reject);
  });
}

function getClientIP(req: IncomingMessage): string {
  // Behind a reverse proxy use X-Forwarded-For; otherwise use the socket
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string") return forwarded.split(",")[0]!.trim();
  return req.socket.remoteAddress ?? "unknown";
}
