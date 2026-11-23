import { defineConfig, devices } from "@playwright/test";

const port = Number(process.env.PLAYWRIGHT_PORT || 4173);
const baseURL = `http://localhost:${port}`;

export default defineConfig({
  testDir: "tests",
  testMatch: "**/*.spec.ts",
  fullyParallel: true,
  workers: 2,
  reporter: "line",
  use: {
    ...devices["Desktop Chrome"],
    channel: process.env.PLAYWRIGHT_CHANNEL || undefined,
    baseURL,
    trace: "retain-on-failure",
  },
  webServer: {
    command: `npm run preview -- --host localhost --port ${port} --strictPort`,
    url: baseURL,
    timeout: 30_000,
    reuseExistingServer: false,
  },
});
