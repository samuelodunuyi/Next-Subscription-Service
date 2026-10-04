import { describe, expect, it } from "vitest";

import { allowedOriginsFromEnv, isCrossSiteWrite } from "./origin";

const base = {
  method: "POST",
  pathname: "/api/subscriptions",
  origin: null as string | null,
  secFetchSite: null as string | null,
  host: "app.example.com",
  allowedOrigins: [] as string[],
};

describe("isCrossSiteWrite", () => {
  it("allows same-origin writes", () => {
    expect(isCrossSiteWrite({ ...base, origin: "https://app.example.com" })).toBe(false);
  });

  it("blocks a write from another origin", () => {
    expect(isCrossSiteWrite({ ...base, origin: "https://evil.example" })).toBe(true);
  });

  it("blocks opaque and malformed origins", () => {
    expect(isCrossSiteWrite({ ...base, origin: "null" })).toBe(true);
  });

  it("allows explicitly allowed origins", () => {
    expect(
      isCrossSiteWrite({
        ...base,
        origin: "https://web.example.com",
        allowedOrigins: ["https://web.example.com"],
      }),
    ).toBe(false);
  });

  it("falls back to Sec-Fetch-Site when Origin is absent", () => {
    expect(isCrossSiteWrite({ ...base, secFetchSite: "cross-site" })).toBe(true);
    expect(isCrossSiteWrite({ ...base, secFetchSite: "same-origin" })).toBe(false);
    expect(isCrossSiteWrite(base)).toBe(false);
  });

  it("never blocks reads or the signed webhook", () => {
    expect(isCrossSiteWrite({ ...base, method: "GET", origin: "https://evil.example" })).toBe(
      false,
    );
    expect(
      isCrossSiteWrite({
        ...base,
        pathname: "/api/webhooks/payments",
        origin: "https://provider.example",
      }),
    ).toBe(false);
  });
});

describe("allowedOriginsFromEnv", () => {
  it("parses a comma separated list", () => {
    expect(
      allowedOriginsFromEnv({ ALLOWED_ORIGINS: " https://a.com, https://b.com " } as never),
    ).toEqual(["https://a.com", "https://b.com"]);
    expect(allowedOriginsFromEnv({} as never)).toEqual([]);
  });
});
