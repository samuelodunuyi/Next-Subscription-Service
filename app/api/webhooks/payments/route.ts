import { NextResponse } from "next/server";
import { errorResponse, readBodyText } from "@/lib/http";
import { log } from "@/lib/log";
import { applyPaymentWebhook } from "@/lib/billing/service";
import {
  WEBHOOK_SIGNATURE_HEADER,
  WebhookEventSchema,
  verifyWebhookSignatureWithAny,
  webhookSecretsFromEnv,
} from "@/lib/billing/webhook";
import { clientIp, enforceRateLimit, limits } from "@/lib/rate-limit";

export async function POST(req: Request) {
  const secrets = webhookSecretsFromEnv();
  if (secrets.length === 0) {
    log.error("billing.webhook_not_configured", {});
    return errorResponse(500, "Webhook not configured");
  }

  const ip = clientIp(req);
  const limited = await enforceRateLimit([limits.webhookByIp(ip)]);
  if (limited) {
    return limited;
  }

  const rawBody = await readBodyText(req);
  if (rawBody === null) {
    return errorResponse(413, "Request body too large");
  }

  if (!verifyWebhookSignatureWithAny(rawBody, req.headers.get(WEBHOOK_SIGNATURE_HEADER), secrets)) {
    log.warn("security.webhook_bad_signature", {
      ip,
      requestId: req.headers.get("x-request-id"),
    });
    return errorResponse(401, "Invalid signature");
  }

  let json: unknown;
  try {
    json = JSON.parse(rawBody);
  } catch {
    log.warn("billing.webhook_malformed", { reason: "invalid json" });
    return errorResponse(400, "Malformed JSON body");
  }

  const parsed = WebhookEventSchema.safeParse(json);
  if (!parsed.success) {
    log.error("billing.webhook_malformed", { reason: "schema", issues: parsed.error.issues });
    return errorResponse(400, "Invalid event");
  }

  const outcome = await applyPaymentWebhook(parsed.data);

  if (outcome === "PAYMENT_NOT_FOUND") {
    return errorResponse(404, "Payment not found");
  }

  return NextResponse.json({ received: true, outcome }, { status: 200 });
}
