import "server-only";

export type RateLimitResult = { allowed: boolean; retryAfterSeconds: number };

/** A limiter that can be backed by memory (one process) or Redis (shared). */
export interface RateLimiter {
  hit(key: string): Promise<RateLimitResult>;
}

/**
 * Sliding-window limiter held in process memory. Correct for a single
 * instance only; multi-instance deployments must use the Redis limiter.
 * Memory is bounded: when the table is full, the oldest keys are evicted
 * instead of the table being cleared (clearing would reset every limit).
 */
export class MemoryRateLimiter implements RateLimiter {
  private readonly hits = new Map<string, number[]>();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
    private readonly maxKeys = 10_000,
  ) {}

  async hit(key: string): Promise<RateLimitResult> {
    const now = Date.now();
    const recent = (this.hits.get(key) ?? []).filter((time) => now - time < this.windowMs);
    this.hits.delete(key); // re-insert below so Map order tracks recency

    if (recent.length >= this.limit) {
      this.hits.set(key, recent);
      const oldest = recent[0] ?? now;
      return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((oldest + this.windowMs - now) / 1000)) };
    }

    recent.push(now);
    this.hits.set(key, recent);
    while (this.hits.size > this.maxKeys) {
      const oldestKey = this.hits.keys().next().value;
      if (oldestKey === undefined) break;
      this.hits.delete(oldestKey);
    }
    return { allowed: true, retryAfterSeconds: 0 };
  }
}
