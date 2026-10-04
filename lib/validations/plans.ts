import { z } from "zod";

const Price = z
  .number()
  .positive()
  .max(99_999_999.99)
  .refine((value) => Math.abs(value * 100 - Math.round(value * 100)) < 1e-6, {
    message: "Price must have at most 2 decimal places",
  });

const Currency = z
  .string()
  .trim()
  .regex(/^[A-Za-z]{3}$/, "Currency must be a 3-letter ISO 4217 code")
  .toUpperCase();

export const PlansSchema = z.object({
  name: z.string().trim().min(1).max(100),
  description: z.string().trim().min(2).max(1000),
  price: Price,
  currency: Currency.default("GBP"),
  interval: z.enum(["MONTHLY", "YEARLY"]),
});

export const UpdatePlanSchema = z
  .object({
    name: z.string().trim().min(1).max(100),
    description: z.string().trim().min(2).max(1000),
    price: Price,
    active: z.boolean(),
  })
  .partial()
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field is required",
  });
