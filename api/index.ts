import type { IncomingMessage, ServerResponse } from "node:http";
import { runApi } from "./_handler.js";

/**
 * Vercel serverless entrypoint.
 *
 * The HTTP application remains in apps/api; this file is only the platform
 * adapter. It deliberately does not create a listener.
 */
export default function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  return runApi(req, res);
}
