import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { UpdatePlanSchema } from "@/lib/validations/plans";
import { getCurrentUser, requireAdmin } from "@/lib/auth/session";
import { errorResponse, parseJsonBody } from "@/lib/http";
import { clientIp, enforceRateLimit, limits } from "@/lib/rate-limit";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(req: Request, { params }: RouteContext) {
  const limited = await enforceRateLimit([limits.readByIp(clientIp(req))]);
  if (limited) {
    return limited;
  }

  const { id } = await params;

  const plan = await prisma.plan.findUnique({ where: { id } });

  if (!plan || (!plan.active && (await getCurrentUser())?.role !== "ADMIN")) {
    return errorResponse(404, "Plan not found");
  }

  return NextResponse.json({ plan }, { status: 200 });
}

export async function PATCH(req: Request, { params }: RouteContext) {
  const auth = await requireAdmin();
  if (!auth.ok) {
    return auth.response;
  }

  const { id } = await params;

  const body = await parseJsonBody(req, UpdatePlanSchema, "Invalid plan data");
  if (!body.ok) {
    return body.response;
  }

  const { count } = await prisma.plan.updateMany({ where: { id }, data: body.data });
  if (count === 0) {
    return errorResponse(404, "Plan not found");
  }

  const plan = await prisma.plan.findUniqueOrThrow({ where: { id } });
  return NextResponse.json({ plan }, { status: 200 });
}
