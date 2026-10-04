import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { createSession, requireUser, revokeUserSessions } from "@/lib/auth/session";
import { errorResponse, parseJsonBody } from "@/lib/http";
import { isPasswordBreached } from "@/lib/auth/breached";
import { log } from "@/lib/log";
import { enforceRateLimit, limits } from "@/lib/rate-limit";

const ChangePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(100),
  newPassword: z.string().min(8).max(100),
});

export async function POST(req: Request) {
  const auth = await requireUser();
  if (!auth.ok) {
    return auth.response;
  }

  const limited = await enforceRateLimit([limits.passwordChangeByUser(auth.user.id)]);
  if (limited) {
    return limited;
  }

  const body = await parseJsonBody(req, ChangePasswordSchema, "Invalid password data");
  if (!body.ok) {
    return body.response;
  }

  const { currentPassword, newPassword } = body.data;

  if (!(await verifyPassword(auth.user.passwordHash, currentPassword))) {
    log.warn("auth.password_change_failed", { userId: auth.user.id });
    return errorResponse(401, "Current password is incorrect");
  }
  if (currentPassword === newPassword) {
    return errorResponse(400, "New password must be different");
  }

  if (await isPasswordBreached(newPassword)) {
    return errorResponse(
      400,
      "This password has appeared in a known data breach. Please choose a different one.",
    );
  }

  const passwordHash = await hashPassword(newPassword);

  await prisma.user.update({ where: { id: auth.user.id }, data: { passwordHash } });
  await revokeUserSessions(auth.user.id);
  await createSession(auth.user.id);
  log.info("auth.password_changed", { userId: auth.user.id });

  return NextResponse.json({ message: "Password updated" }, { status: 200 });
}
