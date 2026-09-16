import { build } from "esbuild";

await build({
  entryPoints: ["apps/api/src/main.ts"],
  outfile: "api/_app.mjs",
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node24",
  sourcemap: false,
  logLevel: "info",
});
