import { describe, expect, it } from "vitest";

import {
  signWebhookPayload,
  verifyWebhookSignature,
  verifyWebhookSignatureWithAny,
  webhookSecretsFromEnv,
} from "./webhook";

const secret = "test-secret";
const body = JSON.stringify({ id: "evt_1", type: "payment.succeeded" });
const timestamp = 1_800_000_000;
const nowMs = timestamp * 1000;

describe("webhook signatures", () => {
  it("accepts a correctly signed payload", () => {
    const header = signWebhookPayload(body, secret, timestamp);
    expect(verifyWebhookSignature(body, header, secret, nowMs)).toBe(true);
  });

  it("rejects a tampered body", () => {
    const header = signWebhookPayload(body, secret, timestamp);
    expect(
      verifyWebhookSignature(body.replace("succeeded", "refunded"), header, secret, nowMs),
    ).toBe(false);
  });

  it("rejects the wrong secret", () => {
    const header = signWebhookPayload(body, "other-secret", timestamp);
    expect(verifyWebhookSignature(body, header, secret, nowMs)).toBe(false);
  });

  it("rejects a stale timestamp (replay)", () => {
    const header = signWebhookPayload(body, secret, timestamp);
    expect(verifyWebhookSignature(body, header, secret, nowMs + 10 * 60 * 1000)).toBe(false);
  });

  it("rejects missing or malformed headers", () => {
    expect(verifyWebhookSignature(body, null, secret, nowMs)).toBe(false);
    expect(verifyWebhookSignature(body, "garbage", secret, nowMs)).toBe(false);
    expect(verifyWebhookSignature(body, `t=${timestamp},v1=zz`, secret, nowMs)).toBe(false);
    expect(verifyWebhookSignature(body, `t=abc,v1=00`, secret, nowMs)).toBe(false);
  });
});

describe("secret rotation", () => {
  it("accepts the current and the previous secret, and nothing else", () => {
    const secrets = webhookSecretsFromEnv({
      PAYMENT_WEBHOOK_SECRET: "new-secret",
      PAYMENT_WEBHOOK_SECRET_PREVIOUS: "old-secret",
    } as never);
    expect(secrets).toEqual(["new-secret", "old-secret"]);

    const signedWith = (s: string) => signWebhookPayload(body, s, timestamp);
    expect(verifyWebhookSignatureWithAny(body, signedWith("new-secret"), secrets, nowMs)).toBe(
      true,
    );
    expect(verifyWebhookSignatureWithAny(body, signedWith("old-secret"), secrets, nowMs)).toBe(
      true,
    );
    expect(verifyWebhookSignatureWithAny(body, signedWith("revoked"), secrets, nowMs)).toBe(false);
  });

  it("rejects everything when no secret is configured", () => {
    expect(webhookSecretsFromEnv({} as never)).toEqual([]);
    expect(
      verifyWebhookSignatureWithAny(body, signWebhookPayload(body, "x", timestamp), [], nowMs),
    ).toBe(false);
  });
});
