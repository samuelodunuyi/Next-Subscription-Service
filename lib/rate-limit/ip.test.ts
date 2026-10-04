import { describe, expect, it } from "vitest";

import { getClientIp, trustedProxyHopsFromEnv } from "./ip";

const headers = (xff?: string) => new Headers(xff ? { "x-forwarded-for": xff } : {});

describe("getClientIp", () => {
  it("ignores X-Forwarded-For when no proxy is trusted", () => {
    expect(getClientIp(headers("6.6.6.6"), 0)).toBe("unknown");
  });

  it("takes the entry our proxy appended, not the spoofable leftmost one", () => {
    expect(getClientIp(headers("6.6.6.6, 203.0.113.9"), 1)).toBe("203.0.113.9");
  });

  it("counts hops from the right with multiple proxies", () => {
    expect(getClientIp(headers("6.6.6.6, 203.0.113.9, 10.0.0.2"), 2)).toBe("203.0.113.9");
  });

  it("falls back when the header is missing or shorter than the hop count", () => {
    expect(getClientIp(headers(), 1)).toBe("unknown");
    expect(getClientIp(headers("203.0.113.9"), 2)).toBe("unknown");
  });
});

describe("trustedProxyHopsFromEnv", () => {
  it("parses valid values and rejects junk", () => {
    expect(trustedProxyHopsFromEnv({ TRUSTED_PROXY_HOPS: "2" } as never)).toBe(2);
    expect(trustedProxyHopsFromEnv({} as never)).toBe(0);
    expect(trustedProxyHopsFromEnv({ TRUSTED_PROXY_HOPS: "-1" } as never)).toBe(0);
    expect(trustedProxyHopsFromEnv({ TRUSTED_PROXY_HOPS: "abc" } as never)).toBe(0);
  });
});
