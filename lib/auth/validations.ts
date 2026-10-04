import { z } from "zod";

const Email = z.string().trim().toLowerCase().pipe(z.email().max(254));

export const SignupSchema = z.object({
  email: Email,
  password: z.string().min(8).max(100),
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().min(1).max(100),
});

export const LoginSchema = z.object({
  email: Email,
  password: z.string().min(1).max(100),
});
