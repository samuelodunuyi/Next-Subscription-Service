import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/session";
import { errorResponse } from "@/lib/http";
import { resumeSubscription } from "@/lib/billing/service";
import { enforceRateLimit, limits } from "@/lib/rate-limit";

export async function POST() {
  const auth = await requireUser();
  if (!auth.ok) {
    return auth.response;
  }

  const limited = await enforceRateLimit([limits.mutationByUser(auth.user.id)]);
  if (limited) {
    return limited;
  }

  const result = await resumeSubscription(auth.user.id);

  if (!result.ok) {
    return result.error === "NO_SUBSCRIPTION"
      ? errorResponse(404, "No active subscription")
      : errorResponse(409, "Subscription is not scheduled for cancellation");
  }

  return NextResponse.json({ subscription: result.subscription }, { status: 200 });
}
