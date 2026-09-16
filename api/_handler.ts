import type { IncomingMessage, ServerResponse } from "node:http";

/**
 * Loads the application lazily so configuration failures are logged and
 * returned as JSON rather than becoming an opaque Vercel invocation failure.
 */
export async function runApi(req: IncomingMessage, res: ServerResponse): Promise<void> {
  try {
    const { apiHandler } = await import("../apps/api/src/main.js");
    await apiHandler(req, res);
  } catch (error) {
    console.error("[api bootstrap failed]", error);
    if (!res.headersSent) {
      res.writeHead(500, { "Content-Type": "application/json" }).end(JSON.stringify({
        code: "API_STARTUP_FAILED",
        message: "El área privada no está disponible temporalmente. Inténtalo de nuevo en unos minutos.",
      }));
    }
  }
}
