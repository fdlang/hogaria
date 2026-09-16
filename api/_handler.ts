import type { IncomingMessage, ServerResponse } from "node:http";

type ApiModule = {
  apiHandler: (req: IncomingMessage, res: ServerResponse) => Promise<void>;
};

// Vercel's CJS function bundler rewrites a static `import()` into `require()`.
// Constructing the import at runtime preserves native ESM loading for the API.
const importEsm = new Function("specifier", "return import(specifier)") as (specifier: string) => Promise<ApiModule>;

/**
 * Loads the application lazily so configuration failures are logged and
 * returned as JSON rather than becoming an opaque Vercel invocation failure.
 */
export async function runApi(req: IncomingMessage, res: ServerResponse): Promise<void> {
  try {
    const root = process.cwd().replace(/\\/g, "/");
    const specifier = new URL(`file://${root}/api/_app.mjs`).href;
    const { apiHandler } = await importEsm(specifier);
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
