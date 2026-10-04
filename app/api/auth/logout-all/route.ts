import { NextResponse } from "next/server";
import { log } from "@/lib/log";
import { destroyCurrentSession, requireUser, revokeUserSessions } from "@/lib/auth/session";

export async function POST() {
  const auth = await requireUser();
  if (!auth.ok) {
    return auth.response;
  }

  await revokeUserSessions(auth.user.id);
  await destroyCurrentSession();
  log.info("auth.logout_all", { userId: auth.user.id });

  return NextResponse.json({ message: "Logged out of all sessions" }, { status: 200 });
}
