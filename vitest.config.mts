import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["packages/*/test/**/*.test.ts"],
    environment: "node",
    // Integration tests share one database; run files one at a time.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
    env: {
      APP_ENV: "test",
      DATABASE_URL: process.env.TEST_DATABASE_URL ?? "postgres://hks_app:hks_app_dev@localhost:5432/hks_test",
      DATABASE_MIGRATION_URL:
        process.env.TEST_DATABASE_MIGRATION_URL ?? "postgres://hks_owner:hks_owner_dev@localhost:5432/hks_test",
      REDIS_URL: process.env.TEST_REDIS_URL ?? "redis://localhost:6380/1",
    },
  },
});
