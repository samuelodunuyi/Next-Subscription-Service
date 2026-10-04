import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import { errorResponse, parseJsonBody } from "@/lib/http";
import { cancelSubscription } from "@/lib/billing/service";
import { enforceRateLimit, limits } from "@/lib/rate-limit";

const CancelSchema = z.object({
  immediate: z.boolean().default(false),
});

export async function POST(req: Request) {
  const auth = await requireUser();
  if (!auth.ok) {
    return auth.response;
  }

  const limited = await enforceRateLimit([limits.mutationByUser(auth.user.id)]);
  if (limited) {
    return limited;
  }

  const body = await parseJsonBody(req, CancelSchema, "Invalid cancel request", {
    optional: true,
  });
  if (!body.ok) {
    return body.response;
  }

  const result = await cancelSubscription(auth.user.id, body.data.immediate);

  if (!result.ok) {
    return errorResponse(404, "No active subscription");
  }

  return NextResponse.json({ subscription: result.subscription }, { status: 200 });
}
