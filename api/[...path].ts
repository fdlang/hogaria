import type { IncomingMessage, ServerResponse } from "node:http";
import { apiHandler } from "../apps/api/src/main.js";

/** Catch-all Vercel Function for /api/* routes. */
export default function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  // The Vercel rewrite resolves this catch-all file and exposes the matched
  // wildcard as `query.path`. Restore the original path for our framework-
  // agnostic HTTP router, which intentionally only reads `req.url`.
  const vercelRequest = req as IncomingMessage & { query?: Record<string, string | string[] | undefined> };
  const path = vercelRequest.query?.path;
  if (typeof path === "string" && path) {
    const url = new URL(req.url ?? "/", "http://localhost");
    url.pathname = `/api/${path.replace(/^\/+/, "")}`;
    req.url = `${url.pathname}${url.search}`;
  }
  return apiHandler(req, res);
}
