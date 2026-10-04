import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { PlansSchema } from "@/lib/validations/plans";
import { requireAdmin } from "@/lib/auth/session";
import { parseJsonBody } from "@/lib/http";
import { clientIp, enforceRateLimit, limits } from "@/lib/rate-limit";

export async function GET(req: Request) {
  const limited = await enforceRateLimit([limits.readByIp(clientIp(req))]);
  if (limited) {
    return limited;
  }

  const plans = await prisma.plan.findMany({
    where: {
      active: true,
    },
    orderBy: {
      price: "asc",
    },
  });
  return NextResponse.json({ plans }, { status: 200 });
}

export async function POST(req: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) {
    return auth.response;
  }

  const body = await parseJsonBody(req, PlansSchema, "Invalid plan data");
  if (!body.ok) {
    return body.response;
  }

  const plan = await prisma.plan.create({ data: body.data });

  return NextResponse.json({ plan }, { status: 201 });
}
