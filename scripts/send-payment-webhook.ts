import "dotenv/config";
import { randomUUID } from "node:crypto";
import { prisma } from "../lib/prisma";
import { WEBHOOK_SIGNATURE_HEADER, signWebhookPayload } from "../lib/billing/webhook";

async function main() {
  const [paymentId, outcome, baseUrl = "http://localhost:3000"] = process.argv.slice(2);
  const secret = process.env.PAYMENT_WEBHOOK_SECRET;

  if (!paymentId || !["succeeded", "failed", "refunded"].includes(outcome ?? "")) {
    throw new Error(
      "Usage: npm run webhook:send -- <paymentId> <succeeded|failed|refunded> [baseUrl]",
    );
  }
  if (!secret) {
    throw new Error("PAYMENT_WEBHOOK_SECRET is not set");
  }

  const payment = await prisma.payment.findUnique({ where: { id: paymentId } });
  if (!payment) {
    throw new Error(`Payment ${paymentId} not found`);
  }

  const body = JSON.stringify({
    id: `evt_${randomUUID()}`,
    type: `payment.${outcome}`,
    data: {
      paymentId,
      amount: payment.amount.toFixed(2),
      currency: payment.currency,
      providerReference: `sim_${randomUUID()}`,
    },
  });

  const res = await fetch(`${baseUrl}/api/webhooks/payments`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      [WEBHOOK_SIGNATURE_HEADER]: signWebhookPayload(body, secret),
    },
    body,
  });

  console.log(res.status, await res.text());
  if (!res.ok) {
    process.exitCode = 1;
  }
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
