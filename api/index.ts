import type { IncomingMessage, ServerResponse } from "node:http";
import { apiHandler } from "../apps/api/src/main.js";

/**
 * Vercel serverless entrypoint.
 *
 * The HTTP application remains in apps/api; this file is only the platform
 * adapter. It deliberately does not create a listener.
 */
export default function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  return apiHandler(req, res);
}
