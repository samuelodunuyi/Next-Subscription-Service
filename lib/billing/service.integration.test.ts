import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { prisma } from "../prisma";
import {
  applyPaymentWebhook,
  cancelSubscription,
  createPayment,
  findLiveSubscription,
  listSubscriptions,
  readLiveSubscription,
  resumeSubscription,
  subscribe,
} from "./service";
import type { WebhookEvent } from "./webhook";

const userIds: string[] = [];
let planId: string;
const PRICE = "9.99";

async function createUser() {
  const user = await prisma.user.create({
    data: {
      email: `it+${randomUUID()}@example.com`,
      passwordHash: "not-a-real-hash",
      firstName: "Test",
      lastName: "User",
    },
  });
  userIds.push(user.id);
  return user;
}

function webhook(
  paymentId: string,
  type: WebhookEvent["type"],
  overrides: { id?: string; amount?: string; currency?: string } = {},
): WebhookEvent {
  return {
    id: overrides.id ?? `evt_${randomUUID()}`,
    type,
    data: {
      paymentId,
      amount: overrides.amount ?? PRICE,
      currency: overrides.currency ?? "GBP",
    },
  };
}

async function activeSubscription() {
  const user = await createUser();
  const created = await subscribe(user.id, planId);
  if (!created.ok) throw new Error("subscribe failed");
  await applyPaymentWebhook(webhook(created.payment.id, "payment.succeeded"));
  return { user, subscriptionId: created.subscription.id, paymentId: created.payment.id };
}

async function statusOf(subscriptionId: string) {
  return (await prisma.subscription.findUniqueOrThrow({ where: { id: subscriptionId } })).status;
}

async function lapse(subscriptionId: string) {
  await prisma.subscription.update({
    where: { id: subscriptionId },
    data: { currentPeriodEnd: new Date(Date.now() - 1000) },
  });
}

beforeAll(async () => {
  const plan = await prisma.plan.create({
    data: {
      name: `IT plan ${randomUUID()}`,
      description: "integration test plan",
      price: PRICE,
      currency: "GBP",
      interval: "MONTHLY",
    },
  });
  planId = plan.id;
});

afterAll(async () => {
  await prisma.paymentEvent.deleteMany({ where: { payment: { userId: { in: userIds } } } });
  await prisma.payment.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.subscription.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  await prisma.plan.deleteMany({ where: { id: planId } });
  await prisma.$disconnect();
});

describe("subscribe", () => {
  it("creates a PENDING subscription with a PENDING payment for the plan price", async () => {
    const user = await createUser();
    const result = await subscribe(user.id, planId);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.subscription.status).toBe("PENDING");
    expect(result.payment.status).toBe("PENDING");
    expect(result.payment.amount.toFixed(2)).toBe(PRICE);
  });

  it("rejects a second live subscription and unknown or inactive plans", async () => {
    const user = await createUser();
    await subscribe(user.id, planId);

    expect(await subscribe(user.id, planId)).toMatchObject({ error: "ALREADY_SUBSCRIBED" });
    expect(await subscribe((await createUser()).id, randomUUID())).toMatchObject({
      error: "PLAN_NOT_FOUND",
    });
  });

  it("lets exactly one of many concurrent requests win", async () => {
    const user = await createUser();
    const results = await Promise.all(Array.from({ length: 6 }, () => subscribe(user.id, planId)));

    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(await prisma.subscription.count({ where: { userId: user.id } })).toBe(1);
  });
});

