import { Redis } from "ioredis";
import { redisConnection } from "./queue.ts";

export type RateLimitResult = { allowed: boolean; remaining: number; retryAfterSeconds: number };

export interface RateLimiter {
  /** Counts one attempt for `key` under the named rule. */
  hit(rule: string, key: string, limit: number, windowSeconds: number): Promise<RateLimitResult>;
}

// Fixed window, atomic: increment, set the expiry on first hit, return count and TTL.
const SCRIPT = `
local count = redis.call('INCR', KEYS[1])
if count == 1 then redis.call('EXPIRE', KEYS[1], ARGV[1]) end
local ttl = redis.call('TTL', KEYS[1])
if ttl < 0 then redis.call('EXPIRE', KEYS[1], ARGV[1]); ttl = tonumber(ARGV[1]) end
return {count, ttl}
`;

/** Shared across every web instance and the worker. */
export class RedisRateLimiter implements RateLimiter {
  constructor(private readonly redis: Redis, private readonly prefix = "hks:rl") {}

  async hit(rule: string, key: string, limit: number, windowSeconds: number): Promise<RateLimitResult> {
    const [count, ttl] = (await this.redis.eval(SCRIPT, 1, `${this.prefix}:${rule}:${key}`, String(windowSeconds))) as [number, number];
    return { allowed: count <= limit, remaining: Math.max(0, limit - count), retryAfterSeconds: count <= limit ? 0 : Math.max(1, ttl) };
  }
}

export function createRedis(url: string): Redis {
  const options = redisConnection(url) as Record<string, unknown>;
  return new Redis({ ...options, maxRetriesPerRequest: 2 });
}
