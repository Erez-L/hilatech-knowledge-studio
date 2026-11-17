import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Redis } from "ioredis";
import { createRedis, PendingRegistrations, type PendingRegistration } from "../src/index.ts";

let redis: Redis;
const prefix = `hks-test:signup:${randomUUID()}`;
const sample = (email: string): PendingRegistration => ({ email, name: "Dana Levi", passwordHash: "salt:hash", locale: "he" });
const keys = () => redis.keys(`${prefix}:*`);

beforeAll(() => {
  redis = createRedis(process.env.REDIS_URL!);
});
afterAll(async () => {
  const left = await keys();
  if (left.length) await redis.del(...left);
  await redis.quit();
});

describe("pending registrations", () => {
  it("returns a registration once for its token, then never again", async () => {
    const store = new PendingRegistrations(redis, prefix);
    const token = await store.put(sample("One@Example.test "));
    const taken = await store.take(token);
    expect(taken).toEqual({ email: "one@example.test", name: "Dana Levi", passwordHash: "salt:hash", locale: "he" });
    expect(await store.take(token)).toBeNull();
    expect(await keys()).toEqual([]);
  });

  it("does not store the token itself", async () => {
    const store = new PendingRegistrations(redis, prefix);
    const token = await store.put(sample("two@example.test"));
    const stored = await keys();
    expect(stored.some((key) => key.includes(token))).toBe(false);
    for (const key of stored) expect(await redis.get(key)).not.toContain(token);
    await store.take(token);
  });

  it("rejects unknown, empty and oversized tokens", async () => {
    const store = new PendingRegistrations(redis, prefix);
    expect(await store.take("not-a-token")).toBeNull();
    expect(await store.take("")).toBeNull();
    expect(await store.take("x".repeat(500))).toBeNull();
  });

  it("a second sign-up for the same address replaces the first link", async () => {
    const store = new PendingRegistrations(redis, prefix);
    const first = await store.put(sample("three@example.test"));
    const second = await store.put({ ...sample("THREE@example.test"), name: "Second" });
    expect(await store.take(first)).toBeNull();
    expect((await store.take(second))?.name).toBe("Second");
  });

  it("reissues a link for a pending address and invalidates the old one", async () => {
    const store = new PendingRegistrations(redis, prefix);
    const first = await store.put(sample("four@example.test"));
    const again = await store.reissue("Four@example.test");
    expect(again?.pending.email).toBe("four@example.test");
    expect(await store.take(first)).toBeNull();
    expect(await store.take(again!.token)).not.toBeNull();
    expect(await store.reissue("four@example.test")).toBeNull();
    expect(await store.reissue("nobody@example.test")).toBeNull();
  });

  it("expires on its own", async () => {
    const store = new PendingRegistrations(redis, prefix, 1);
    const token = await store.put(sample("five@example.test"));
    await new Promise((resolve) => setTimeout(resolve, 1300));
    expect(await store.take(token)).toBeNull();
    expect(await keys()).toEqual([]);
  });
});
