import { defineConfig } from "@playwright/test";

const TEST_DATABASE_URL =
  process.env.DATABASE_URL ??
  "postgresql://dogfood:dogfood@localhost:5432/dogfood_test";

process.env.DATABASE_URL ??= TEST_DATABASE_URL;
process.env.APP_URL ??= "http://localhost:3000";

export default defineConfig({
  testDir: "tests/acceptance",
  fullyParallel: false,
  workers: 1,
  forbidOnly: true,
  retries: 0,
  reporter: "list",
  use: {
    baseURL: process.env.APP_URL ?? "http://localhost:3000",
    trace: "on-first-retry",
  },
  webServer: {
    command: "pnpm dev",
    port: 3000,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      ...process.env,
      DATABASE_URL: TEST_DATABASE_URL,
      PORT: "3000",
      APP_URL: process.env.APP_URL ?? "http://localhost:3000",
    },
  },
});