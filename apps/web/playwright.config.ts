import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/*.browser.ts",
  workers: 1,
  use: {
    baseURL: "http://127.0.0.1:4179",
    headless: true,
  },
  projects: [
    {
      name: "chromium",
      use: {
        browserName: "chromium",
        channel: process.platform === "win32" ? "chrome" : undefined,
      },
    },
    { name: "webkit", use: { browserName: "webkit" } },
  ],
  webServer: {
    command: "npm run preview -- --host 127.0.0.1 --port 4179 --strictPort",
    url: "http://127.0.0.1:4179",
    reuseExistingServer: false,
  },
});
