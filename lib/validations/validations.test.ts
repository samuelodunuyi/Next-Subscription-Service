import { describe, expect, it } from "vitest";

import { LoginSchema, SignupSchema } from "../auth/validations";
import { PlansSchema, UpdatePlanSchema } from "./plans";

describe("auth validation", () => {
  it("normalises email before validating", () => {
    const result = SignupSchema.parse({
      email: "  Jane.Doe@Example.COM ",
      password: "Password123!",
      firstName: " Jane ",
      lastName: "Doe",
    });
    expect(result.email).toBe("jane.doe@example.com");
    expect(result.firstName).toBe("Jane");
  });

  it("does not apply signup password rules to login", () => {
    expect(LoginSchema.safeParse({ email: "a@b.co", password: "short" }).success).toBe(true);
  });
});

describe("plan validation", () => {
  const valid = { name: "Pro", description: "Pro plan", price: 19.99, interval: "MONTHLY" };

  it("accepts 2dp prices and defaults currency to GBP", () => {
    expect(PlansSchema.parse(valid)).toMatchObject({ price: 19.99, currency: "GBP" });
  });

  it("uppercases currency codes", () => {
    expect(PlansSchema.parse({ ...valid, currency: "usd" }).currency).toBe("USD");
  });

  it("rejects sub-penny, zero and negative prices", () => {
    expect(PlansSchema.safeParse({ ...valid, price: 9.999 }).success).toBe(false);
    expect(PlansSchema.safeParse({ ...valid, price: 0 }).success).toBe(false);
    expect(PlansSchema.safeParse({ ...valid, price: -1 }).success).toBe(false);
  });

  it("requires at least one field on update", () => {
    expect(UpdatePlanSchema.safeParse({}).success).toBe(false);
    expect(UpdatePlanSchema.safeParse({ active: false }).success).toBe(true);
  });
});
