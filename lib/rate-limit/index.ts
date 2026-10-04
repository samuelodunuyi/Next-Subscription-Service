import { createHash } from "node:crypto";
import type { NextResponse } from "next/server";
import { prisma } from "../prisma";
import { errorResponse } from "../http";
import { log } from "../log";
import { getClientIp, trustedProxyHopsFromEnv } from "./ip";

export type RateLimitRule = {
  name: string;

  key: string;
  limit: number;
  windowSeconds: number;
};

type RateLimitResult = {
  allowed: boolean;
  retryAfterSeconds: number;
};

export function clientIp(req: Request) {
  if (process.env.NODE_ENV === "production" && process.env.TRUSTED_PROXY_HOPS === undefined) {
    throw new Error(
      "TRUSTED_PROXY_HOPS must be set in production (number of reverse proxies in front of the app; 0 if none)",
    );
  }
  return getClientIp(req.headers, trustedProxyHopsFromEnv());
}

export function hashKeyPart(value: string) {
  return createHash("sha256").update(value).digest("hex").slice(0, 32);
}

export async function consume(rule: RateLimitRule): Promise<RateLimitResult> {
  const id = `${rule.name}:${rule.key}`;

  const rows = await prisma.$queryRaw<{ count: number; retryAfter: number }[]>`
    INSERT INTO "rate_limits" ("key", "count", "resetAt")
    VALUES (${id}, 1, (now() AT TIME ZONE 'UTC') + make_interval(secs => ${rule.windowSeconds}))
    ON CONFLICT ("key") DO UPDATE SET
      "count" = CASE WHEN "rate_limits"."resetAt" <= (now() AT TIME ZONE 'UTC')
                     THEN 1 ELSE "rate_limits"."count" + 1 END,
      "resetAt" = CASE WHEN "rate_limits"."resetAt" <= (now() AT TIME ZONE 'UTC')
                       THEN (now() AT TIME ZONE 'UTC') + make_interval(secs => ${rule.windowSeconds})
                       ELSE "rate_limits"."resetAt" END
    RETURNING "count",
      CEIL(EXTRACT(EPOCH FROM ("resetAt" - (now() AT TIME ZONE 'UTC'))))::int AS "retryAfter"`;

  const { count, retryAfter } = rows[0];

  if (Math.random() < 0.01) {
    void prisma.$executeRaw`
      DELETE FROM "rate_limits" WHERE "resetAt" < (now() AT TIME ZONE 'UTC')`.catch(() => {});
  }

  return { allowed: count <= rule.limit, retryAfterSeconds: Math.max(retryAfter, 1) };
}

export async function resetRateLimit(rule: Pick<RateLimitRule, "name" | "key">) {
  await prisma.rateLimit.deleteMany({ where: { key: `${rule.name}:${rule.key}` } });
}

export async function enforceRateLimit(rules: RateLimitRule[]): Promise<NextResponse | null> {
  const results = await Promise.all(rules.map(consume));
  const exceeded = results.filter((result) => !result.allowed);

  if (exceeded.length === 0) {
    return null;
  }

  log.warn("security.rate_limited", {
    rules: rules.filter((_, index) => !results[index].allowed).map((rule) => rule.name),
  });

  const retryAfter = Math.max(...exceeded.map((result) => result.retryAfterSeconds));
  const response = errorResponse(429, "Too many requests, please try again later");
  response.headers.set("Retry-After", String(retryAfter));
  return response;
}

export const limits = {
  loginByIp: (ip: string): RateLimitRule => ({
    name: "login:ip",
    key: ip,
    limit: 30,
    windowSeconds: 15 * 60,
  }),
  loginByIpAndEmail: (ip: string, email: string): RateLimitRule => ({
    name: "login:ip-email",
    key: `${ip}:${hashKeyPart(email)}`,
    limit: 5,
    windowSeconds: 15 * 60,
  }),
  registerByIp: (ip: string): RateLimitRule => ({
    name: "register:ip",
    key: ip,
    limit: 10,
    windowSeconds: 60 * 60,
  }),
  passwordChangeByUser: (userId: string): RateLimitRule => ({
    name: "password:user",
    key: userId,
    limit: 5,
    windowSeconds: 15 * 60,
  }),

  readByIp: (ip: string): RateLimitRule => ({
    name: "read:ip",
    key: ip,
    limit: 300,
    windowSeconds: 60,
  }),
  readByUser: (userId: string): RateLimitRule => ({
    name: "read:user",
    key: userId,
    limit: 300,
    windowSeconds: 60,
  }),
  webhookByIp: (ip: string): RateLimitRule => ({
    name: "webhook:ip",
    key: ip,
    limit: 600,
    windowSeconds: 60,
  }),
  mutationByUser: (userId: string): RateLimitRule => ({
    name: "mutation:user",
    key: userId,
    limit: 20,
    windowSeconds: 60,
  }),
};
