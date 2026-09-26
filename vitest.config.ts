import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    env: {
      DATABASE_URL:
        process.env.DATABASE_URL ??
        "postgresql://dogfood:dogfood@localhost:5432/dogfood_test",
    },
    testTimeout: 20_000,
    hookTimeout: 30_000,
    fileParallelism: false,
  },
});