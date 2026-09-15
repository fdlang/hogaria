import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@":                   path.resolve(__dirname, "./src"),
      "@reformapro/domain":  path.resolve(__dirname, "../../packages/domain/src"),
    },
  },
  server: {
    proxy: { "/api": "http://localhost:3001" },
  },
});
