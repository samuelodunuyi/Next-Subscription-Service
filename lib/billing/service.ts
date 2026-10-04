import { prisma, type TransactionClient } from "../prisma";
import { Prisma } from "../../generated/prisma/client";
import { log } from "../log";
import { addBillingInterval } from "./period";
import { nextPaymentStatus, subscriptionChangeForPayment, withEffectiveStatus } from "./state";
import type { WebhookEvent } from "./webhook";

type Db = typeof prisma | TransactionClient;

const subscriptionInclude = { plan: true } as const;

async function lockUser(tx: TransactionClient, userId: string) {
  await tx.$queryRaw`SELECT id FROM "users" WHERE id = ${userId} FOR UPDATE`;
}

export async function expireLapsedSubscriptions(db: Db, userId?: string) {
  const lapsed = {
    ...(userId ? { userId } : {}),
    status: "ACTIVE" as const,
    currentPeriodEnd: { lte: new Date() },
  };

  await db.subscription.updateMany({
    where: { ...lapsed, cancelAtPeriodEnd: true },
    data: { status: "CANCELLED", cancelAtPeriodEnd: false },
  });
  await db.subscription.updateMany({
    where: lapsed,
    data: { status: "EXPIRED" },
  });
}

export async function findLiveSubscription(db: Db, userId: string) {
  await expireLapsedSubscriptions(db, userId);
  return db.subscription.findFirst({
    where: { userId, status: { in: ["PENDING", "ACTIVE"] } },
    include: subscriptionInclude,
  });
}

export async function listSubscriptions(userId: string) {
  const now = new Date();
  const subscriptions = await prisma.subscription.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    include: subscriptionInclude,
  });
  return subscriptions.map((subscription) => withEffectiveStatus(subscription, now));
}

export async function readLiveSubscription(db: Db, userId: string) {
  const now = new Date();
  const candidates = await db.subscription.findMany({
    where: { userId, status: { in: ["PENDING", "ACTIVE"] } },
    include: subscriptionInclude,
  });
  return (
    candidates
      .map((subscription) => withEffectiveStatus(subscription, now))
      .find(
        (subscription) => subscription.status === "PENDING" || subscription.status === "ACTIVE",
      ) ?? null
  );
}

export async function subscribe(userId: string, planId: string) {
  return prisma.$transaction(async (tx) => {
    await lockUser(tx, userId);

    const plan = await tx.plan.findFirst({ where: { id: planId, active: true } });
    if (!plan) {
      return { ok: false as const, error: "PLAN_NOT_FOUND" as const };
    }

    if (await findLiveSubscription(tx, userId)) {
      return { ok: false as const, error: "ALREADY_SUBSCRIBED" as const };
    }

    const now = new Date();
    const subscription = await tx.subscription.create({
      data: {
        userId,
        planId: plan.id,
        status: "PENDING",
        currentPeriodStart: now,
        currentPeriodEnd: addBillingInterval(now, plan.interval),
      },
      include: subscriptionInclude,
    });

    const payment = await tx.payment.create({
      data: {
        userId,
        subscriptionId: subscription.id,
        amount: plan.price,
        currency: plan.currency,
        status: "PENDING",
      },
    });

    return { ok: true as const, subscription, payment };
  });
}

export async function createPayment(userId: string) {
  return prisma.$transaction(async (tx) => {
    await lockUser(tx, userId);

    const subscription = await findLiveSubscription(tx, userId);
    if (!subscription) {
      return { ok: false as const, error: "NO_SUBSCRIPTION" as const };
    }

    if (subscription.cancelAtPeriodEnd) {
      return { ok: false as const, error: "CANCELLATION_SCHEDULED" as const };
    }

    const pending = await tx.payment.findFirst({
      where: { subscriptionId: subscription.id, status: "PENDING" },
    });
    if (pending) {
      return { ok: false as const, error: "PAYMENT_PENDING" as const, payment: pending };
    }

    const payment = await tx.payment.create({
      data: {
        userId,
        subscriptionId: subscription.id,
        amount: subscription.plan.price,
        currency: subscription.plan.currency,
        status: "PENDING",
      },
    });

    return { ok: true as const, payment };
  });
}

export async function cancelSubscription(userId: string, immediate = false) {
  return prisma.$transaction(async (tx) => {
    await lockUser(tx, userId);

    const subscription = await findLiveSubscription(tx, userId);
    if (!subscription) {
      return { ok: false as const, error: "NO_SUBSCRIPTION" as const };
    }

    if (immediate || subscription.status === "PENDING") {
      const cancelled = await tx.subscription.update({
        where: { id: subscription.id },
        data: { status: "CANCELLED", cancelAtPeriodEnd: false, cancelledAt: new Date() },
        include: subscriptionInclude,
      });
      return { ok: true as const, subscription: cancelled };
    }

    if (subscription.cancelAtPeriodEnd) {
      return { ok: true as const, subscription };
    }

    const scheduled = await tx.subscription.update({
      where: { id: subscription.id },
      data: { cancelAtPeriodEnd: true, cancelledAt: new Date() },
      include: subscriptionInclude,
    });
    return { ok: true as const, subscription: scheduled };
  });
}

