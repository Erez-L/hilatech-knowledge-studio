import { z } from "zod";
import { AppError } from "./errors.ts";

const bool = z
  .enum(["true", "false", "1", "0"])
  .default("false")
  .transform((value) => value === "true" || value === "1");
const int = (fallback: number, min = 0) => z.coerce.number().int().min(min).default(fallback);

const schema = z.object({
  APP_ENV: z.enum(["development", "test", "demo", "production"]).default("development"),
  DATABASE_URL: z.string().min(1).optional(),
  DATABASE_MIGRATION_URL: z.string().min(1).optional(),
  REDIS_URL: z.string().min(1).optional(),
  TRUSTED_PROXY_HOPS: int(0),

  STORAGE_DRIVER: z.enum(["local", "s3"]).default("local"),
  STORAGE_LOCAL_DIR: z.string().default(".data/storage"),
  S3_BUCKET: z.string().optional(),
  S3_REGION: z.string().optional(),
  S3_ENDPOINT: z.string().optional(),
  S3_FORCE_PATH_STYLE: bool,

  // "none" means the feature is not configured: the app says so; it never fakes output.
  LLM_PROVIDER: z.enum(["anthropic", "bedrock", "deterministic", "none"]).default("none"),
  LLM_MODEL_ID: z.string().optional(),
  LLM_MAX_OUTPUT_TOKENS: int(1024, 64),
  LLM_TIMEOUT_MS: int(60_000, 1000),
  ANTHROPIC_API_KEY: z.string().optional(),
  AWS_REGION: z.string().optional(),
  BEDROCK_REGION: z.string().optional(),

  EMBEDDINGS_PROVIDER: z.enum(["bedrock-cohere", "deterministic", "none"]).default("none"),
  EMBEDDINGS_MODEL_ID: z.string().optional(),
  EMBEDDINGS_DIMENSIONS: int(1024, 1),
  EMBEDDINGS_BATCH_SIZE: int(64, 1).pipe(z.number().max(96)),

  /** Must be true before a deterministic test double may be selected outside tests. */
  SAMPLE_MODE: bool,

  CHUNK_TARGET_CHARS: int(1200, 200),
  CHUNK_MAX_CHARS: int(1800, 300),
  CHUNK_OVERLAP_CHARS: int(200, 0),
  RAG_TOP_K: int(12, 1),
  RAG_MAX_CONTEXT_CHUNKS: int(6, 1),
  // Placeholders until calibrated against the real embedding model.
  RAG_MIN_SIMILARITY: z.coerce.number().min(-1).max(1).default(0.3),
  RAG_EVIDENCE_MIN_SIMILARITY: z.coerce.number().min(-1).max(1).default(0.4),

  UPLOAD_MAX_BYTES: int(20 * 1024 * 1024, 1024),
  UPLOAD_MAX_PAGES: int(300, 1),
  LIMIT_QUESTIONS_PER_MINUTE: int(10, 1),
  LIMIT_QUESTIONS_PER_DAY: int(200, 1),
  LIMIT_UPLOADS_PER_DAY: int(50, 1),
  BUDGET_DAILY_INPUT_TOKENS: int(2_000_000, 1),
  BUDGET_DAILY_OUTPUT_TOKENS: int(200_000, 1),

  APP_BASE_URL: z.string().url().default("http://localhost:3000"),
  AUTH_SECRET: z.string().optional(),
  AUTH_SIGNUP_ENABLED: z.enum(["true", "false"]).default("true").transform((v) => v === "true"),
  AUTH_REQUIRE_EMAIL_VERIFICATION: z.enum(["true", "false"]).default("true").transform((v) => v === "true"),
  AUTH_SESSION_DAYS: int(7, 1),

  // "file" appends messages to a local outbox for development and tests. It never sends anything.
  MAIL_TRANSPORT: z.enum(["file", "smtp", "none"]).default("none"),
  MAIL_FROM: z.string().default("HilaTech Knowledge Studio <no-reply@localhost>"),
  MAIL_OUTBOX_FILE: z.string().default(".data/mail/outbox.jsonl"),
  SMTP_URL: z.string().optional(),

  LIMIT_AUTH_ATTEMPTS_PER_MINUTE: int(10, 1),

  // Public demo: no sign-in, read-only, tightly limited.
  DEMO_ENABLED: z.enum(["true", "false"]).default("true").transform((v) => v === "true"),
  LIMIT_DEMO_QUESTIONS_PER_MINUTE: int(4, 1),
  LIMIT_DEMO_QUESTIONS_PER_SESSION: int(15, 1),
  LIMIT_DEMO_QUESTIONS_PER_DAY: int(300, 1),
  LIMIT_UPLOADS_PER_MINUTE: int(10, 1),
  LEADS_STORE: z.enum(["file", "postgres", "none"]).optional(),
});

