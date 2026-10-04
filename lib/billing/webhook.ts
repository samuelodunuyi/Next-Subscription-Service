import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { PAYMENT_EVENT_TYPES } from "./state";

export const WEBHOOK_SIGNATURE_HEADER = "x-webhook-signature";
const DEFAULT_TOLERANCE_SECONDS = 5 * 60;

export const WebhookEventSchema = z.object({
  id: z.string().min(1).max(255),
  type: z.enum(PAYMENT_EVENT_TYPES),
  data: z.looseObject({
    paymentId: z.uuid(),

    amount: z.string().regex(/^\d{1,8}(\.\d{1,2})?$/),
    currency: z.string().regex(/^[A-Za-z]{3}$/),
    providerReference: z.string().min(1).max(255).optional(),
  }),
});

export type WebhookEvent = z.infer<typeof WebhookEventSchema>;

function computeSignature(body: string, timestamp: number, secret: string) {
  return createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
}

export function signWebhookPayload(
  body: string,
  secret: string,
  timestamp = Math.floor(Date.now() / 1000),
) {
  return `t=${timestamp},v1=${computeSignature(body, timestamp, secret)}`;
}

export function verifyWebhookSignature(
  body: string,
  header: string | null,
  secret: string,
  nowMs = Date.now(),
  toleranceSeconds = DEFAULT_TOLERANCE_SECONDS,
): boolean {
  if (!header) {
    return false;
  }

  const parts = new Map(
    header.split(",").map((part) => {
      const [key, ...rest] = part.trim().split("=");
      return [key, rest.join("=")] as const;
    }),
  );

  const timestamp = Number(parts.get("t"));
  const signature = parts.get("v1");

  if (!Number.isInteger(timestamp) || !signature) {
    return false;
  }

  if (Math.abs(nowMs / 1000 - timestamp) > toleranceSeconds) {
    return false;
  }

  const expected = Buffer.from(computeSignature(body, timestamp, secret), "hex");
  const received = Buffer.from(signature, "hex");

  return expected.length === received.length && timingSafeEqual(expected, received);
}

export function webhookSecretsFromEnv(env: NodeJS.ProcessEnv = process.env): string[] {
  return [env.PAYMENT_WEBHOOK_SECRET, env.PAYMENT_WEBHOOK_SECRET_PREVIOUS].filter(
    (secret): secret is string => Boolean(secret),
  );
}

export function verifyWebhookSignatureWithAny(
  body: string,
  header: string | null,
  secrets: string[],
  nowMs = Date.now(),
): boolean {
  return secrets.map((secret) => verifyWebhookSignature(body, header, secret, nowMs)).some(Boolean);
}
