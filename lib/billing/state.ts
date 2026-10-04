import type {
  BillingInterval,
  PaymentStatus,
  SubscriptionStatus,
} from "../../generated/prisma/enums";
import { addBillingInterval } from "./period";

export const PAYMENT_EVENT_TYPES = [
  "payment.succeeded",
  "payment.failed",
  "payment.refunded",
] as const;

export type PaymentEventType = (typeof PAYMENT_EVENT_TYPES)[number];

const PAYMENT_TRANSITIONS: Record<
  PaymentEventType,
  { from: readonly PaymentStatus[]; to: PaymentStatus }
> = {
  "payment.succeeded": { from: ["PENDING"], to: "SUCCEEDED" },
  "payment.failed": { from: ["PENDING"], to: "FAILED" },
  "payment.refunded": { from: ["SUCCEEDED"], to: "REFUNDED" },
};

export function nextPaymentStatus(
  current: PaymentStatus,
  eventType: PaymentEventType,
): PaymentStatus | null {
  const transition = PAYMENT_TRANSITIONS[eventType];
  return transition.from.includes(current) ? transition.to : null;
}

type SubscriptionSnapshot = {
  status: SubscriptionStatus;
  currentPeriodEnd: Date;
};

export type SubscriptionChange = {
  status?: SubscriptionStatus;
  currentPeriodStart?: Date;
  currentPeriodEnd?: Date;
  cancelledAt?: Date;
};

export function subscriptionChangeForPayment(
  subscription: SubscriptionSnapshot,
  interval: BillingInterval,
  paymentStatus: PaymentStatus,
  now: Date,
): SubscriptionChange | null {
  if (paymentStatus === "SUCCEEDED") {
    if (subscription.status === "ACTIVE" && subscription.currentPeriodEnd > now) {
      return {
        currentPeriodEnd: addBillingInterval(subscription.currentPeriodEnd, interval),
      };
    }

    if (subscription.status !== "CANCELLED") {
      return {
        status: "ACTIVE",
        currentPeriodStart: now,
        currentPeriodEnd: addBillingInterval(now, interval),
      };
    }
    return null;
  }

  if (paymentStatus === "REFUNDED" && subscription.status === "ACTIVE") {
    return { status: "CANCELLED", cancelledAt: now };
  }

  return null;
}

export function withEffectiveStatus<
  T extends SubscriptionSnapshot & { cancelAtPeriodEnd: boolean },
>(subscription: T, now: Date): T {
  if (subscription.status === "ACTIVE" && subscription.currentPeriodEnd <= now) {
    return {
      ...subscription,
      status: subscription.cancelAtPeriodEnd ? "CANCELLED" : "EXPIRED",
      cancelAtPeriodEnd: false,
    };
  }
  return subscription;
}
