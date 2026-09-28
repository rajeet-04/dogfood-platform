import { defineConfig } from "@playwright/test";

const appUrl = process.env.APP_URL ?? "http://localhost:3001";
const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("Set DATABASE_URL through demo/run-lifecycle.sh");
}

export default defineConfig({
  testDir: ".",
  testMatch: "lifecycle.spec.ts",
  fullyParallel: false,
  workers: 1,
  forbidOnly: true,
  retries: 0,
  reporter: "list",
  outputDir: "artifacts/test-results",
  use: {
    baseURL: appUrl,
    viewport: { width: 1365, height: 900 },
    video: "on",
    trace: "off",
  },
  webServer: {
    command: "bun run --cwd apps/web dev",
    cwd: "..",
    port: 3001,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      ...process.env,
      DATABASE_URL: databaseUrl,
      APP_URL: appUrl,
      PORT: "3001",
      DOGFOOD_MODE: "local",
      DOGFOOD_SEED_FIXTURES: "0",
    },
  },
});
