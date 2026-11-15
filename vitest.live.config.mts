import { defineConfig } from "vitest/config";

/**
 * Real-provider ("live") integration tests. NOT part of `pnpm test`.
 *
 * Run with `pnpm test:live`. Every file skips itself unless its own switch is
 * set (LIVE_ANTHROPIC_CHAT, LIVE_BEDROCK_CHAT, LIVE_BEDROCK_EMBEDDINGS,
 * LIVE_S3, LIVE_PIPELINE, LIVE_EVALUATION). These tests call paid services.
 * Procedure: docs/REAL_PROVIDER_VERIFICATION.md.
 *
 * Unlike vitest.config.mts, no connection defaults are injected here: the
 * pipeline and evaluation tests use DATABASE_URL, DATABASE_MIGRATION_URL and
 * REDIS_URL exactly as set by the person running them.
 */
export default defineConfig({
  test: {
    include: ["tests/live/**/*.live.test.ts"],
    environment: "node",
    // One file at a time: the files share provider quotas and, for two of them, one database.
    fileParallelism: false,
    // Never repeat a paid call automatically.
    retry: 0,
    testTimeout: 120_000,
    hookTimeout: 300_000,
    // Show each suite and test by name, including the reason a file was skipped.
    reporters: ["verbose"],
  },
});
