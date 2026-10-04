import { NextResponse } from "next/server";
import { SignupSchema } from "@/lib/auth/validations";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/auth/password";
import { issueSession, setSessionCookie, toPublicUser } from "@/lib/auth/session";
import { errorResponse, isUniqueConstraintError, parseJsonBody } from "@/lib/http";
import { isPasswordBreached } from "@/lib/auth/breached";
import { log } from "@/lib/log";
import { clientIp, enforceRateLimit, limits } from "@/lib/rate-limit";

export async function POST(req: Request) {
  const limited = await enforceRateLimit([limits.registerByIp(clientIp(req))]);
  if (limited) {
    return limited;
  }

  const body = await parseJsonBody(req, SignupSchema, "Invalid registration data");
  if (!body.ok) {
    return body.response;
  }

  const { email, password, firstName, lastName } = body.data;

  if (await isPasswordBreached(password)) {
    return errorResponse(
      400,
      "This password has appeared in a known data breach. Please choose a different one.",
    );
  }

  const passwordHash = await hashPassword(password);

  const existingUser = await prisma.user.findUnique({
    where: {
      email,
    },
  });

  if (existingUser) {
    return errorResponse(409, "User already exists");
  }

  try {
    const { user, session } = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email,
          passwordHash,
          firstName,
          lastName,
        },
      });

      return { user, session: await issueSession(user.id, tx) };
    });

    await setSessionCookie(session);
    log.info("auth.registered", { userId: user.id });

    return NextResponse.json({ user: toPublicUser(user) }, { status: 201 });
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      return errorResponse(409, "User already exists");
    }
    throw error;
  }
}
