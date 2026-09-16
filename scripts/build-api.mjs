import { build } from "esbuild";

await build({
  entryPoints: ["apps/api/src/main.ts"],
  outfile: "api/_app.mjs",
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node24",
  // pg and bcryptjs are CommonJS packages. Keep them external so Node loads
  // them natively instead of esbuild emulating `require()` inside ESM.
  external: ["pg", "bcryptjs"],
  sourcemap: false,
  logLevel: "info",
});
