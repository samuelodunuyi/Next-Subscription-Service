import { enforceRateLimit, limits } from "@/lib/rate-limit";
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { readLiveSubscription } from "@/lib/billing/service";

export async function GET() {
  const auth = await requireUser();
  if (!auth.ok) {
    return auth.response;
  }

  const limited = await enforceRateLimit([limits.readByUser(auth.user.id)]);
  if (limited) {
    return limited;
  }

  const subscription = await readLiveSubscription(prisma, auth.user.id);

  return NextResponse.json({ subscription }, { status: 200 });
}
