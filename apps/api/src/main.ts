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
import type { IncomingMessage } from "node:http";
import { URL } from "node:url";
import { buildApp } from "./bootstrap.js";
import { authController, requireAuth, HttpRequest, HttpResponse } from "./interfaces/http/authController.js";
import { budgetController } from "./interfaces/http/budgetController.js";
import { userController }    from "./interfaces/http/userController.js";
import { projectController } from "./interfaces/http/projectController.js";
import { auditController, solicitudController, fileController } from "./interfaces/http/otherControllers.js";
import { toHttpError } from "./interfaces/http/errorMiddleware.js";

const PORT = Number(process.env.PORT ?? 3001);

// ── Composition root ─────────────────────────────────────────
const app = await buildApp();

const auth     = authController({ loginUseCase: app.useCases.login, users: app.users, tokens: app.tokens });
const budgets  = budgetController({
  create:    app.useCases.createBudget,
  send:      app.useCases.sendBudget,
  delete:    app.useCases.deleteBudget,
  list:      app.useCases.listBudgets,
  challenge: app.useCases.requestSignatureChallenge,
  sign:      app.useCases.signBudget,
});
const users    = userController({
  create: app.useCases.createUser, update: app.useCases.updateUser,
  delete: app.useCases.deleteUser, list:   app.useCases.listUsers,
});
const projects = projectController({
  create: app.useCases.createProject, update: app.useCases.updateProject,
  delete: app.useCases.deleteProject, list:   app.useCases.listProjects,
});
const audit       = auditController({ query: app.useCases.queryAuditLog });
const solicitudes = solicitudController({ submit: app.useCases.submitSolicitud });
const files       = fileController({
  upload: app.useCases.uploadFile, delete: app.useCases.deleteFile, list: app.useCases.listFiles,
});

const authMiddleware = requireAuth(app.tokens);

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

const ROUTES: Route[] = [
  // Auth (public)
  route("POST", "/auth/login",  async req => auth.login(req)),
  route("GET",  "/auth/me",     async req => auth.me(req)),
  route("POST", "/auth/logout", async ()  => auth.logout()),

  // Budgets
  route("GET",    "/budgets",                          req => budgets.list(req as never),                 { protected: true }),
  route("POST",   "/budgets",                          req => budgets.create(req as never),               { protected: true }),
  route("POST",   "/budgets/:id/send",                 req => budgets.send(req   as never),               { protected: true }),
  route("DELETE", "/budgets/:id",                      req => budgets.delete(req as never),               { protected: true }),
  route("POST",   "/budgets/:id/signature/challenge",  req => budgets.requestChallenge(req as never),     { protected: true }),
  route("POST",   "/budgets/:id/signature",            req => budgets.sign(req   as never),               { protected: true }),

  // Users
  route("GET",    "/users",        req => users.list(req   as never), { protected: true }),
  route("POST",   "/users",        req => users.create(req as never), { protected: true }),
  route("PATCH",  "/users/:id",    req => users.update(req as never), { protected: true }),
  route("DELETE", "/users/:id",    req => users.delete(req as never), { protected: true }),

  // Projects
  route("GET",    "/projects",          req => projects.list(req   as never), { protected: true }),
  route("POST",   "/projects",          req => projects.create(req as never), { protected: true }),
  route("PATCH",  "/projects/:id",      req => projects.update(req as never), { protected: true }),
  route("DELETE", "/projects/:id",      req => projects.delete(req as never), { protected: true }),

  // Audit
  route("GET", "/audit", req => audit.query(req as never), { protected: true }),

  // Solicitudes (POST is public)
  route("POST", "/solicitudes", req => solicitudes.submit(req as never)),

  // Files
  route("GET",    "/projects/:projectId/files", req => files.list(req   as never), { protected: true }),
  route("POST",   "/projects/:projectId/files", req => files.upload(req as never), { protected: true }),
  route("DELETE", "/files/:id",                 req => files.delete(req as never), { protected: true }),
];

// ── HTTP server ────────────────────────────────────────────────
const server = http.createServer(async (req, res) => {
  try {
    // CORS — permissive for demo. Lock to your frontend origin in production.
    res.setHeader("Access-Control-Allow-Origin",  "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
    if (req.method === "OPTIONS") { res.writeHead(204).end(); return; }

    const url = new URL(req.url ?? "/", `http://${req.headers.host}`);
    const match = ROUTES.find(r => r.method === req.method && r.pattern.test(url.pathname));

    if (!match) { res.writeHead(404).end(JSON.stringify({ code: "NOT_FOUND", message: "Ruta no encontrada" })); return; }

    // Parse path params
    const m = url.pathname.match(match.pattern)!;
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
    res.writeHead(result.status, { "Content-Type": "application/json" }).end(
      result.body === null ? "" : JSON.stringify(result.body)
    );
  } catch (err) {
    const { status, body } = toHttpError(err);
    res.writeHead(status, { "Content-Type": "application/json" }).end(JSON.stringify(body));
  }
});

server.listen(PORT, () => {
  console.log(`[api] listening on http://localhost:${PORT}`);
});

// ── Helpers ────────────────────────────────────────────────────
function parseJsonBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    if (req.method === "GET" || req.method === "DELETE") { resolve({}); return; }
    let raw = "";
    req.on("data", (chunk: Buffer) => { raw += chunk.toString(); if (raw.length > 1_000_000) req.destroy(); });
    req.on("end",   () => { try { resolve(raw ? JSON.parse(raw) : {}); } catch { reject(new Error("Invalid JSON")); } });
    req.on("error", reject);
  });
}

function getClientIP(req: IncomingMessage): string {
  // Behind a reverse proxy use X-Forwarded-For; otherwise use the socket
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string") return forwarded.split(",")[0]!.trim();
  return req.socket.remoteAddress ?? "unknown";
}
