import { describe, expect, it } from "vitest";

import { nextPaymentStatus, subscriptionChangeForPayment, withEffectiveStatus } from "./state";

const now = new Date("2026-05-10T12:00:00.000Z");

describe("nextPaymentStatus", () => {
  it("allows the provider lifecycle transitions", () => {
    expect(nextPaymentStatus("PENDING", "payment.succeeded")).toBe("SUCCEEDED");
    expect(nextPaymentStatus("PENDING", "payment.failed")).toBe("FAILED");
    expect(nextPaymentStatus("SUCCEEDED", "payment.refunded")).toBe("REFUNDED");
  });

  it("rejects out-of-order and terminal-state events", () => {
    expect(nextPaymentStatus("SUCCEEDED", "payment.failed")).toBeNull();
    expect(nextPaymentStatus("FAILED", "payment.succeeded")).toBeNull();
    expect(nextPaymentStatus("PENDING", "payment.refunded")).toBeNull();
    expect(nextPaymentStatus("REFUNDED", "payment.refunded")).toBeNull();
    expect(nextPaymentStatus("SUCCEEDED", "payment.succeeded")).toBeNull();
  });
});

describe("subscriptionChangeForPayment", () => {
  it("activates a pending subscription with a period starting now", () => {
    expect(
      subscriptionChangeForPayment(
        { status: "PENDING", currentPeriodEnd: new Date("2026-01-01T00:00:00.000Z") },
        "MONTHLY",
        "SUCCEEDED",
        now,
      ),
    ).toEqual({
      status: "ACTIVE",
      currentPeriodStart: now,
      currentPeriodEnd: new Date("2026-06-10T12:00:00.000Z"),
    });
  });

  it("extends an active subscription from its current end", () => {
    expect(
      subscriptionChangeForPayment(
        { status: "ACTIVE", currentPeriodEnd: new Date("2026-05-20T00:00:00.000Z") },
        "MONTHLY",
        "SUCCEEDED",
        now,
      ),
    ).toEqual({ currentPeriodEnd: new Date("2026-06-20T00:00:00.000Z") });
  });

  it("revives a subscription that lapsed while the renewal was in flight", () => {
    expect(
      subscriptionChangeForPayment(
        { status: "EXPIRED", currentPeriodEnd: new Date("2026-05-01T00:00:00.000Z") },
        "YEARLY",
        "SUCCEEDED",
        now,
      ),
    ).toEqual({
      status: "ACTIVE",
      currentPeriodStart: now,
      currentPeriodEnd: new Date("2027-05-10T12:00:00.000Z"),
    });
  });

  it("does not reactivate a cancelled subscription", () => {
    expect(
      subscriptionChangeForPayment(
        { status: "CANCELLED", currentPeriodEnd: now },
        "MONTHLY",
        "SUCCEEDED",
        now,
      ),
    ).toBeNull();
  });

  it("revokes an active subscription on refund", () => {
    expect(
      subscriptionChangeForPayment(
        { status: "ACTIVE", currentPeriodEnd: new Date("2026-06-01T00:00:00.000Z") },
        "MONTHLY",
        "REFUNDED",
        now,
      ),
    ).toEqual({ status: "CANCELLED", cancelledAt: now });
  });

  it("leaves the subscription alone when a payment fails", () => {
    expect(
      subscriptionChangeForPayment(
        { status: "PENDING", currentPeriodEnd: now },
        "MONTHLY",
        "FAILED",
        now,
      ),
    ).toBeNull();
  });
});

describe("withEffectiveStatus", () => {
  const lapsed = new Date("2026-05-01T00:00:00.000Z");
  const future = new Date("2026-06-01T00:00:00.000Z");

  it("leaves live subscriptions alone", () => {
    const sub = { status: "ACTIVE" as const, currentPeriodEnd: future, cancelAtPeriodEnd: false };
    expect(withEffectiveStatus(sub, now)).toBe(sub);
    const pending = {
      status: "PENDING" as const,
      currentPeriodEnd: lapsed,
      cancelAtPeriodEnd: false,
    };
    expect(withEffectiveStatus(pending, now)).toBe(pending);
  });

  it("expires a lapsed active subscription, or cancels it if that was scheduled", () => {
    expect(
      withEffectiveStatus(
        { status: "ACTIVE" as const, currentPeriodEnd: lapsed, cancelAtPeriodEnd: false },
        now,
      ).status,
    ).toBe("EXPIRED");
    expect(
      withEffectiveStatus(
        { status: "ACTIVE" as const, currentPeriodEnd: lapsed, cancelAtPeriodEnd: true },
        now,
      ),
    ).toMatchObject({ status: "CANCELLED", cancelAtPeriodEnd: false });
  });
});
