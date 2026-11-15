import { defineConfig } from "vitest/config";

// Run through scripts/http-tests.sh, which starts the server and sets the environment.
export default defineConfig({
  test: {
    include: ["apps/web/test/http/**/*.test.ts"],
    environment: "node",
    fileParallelism: false,
    testTimeout: 45_000,
    hookTimeout: 60_000,
  },
});
