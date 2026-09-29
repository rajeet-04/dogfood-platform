import { defineConfig } from "@playwright/test";

const appUrl = process.env.APP_URL ?? "http://localhost:3001";
// The app itself runs from the production container started by run-lifecycle.sh.
if (!process.env.DATABASE_URL) {
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
    viewport: { width: 1280, height: 800 },
    video: { mode: "on", size: { width: 1280, height: 800 } },
    trace: "off",
  },
});
