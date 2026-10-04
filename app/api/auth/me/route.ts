import { enforceRateLimit, limits } from "@/lib/rate-limit";
import { NextResponse } from "next/server";
import { requireUser, toPublicUser } from "@/lib/auth/session";

export async function GET() {
  const auth = await requireUser();
  if (!auth.ok) {
    return auth.response;
  }

  const limited = await enforceRateLimit([limits.readByUser(auth.user.id)]);
  if (limited) {
    return limited;
  }

  return NextResponse.json({ user: toPublicUser(auth.user) }, { status: 200 });
}