export async function resumeSubscription(userId: string) {
  return prisma.$transaction(async (tx) => {
    await lockUser(tx, userId);

    const subscription = await findLiveSubscription(tx, userId);
    if (!subscription) {
      return { ok: false as const, error: "NO_SUBSCRIPTION" as const };
    }
    if (!subscription.cancelAtPeriodEnd) {
      return { ok: false as const, error: "NOT_SCHEDULED" as const };
    }

    const resumed = await tx.subscription.update({
      where: { id: subscription.id },
      data: { cancelAtPeriodEnd: false, cancelledAt: null },
      include: subscriptionInclude,
    });
    return { ok: true as const, subscription: resumed };
  });
}

export type WebhookOutcome =
  | "PAYMENT_NOT_FOUND"
  | "DUPLICATE"
  | "IGNORED_INVALID_TRANSITION"
  | "REJECTED_AMOUNT_MISMATCH"
  | "APPLIED";

export async function applyPaymentWebhook(event: WebhookEvent): Promise<WebhookOutcome> {
  let refundReason: string | undefined;

  const outcome = await prisma.$transaction(async (tx): Promise<WebhookOutcome> => {
    const locked = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM "payments" WHERE id = ${event.data.paymentId} FOR UPDATE`;
    if (locked.length === 0) {
      return "PAYMENT_NOT_FOUND";
    }

    const seen = await tx.paymentEvent.findUnique({
      where: { providerEventId: event.id },
    });
    if (seen) {
      return "DUPLICATE";
    }

    const payment = await tx.payment.findUniqueOrThrow({
      where: { id: event.data.paymentId },
    });

    await tx.paymentEvent.create({
      data: {
        paymentId: payment.id,
        providerEventId: event.id,
        type: event.type,

        payload: event as Prisma.InputJsonObject,
      },
    });

    const amountMatches =
      new Prisma.Decimal(event.data.amount).equals(payment.amount) &&
      event.data.currency.toUpperCase() === payment.currency.toUpperCase();

    if (!amountMatches) {
      if (event.type === "payment.succeeded") {
        refundReason = `Provider reported ${event.data.amount} ${event.data.currency}; expected ${payment.amount} ${payment.currency}`;
        await tx.payment.update({
          where: { id: payment.id },
          data: { requiresRefund: true, refundReason },
        });
      }
      return "REJECTED_AMOUNT_MISMATCH";
    }

    const status = nextPaymentStatus(payment.status, event.type);
    if (!status) {
      return "IGNORED_INVALID_TRANSITION";
    }

    const now = new Date();
    await tx.payment.update({
      where: { id: payment.id },
      data: {
        status,
        paidAt: status === "SUCCEEDED" ? now : undefined,
        providerReference: event.data.providerReference ?? undefined,

        ...(status === "REFUNDED" ? { requiresRefund: false, refundReason: null } : {}),
      },
    });

    await tx.$queryRaw`
      SELECT id FROM "subscriptions" WHERE id = ${payment.subscriptionId} FOR UPDATE`;
    const subscription = await tx.subscription.findUniqueOrThrow({
      where: { id: payment.subscriptionId },
      include: subscriptionInclude,
    });

    const change = subscriptionChangeForPayment(
      subscription,
      subscription.plan.interval,
      status,
      now,
    );

    if (change) {
      await tx.subscription.update({ where: { id: subscription.id }, data: change });
    } else if (status === "SUCCEEDED" && subscription.status === "CANCELLED") {
      refundReason = "Payment succeeded after the subscription was cancelled";
      await tx.payment.update({
        where: { id: payment.id },
        data: { requiresRefund: true, refundReason },
      });
    }

    return "APPLIED";
  });

  logWebhookOutcome(event, outcome, refundReason);
  return outcome;
}

function logWebhookOutcome(
  event: WebhookEvent,
  outcome: WebhookOutcome,
  refundReason: string | undefined,
) {
  const fields = {
    eventId: event.id,
    eventType: event.type,
    paymentId: event.data.paymentId,
    outcome,
  };

  if (outcome === "REJECTED_AMOUNT_MISMATCH") {
    log.error("billing.amount_mismatch", {
      ...fields,
      reportedAmount: event.data.amount,
      reportedCurrency: event.data.currency,
    });
  } else if (outcome === "PAYMENT_NOT_FOUND") {
    log.warn("billing.webhook_unknown_payment", fields);
  } else if (outcome === "IGNORED_INVALID_TRANSITION") {
    log.warn("billing.webhook_ignored", fields);
  } else if (outcome === "DUPLICATE") {
    log.info("billing.webhook_duplicate", fields);
  } else {
    log.info("billing.webhook_applied", fields);
  }

  if (refundReason !== undefined) {
    log.error("billing.refund_required", { ...fields, reason: refundReason });
  }
}
