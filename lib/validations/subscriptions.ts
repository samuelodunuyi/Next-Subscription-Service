import { z } from "zod";

export const SubscriptionSchema = z.object({
  planId: z.uuid(),
});
