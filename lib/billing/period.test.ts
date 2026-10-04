import { describe, expect, it } from "vitest";

import { addBillingInterval } from "./period";

const utc = (iso: string) => new Date(`${iso}Z`);

describe("addBillingInterval", () => {
  it("adds one month, preserving time of day", () => {
    expect(addBillingInterval(utc("2026-03-15T10:30:00.000"), "MONTHLY")).toEqual(
      utc("2026-04-15T10:30:00.000"),
    );
  });

  it("clamps to the last day of a shorter month", () => {
    expect(addBillingInterval(utc("2026-01-31T00:00:00.000"), "MONTHLY")).toEqual(
      utc("2026-02-28T00:00:00.000"),
    );
    expect(addBillingInterval(utc("2028-01-31T00:00:00.000"), "MONTHLY")).toEqual(
      utc("2028-02-29T00:00:00.000"),
    );
  });

  it("rolls over the year for a December monthly renewal", () => {
    expect(addBillingInterval(utc("2026-12-31T23:59:59.999"), "MONTHLY")).toEqual(
      utc("2027-01-31T23:59:59.999"),
    );
  });

  it("adds a year, clamping Feb 29 to Feb 28", () => {
    expect(addBillingInterval(utc("2026-06-01T00:00:00.000"), "YEARLY")).toEqual(
      utc("2027-06-01T00:00:00.000"),
    );
    expect(addBillingInterval(utc("2028-02-29T00:00:00.000"), "YEARLY")).toEqual(
      utc("2029-02-28T00:00:00.000"),
    );
  });
});
