import type { IncomingMessage, ServerResponse } from "node:http";
import { apiHandler } from "../apps/api/src/main.js";

/** Catch-all Vercel Function for /api/* routes. */
export default function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  return apiHandler(req, res);
}
