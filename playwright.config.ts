import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "tests/browser",
  workers: 1,
  timeout: 45000,
  expect: { timeout: 8000 },
  reporter: [
    ["list"],
    ["json", { outputFile: "evidence/release/browser-results.json" }],
  ],
  use: {
    baseURL: "http://localhost:3100",
    launchOptions: {
      executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
      args: ["--no-sandbox"],
    },
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: "npx tsx tests/prepare-e2e.ts && npm start",
    url: "http://localhost:3100/api/health",
    reuseExistingServer: false,
    env: {
      DATABASE_PATH: "./data/e2e.db",
      PORT: "3100",
      BASE_URL: "http://localhost:3100",
    },
    timeout: 30000,
  },
});
