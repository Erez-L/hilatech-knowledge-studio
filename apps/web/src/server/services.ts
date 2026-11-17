import "server-only";
import { createChatModel, createEmbeddingsProvider } from "@hks/ai";
import {
  BullJobQueue,
  createMailer,
  createRedis,
  createStorage,
  PendingRegistrations,
  RedisRateLimiter,
  type Mailer,
  type RateLimiter,
  type Services,
} from "@hks/core";
import { createDatabase, type Database } from "@hks/database";
import { AppError, getConfig, type Config } from "@hks/shared";

export type ServerServices = Services & {
  database: Database;
  limiter: RateLimiter;
  mailer: Mailer | null;
  /** Sign-ups waiting for their email address to be confirmed. Redis only; see @hks/core registration. */
  pendingRegistrations: PendingRegistrations;
};

// One set of connections per server process (and per dev-server reload).
const holder = globalThis as unknown as { __hksServices?: ServerServices };

/**
 * The backend the web app talks to. Throws `not_configured` when the database
 * or Redis is missing, so callers answer 503 instead of pretending to work.
 */
export function getServices(): ServerServices {
  if (holder.__hksServices) return holder.__hksServices;
  const config: Config = getConfig();
  if (!config.DATABASE_URL) throw new AppError("not_configured", "DATABASE_URL is not set");
  if (!config.REDIS_URL) throw new AppError("not_configured", "REDIS_URL is not set");
  const database = createDatabase(config.DATABASE_URL, { max: 10 });
  const redis = createRedis(config.REDIS_URL);
  redis.on("error", () => {}); // connection errors surface on use
  holder.__hksServices = {
    config,
    database,
    db: database.db,
    storage: createStorage(config),
    queue: new BullJobQueue(config.REDIS_URL),
    embeddings: createEmbeddingsProvider(config),
    chat: createChatModel(config),
    limiter: new RedisRateLimiter(redis),
    mailer: createMailer(config),
    pendingRegistrations: new PendingRegistrations(redis),
  };
  return holder.__hksServices;
}

/** True when the backend is configured at all (used to choose between app and sample preview). */
export function backendConfigured(): boolean {
  try {
    const config = getConfig();
    return Boolean(config.DATABASE_URL && config.REDIS_URL && config.AUTH_SECRET);
  } catch {
    return false;
  }
}
