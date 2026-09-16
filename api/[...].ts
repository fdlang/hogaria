import type { IncomingMessage, ServerResponse } from "node:http";
import { runApi } from "./_handler.js";

/**
 * Vercel splat Function for every /api/* route.
 *
 * Vercel's Node file-system router uses `[...].ts` for a catch-all function
 * and exposes the captured suffix in `req.query.path` after the rewrite.
 */
export default function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const vercelRequest = req as IncomingMessage & { query?: Record<string, string | string[] | undefined> };
  const path = vercelRequest.query?.path;

  if (typeof path === "string" && path) {
    const url = new URL(req.url ?? "/", "http://localhost");
    url.pathname = `/api/${path.replace(/^\/+/, "")}`;
    req.url = `${url.pathname}${url.search}`;
  }

  return runApi(req, res);
}