export type Config = Readonly<z.output<typeof schema>> & {
  /** "live" only when BOTH chat and embeddings use real providers. */
  readonly pipelineMode: "live" | "sample" | "unconfigured";
};

export function parseConfig(env: Record<string, string | undefined>): Config {
  const result = schema.safeParse(env);
  if (!result.success) {
    // Name the variables, never print their values.
    const names = [...new Set(result.error.issues.map((issue) => issue.path.join(".")))].join(", ");
    throw new AppError("not_configured", `Invalid configuration: ${names}`);
  }
  const c = result.data;
  const problems: string[] = [];

  const usesDouble = c.LLM_PROVIDER === "deterministic" || c.EMBEDDINGS_PROVIDER === "deterministic";
  if (usesDouble && c.APP_ENV === "production") {
    problems.push("deterministic providers are test doubles and cannot run in production");
  }
  if (usesDouble && c.APP_ENV !== "test" && !c.SAMPLE_MODE) {
    problems.push("deterministic providers require SAMPLE_MODE=true");
  }
  if (c.LLM_PROVIDER === "anthropic" && !c.ANTHROPIC_API_KEY) problems.push("ANTHROPIC_API_KEY is required");
  if ((c.LLM_PROVIDER === "anthropic" || c.LLM_PROVIDER === "bedrock") && !c.LLM_MODEL_ID) {
    problems.push("LLM_MODEL_ID is required");
  }
  if (c.EMBEDDINGS_PROVIDER === "bedrock-cohere" && !c.EMBEDDINGS_MODEL_ID) {
    problems.push("EMBEDDINGS_MODEL_ID is required");
  }
  const needsBedrock = c.LLM_PROVIDER === "bedrock" || c.EMBEDDINGS_PROVIDER === "bedrock-cohere";
  if (needsBedrock && !(c.BEDROCK_REGION ?? c.AWS_REGION)) problems.push("AWS_REGION or BEDROCK_REGION is required");
  if (c.STORAGE_DRIVER === "s3" && !c.S3_BUCKET) problems.push("S3_BUCKET is required");
  if (c.MAIL_TRANSPORT === "smtp" && !c.SMTP_URL) problems.push("SMTP_URL is required");
  if (c.MAIL_TRANSPORT === "file" && c.APP_ENV === "production") {
    problems.push("MAIL_TRANSPORT=file is a development outbox and cannot be used in production");
  }
  if (c.AUTH_SECRET !== undefined && c.AUTH_SECRET.length < 32) problems.push("AUTH_SECRET must be at least 32 characters");
  if (c.CHUNK_MAX_CHARS < c.CHUNK_TARGET_CHARS) problems.push("CHUNK_MAX_CHARS must be >= CHUNK_TARGET_CHARS");
  if (problems.length) throw new AppError("not_configured", problems.join("; "));

  const live = (c.LLM_PROVIDER === "anthropic" || c.LLM_PROVIDER === "bedrock") && c.EMBEDDINGS_PROVIDER === "bedrock-cohere";
  const unconfigured = c.LLM_PROVIDER === "none" || c.EMBEDDINGS_PROVIDER === "none";
  return Object.freeze({ ...c, pipelineMode: live ? "live" : unconfigured ? "unconfigured" : "sample" });
}

let cached: Config | undefined;
/** Loaded once per process. */
export function getConfig(): Config {
  cached ??= parseConfig(process.env);
  return cached;
}
export function resetConfigForTests() {
  cached = undefined;
}
