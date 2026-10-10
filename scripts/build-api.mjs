import { build } from "esbuild";

if (process.env.VERCEL_ENV === "production") {
  const { runProductionPreflight } = await import("../apps/api/scripts/preflight-production.mjs");
  const validation = await runProductionPreflight(process.env);
  validation.warnings.forEach((warning) => console.warn(`[production config warning] ${warning}`));
  if (validation.errors.length) {
    throw new Error(`Production configuration is incomplete:\n- ${validation.errors.join("\n- ")}`);
  }
}

await build({
  entryPoints: ["apps/api/src/main.ts"],
  outfile: "api/_app.cjs",
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node24",
  sourcemap: false,
  logLevel: "info",
});
