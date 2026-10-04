import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";

import { prisma } from "../prisma";
import { consume, resetRateLimit, type RateLimitRule } from "./index";

const name = `it-${randomUUID()}`;
const rule = (key: string, limit = 3, windowSeconds = 60): RateLimitRule => ({
  name,
  key,
  limit,
  windowSeconds,
});

afterAll(async () => {
  await prisma.rateLimit.deleteMany({ where: { key: { startsWith: name } } });
  await prisma.$disconnect();
});

describe("rate limiter", () => {
  it("allows up to the limit then blocks with a Retry-After", async () => {
    const r = rule("a");
    const results = [];
    for (let i = 0; i < 5; i++) results.push(await consume(r));

    expect(results.map((x) => x.allowed)).toEqual([true, true, true, false, false]);
    expect(results[3].retryAfterSeconds).toBeGreaterThan(0);
    expect(results[3].retryAfterSeconds).toBeLessThanOrEqual(60);
  });

  it("counts concurrent requests accurately", async () => {
    const r = rule("b", 10);
    const results = await Promise.all(Array.from({ length: 25 }, () => consume(r)));

    expect(results.filter((x) => x.allowed)).toHaveLength(10);
  });

  it("keeps keys independent", async () => {
    expect((await consume(rule("c1", 1))).allowed).toBe(true);
    expect((await consume(rule("c1", 1))).allowed).toBe(false);
    expect((await consume(rule("c2", 1))).allowed).toBe(true);
  });

  it("starts a fresh window once the old one expires", async () => {
    const r = rule("d", 1, 1);
    expect((await consume(r)).allowed).toBe(true);
    expect((await consume(r)).allowed).toBe(false);

    await new Promise((resolve) => setTimeout(resolve, 1500));
    expect((await consume(r)).allowed).toBe(true);
  });

  it("can be reset", async () => {
    const r = rule("e", 1);
    await consume(r);
    expect((await consume(r)).allowed).toBe(false);

    await resetRateLimit(r);
    expect((await consume(r)).allowed).toBe(true);
  });
});
