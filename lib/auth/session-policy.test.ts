import { describe, expect, it } from "vitest";

import { sessionValidity } from "./session-policy";

const now = new Date("2026-06-01T00:00:00.000Z");
const daysAgo = (days: number) => new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
const daysAhead = (days: number) => new Date(now.getTime() + days * 24 * 60 * 60 * 1000);

describe("sessionValidity", () => {
  it("accepts a recently used, unexpired session", () => {
    expect(sessionValidity({ expiresAt: daysAhead(20), lastUsedAt: daysAgo(1) }, now)).toBe(
      "valid",
    );
  });

  it("rejects a session past its absolute expiry, however recently it was used", () => {
    expect(sessionValidity({ expiresAt: daysAgo(0.001), lastUsedAt: now }, now)).toBe("expired");
  });

  it("rejects a session idle for more than 14 days even though it hasn't expired", () => {
    expect(sessionValidity({ expiresAt: daysAhead(10), lastUsedAt: daysAgo(15) }, now)).toBe(
      "idle",
    );
    expect(sessionValidity({ expiresAt: daysAhead(10), lastUsedAt: daysAgo(13) }, now)).toBe(
      "valid",
    );
  });
});