describe("payment webhooks", () => {
  it("activates the subscription when the first payment succeeds", async () => {
    const { subscriptionId } = await activeSubscription();
    expect(await statusOf(subscriptionId)).toBe("ACTIVE");
  });

  it("applies a duplicated, concurrently delivered event exactly once", async () => {
    const user = await createUser();
    const created = await subscribe(user.id, planId);
    if (!created.ok) throw new Error("subscribe failed");

    const event = webhook(created.payment.id, "payment.succeeded");
    const outcomes = await Promise.all(Array.from({ length: 5 }, () => applyPaymentWebhook(event)));

    expect(outcomes.filter((o) => o === "APPLIED")).toHaveLength(1);
    expect(outcomes.filter((o) => o === "DUPLICATE")).toHaveLength(4);
    expect(await prisma.paymentEvent.count({ where: { paymentId: created.payment.id } })).toBe(1);
  });

  it("ignores out-of-order events instead of corrupting state", async () => {
    const { paymentId, subscriptionId } = await activeSubscription();

    expect(await applyPaymentWebhook(webhook(paymentId, "payment.failed"))).toBe(
      "IGNORED_INVALID_TRANSITION",
    );
    const payment = await prisma.payment.findUniqueOrThrow({ where: { id: paymentId } });
    expect(payment.status).toBe("SUCCEEDED");
    expect(await statusOf(subscriptionId)).toBe("ACTIVE");
  });

  it("reports unknown payments", async () => {
    expect(await applyPaymentWebhook(webhook(randomUUID(), "payment.succeeded"))).toBe(
      "PAYMENT_NOT_FOUND",
    );
  });

  it("rejects an amount or currency mismatch, flags the money, and changes nothing", async () => {
    for (const bad of [{ amount: "0.01" }, { currency: "USD" }]) {
      const user = await createUser();
      const created = await subscribe(user.id, planId);
      if (!created.ok) throw new Error("subscribe failed");

      const outcome = await applyPaymentWebhook(
        webhook(created.payment.id, "payment.succeeded", bad),
      );
      expect(outcome).toBe("REJECTED_AMOUNT_MISMATCH");

      const payment = await prisma.payment.findUniqueOrThrow({ where: { id: created.payment.id } });
      expect(payment.status).toBe("PENDING");
      expect(payment.requiresRefund).toBe(true);
      expect(await statusOf(created.subscription.id)).toBe("PENDING");
    }
  });

  it("keeps a failed first payment retryable without activating", async () => {
    const user = await createUser();
    const created = await subscribe(user.id, planId);
    if (!created.ok) throw new Error("subscribe failed");

    await applyPaymentWebhook(webhook(created.payment.id, "payment.failed"));
    expect(await statusOf(created.subscription.id)).toBe("PENDING");

    const retry = await createPayment(user.id);
    expect(retry.ok).toBe(true);
  });

  it("allows only one pending payment at a time", async () => {
    const user = await createUser();
    await subscribe(user.id, planId);

    expect(await createPayment(user.id)).toMatchObject({ error: "PAYMENT_PENDING" });
  });

  it("extends an active subscription from its current end on renewal", async () => {
    const { user, subscriptionId } = await activeSubscription();
    const before = await prisma.subscription.findUniqueOrThrow({ where: { id: subscriptionId } });

    const renewal = await createPayment(user.id);
    if (!renewal.ok) throw new Error("renewal failed");
    await applyPaymentWebhook(webhook(renewal.payment.id, "payment.succeeded"));

    const after = await prisma.subscription.findUniqueOrThrow({ where: { id: subscriptionId } });
    expect(after.currentPeriodEnd.getTime()).toBeGreaterThan(before.currentPeriodEnd.getTime());
    expect(after.currentPeriodStart).toEqual(before.currentPeriodStart);
  });

  it("revokes access on refund", async () => {
    const { user, paymentId, subscriptionId } = await activeSubscription();

    await applyPaymentWebhook(webhook(paymentId, "payment.refunded"));

    expect(await statusOf(subscriptionId)).toBe("CANCELLED");
    expect(await findLiveSubscription(prisma, user.id)).toBeNull();
  });

  it("flags a payment that succeeds after cancellation for refund", async () => {
    const user = await createUser();
    const created = await subscribe(user.id, planId);
    if (!created.ok) throw new Error("subscribe failed");

    await cancelSubscription(user.id);
    await applyPaymentWebhook(webhook(created.payment.id, "payment.succeeded"));

    const payment = await prisma.payment.findUniqueOrThrow({ where: { id: created.payment.id } });
    expect(payment.requiresRefund).toBe(true);
    expect(await statusOf(created.subscription.id)).toBe("CANCELLED");
  });
});

describe("cancellation", () => {
  it("cancels a pending subscription immediately", async () => {
    const user = await createUser();
    await subscribe(user.id, planId);

    const result = await cancelSubscription(user.id);
    expect(result.ok && result.subscription.status).toBe("CANCELLED");
  });

  it("keeps an active subscription live until the period ends, then closes it as CANCELLED", async () => {
    const { user, subscriptionId } = await activeSubscription();

    const result = await cancelSubscription(user.id);
    expect(result.ok && result.subscription.status).toBe("ACTIVE");
    expect(result.ok && result.subscription.cancelAtPeriodEnd).toBe(true);

    expect((await cancelSubscription(user.id)).ok).toBe(true);
    expect(await createPayment(user.id)).toMatchObject({ error: "CANCELLATION_SCHEDULED" });
    expect(await subscribe(user.id, planId)).toMatchObject({ error: "ALREADY_SUBSCRIBED" });

    await lapse(subscriptionId);
    expect(await findLiveSubscription(prisma, user.id)).toBeNull();
    expect(await statusOf(subscriptionId)).toBe("CANCELLED");
  });

  it("cancels an active subscription at once when asked", async () => {
    const { user, subscriptionId } = await activeSubscription();

    await cancelSubscription(user.id, true);
    expect(await statusOf(subscriptionId)).toBe("CANCELLED");
  });

  it("resumes a scheduled cancellation", async () => {
    const { user, subscriptionId } = await activeSubscription();

    expect(await resumeSubscription(user.id)).toMatchObject({ error: "NOT_SCHEDULED" });
    await cancelSubscription(user.id);
    const resumed = await resumeSubscription(user.id);
    expect(resumed.ok && resumed.subscription.cancelAtPeriodEnd).toBe(false);

    await lapse(subscriptionId);
    await findLiveSubscription(prisma, user.id);
    expect(await statusOf(subscriptionId)).toBe("EXPIRED");
  });
});

describe("read-only status (GET handlers must not write)", () => {
  it("reports a lapsed subscription as EXPIRED without changing the database", async () => {
    const { user, subscriptionId } = await activeSubscription();
    await lapse(subscriptionId);

    expect(await readLiveSubscription(prisma, user.id)).toBeNull();
    const listed = await listSubscriptions(user.id);
    expect(listed.find((s) => s.id === subscriptionId)?.status).toBe("EXPIRED");

    expect(await statusOf(subscriptionId)).toBe("ACTIVE");
  });

  it("reports a lapsed scheduled cancellation as CANCELLED, also without writing", async () => {
    const { user, subscriptionId } = await activeSubscription();
    await cancelSubscription(user.id);
    await lapse(subscriptionId);

    const listed = await listSubscriptions(user.id);
    expect(listed.find((s) => s.id === subscriptionId)?.status).toBe("CANCELLED");
    expect(await statusOf(subscriptionId)).toBe("ACTIVE");
  });

  it("still returns live subscriptions and persists the transition on the next write", async () => {
    const { user, subscriptionId } = await activeSubscription();
    expect((await readLiveSubscription(prisma, user.id))?.id).toBe(subscriptionId);

    await lapse(subscriptionId);

    expect((await subscribe(user.id, planId)).ok).toBe(true);
    expect(await statusOf(subscriptionId)).toBe("EXPIRED");
  });
});
