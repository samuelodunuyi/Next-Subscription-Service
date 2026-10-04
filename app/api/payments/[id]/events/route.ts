import { enforceRateLimit, limits } from "@/lib/rate-limit";
import { NextResponse } from "next/server";

import { requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { errorResponse } from "@/lib/http";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function GET(_req: Request, { params }: RouteContext) {
  const auth = await requireUser();
  if (!auth.ok) {
    return auth.response;
  }

  const limited = await enforceRateLimit([limits.readByUser(auth.user.id)]);
  if (limited) {
    return limited;
  }

  const { id } = await params;

  const payment = await prisma.payment.findFirst({
    where: {
      id,
      userId: auth.user.id,
    },
    select: { id: true },
  });

  if (!payment) {
    return errorResponse(404, "Payment not found");
  }

  const events = await prisma.paymentEvent.findMany({
    where: { paymentId: payment.id },
    orderBy: { createdAt: "asc" },
    select: { id: true, type: true, createdAt: true },
  });

  return NextResponse.json({ events }, { status: 200 });
}
