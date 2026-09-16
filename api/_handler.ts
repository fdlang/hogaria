import type { IncomingMessage, ServerResponse } from "node:http";

type ApiModule = {
  apiHandler: (req: IncomingMessage, res: ServerResponse) => Promise<void>;
};

// Vercel's function bundler rewrites a static `import()` into `require()`.
// Constructing it at runtime preserves Node's native module loader for the
// self-contained CommonJS application bundle.
const importApplication = new Function("specifier", "return import(specifier)") as (specifier: string) => Promise<ApiModule>;

/**
 * Loads the application lazily so configuration failures are logged and
 * returned as JSON rather than becoming an opaque Vercel invocation failure.
 */
export async function runApi(req: IncomingMessage, res: ServerResponse): Promise<void> {
  try {
    const root = process.cwd().replace(/\\/g, "/");
    const specifier = new URL(`file://${root}/api/_app.cjs`).href;
    const { apiHandler } = await importApplication(specifier);
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
