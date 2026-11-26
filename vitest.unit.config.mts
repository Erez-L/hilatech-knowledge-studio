import { defineConfig } from "vitest/config";

/**
 * The tests that need no PostgreSQL and no Redis (`pnpm test:unit`). This is what CI runs.
 * A test file that needs one of those services must be added to `exclude` here; it still runs
 * with `pnpm test`, which uses vitest.config.mts and the local test services.
 */
export default defineConfig({
  test: {
    include: ["packages/*/test/**/*.test.ts", "apps/*/test/unit/**/*.test.ts", "infrastructure/**/*.test.ts"],
    exclude: [
      "**/node_modules/**",
      "packages/core/test/pipeline.test.ts",
      "packages/core/test/registration.test.ts",
      "packages/database/test/**",
    ],
    environment: "node",
    testTimeout: 30_000,
    // No connection strings here on purpose: a test that reaches for a database fails at once.
    env: { APP_ENV: "test" },
  },
});
