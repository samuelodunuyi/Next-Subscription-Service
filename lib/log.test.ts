import { describe, expect, it } from "vitest";

import { formatLog, resolveRequestId } from "./log";

describe("formatLog", () => {
  it("emits one JSON line with level, event and fields", () => {
    const line = formatLog("warn", "billing.test", { paymentId: "p1" }, new Date(0));
    expect(JSON.parse(line)).toEqual({
      time: "1970-01-01T00:00:00.000Z",
      level: "warn",
      event: "billing.test",
      paymentId: "p1",
    });
  });

  it("redacts secrets, including nested ones", () => {
    const parsed = JSON.parse(
      formatLog("info", "x", {
        password: "hunter2",
        nested: { sessionToken: "abc", ok: 1 },
        headers: { cookie: "session=abc", "x-webhook-signature": "t=1,v1=00" },
      }),
    );
    expect(parsed.password).toBe("[redacted]");
    expect(parsed.nested).toEqual({ sessionToken: "[redacted]", ok: 1 });
    expect(parsed.headers).toEqual({ cookie: "[redacted]", "x-webhook-signature": "[redacted]" });
  });

  it("serialises errors with their stack", () => {
    const parsed = JSON.parse(formatLog("error", "x", { error: new Error("boom") }));
    expect(parsed.error.message).toBe("boom");
    expect(parsed.error.stack).toContain("boom");
  });
});

describe("resolveRequestId", () => {
  it("keeps a well-formed inbound id", () => {
    expect(resolveRequestId("req_1234-abcd")).toBe("req_1234-abcd");
  });

  it("replaces missing, short, long or unsafe ids (log injection)", () => {
    for (const bad of [
      null,
      "",
      "abc",
      "x".repeat(65),
      "line\nbreak-injection",
      "a b c d e f g h",
    ]) {
      const id = resolveRequestId(bad);
      expect(id).not.toBe(bad);
      expect(id).toMatch(/^[0-9a-f-]{36}$/);
    }
  });
});
