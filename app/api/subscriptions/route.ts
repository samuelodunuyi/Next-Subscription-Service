import { NextResponse } from "next/server";
import { SubscriptionSchema } from "@/lib/validations/subscriptions";
import { requireUser } from "@/lib/auth/session";
import { errorResponse, parseJsonBody } from "@/lib/http";
import { listSubscriptions, subscribe } from "@/lib/billing/service";
import { enforceRateLimit, limits } from "@/lib/rate-limit";

export async function POST(req: Request) {
  const auth = await requireUser();
  if (!auth.ok) {
    return auth.response;
  }

  const limited = await enforceRateLimit([limits.mutationByUser(auth.user.id)]);
  if (limited) {
    return limited;
  }

  const body = await parseJsonBody(req, SubscriptionSchema, "Invalid subscription data");
  if (!body.ok) {
    return body.response;
  }

  const result = await subscribe(auth.user.id, body.data.planId);

  if (!result.ok) {
    return result.error === "PLAN_NOT_FOUND"
      ? errorResponse(404, "Plan not found")
      : errorResponse(409, "Already subscribed");
  }

  return NextResponse.json(
    { subscription: result.subscription, payment: result.payment },
    { status: 201 },
  );
}

export async function GET() {
  const auth = await requireUser();
  if (!auth.ok) {
    return auth.response;
  }

  const limited = await enforceRateLimit([limits.readByUser(auth.user.id)]);
  if (limited) {
    return limited;
  }

  const subscriptions = await listSubscriptions(auth.user.id);

  return NextResponse.json({ subscriptions }, { status: 200 });
}
