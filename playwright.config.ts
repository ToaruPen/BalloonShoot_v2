import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  use: {
    baseURL: "http://127.0.0.1:5173"
  },
  webServer: {
    command: "npm run dev -- --host 127.0.0.1 --port 5173",
    port: 5173,
    reuseExistingServer: typeof process.env["CI"] === "undefined"
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }]
});
