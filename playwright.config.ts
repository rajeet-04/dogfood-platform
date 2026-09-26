import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "tests/acceptance",
  fullyParallel: true,
  forbidOnly: true,
  retries: 0,
  reporter: "list",
  use: {
    baseURL: process.env.APP_URL ?? "http://localhost:3000",
    trace: "on-first-retry",
  },
});