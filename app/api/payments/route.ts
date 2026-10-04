import { NextResponse } from "next/server";

import { requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { errorResponse } from "@/lib/http";
import { createPayment } from "@/lib/billing/service";
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

  const result = await createPayment(auth.user.id);

  if (!result.ok) {
    if (result.error === "NO_SUBSCRIPTION") {
      return errorResponse(404, "No active subscription found");
    }
    if (result.error === "CANCELLATION_SCHEDULED") {
      return errorResponse(
        409,
        "Subscription is scheduled for cancellation; resume it before renewing",
      );
    }
    return errorResponse(409, "A payment is already pending", { paymentId: result.payment.id });
  }

  return NextResponse.json({ payment: result.payment }, { status: 201 });
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

  const payments = await prisma.payment.findMany({
    where: {
      userId: auth.user.id,
    },
    orderBy: {
      createdAt: "desc",
    },
    include: {
      subscription: {
        include: {
          plan: true,
        },
      },
    },
  });

  return NextResponse.json({ payments }, { status: 200 });
}
