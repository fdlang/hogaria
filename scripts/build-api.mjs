import { build } from "esbuild";

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
