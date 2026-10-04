import { NextResponse } from "next/server";
import { LoginSchema } from "@/lib/auth/validations";
import { prisma } from "@/lib/prisma";
import { verifyDummyPassword, verifyPassword } from "@/lib/auth/password";
import { createSession, toPublicUser } from "@/lib/auth/session";
import { errorResponse, parseJsonBody } from "@/lib/http";
import { log } from "@/lib/log";
import { clientIp, enforceRateLimit, hashKeyPart, limits, resetRateLimit } from "@/lib/rate-limit";

export async function POST(req: Request) {
  const ip = clientIp(req);
  const ipLimited = await enforceRateLimit([limits.loginByIp(ip)]);
  if (ipLimited) {
    return ipLimited;
  }

  const body = await parseJsonBody(req, LoginSchema, "Invalid login data");
  if (!body.ok) {
    return body.response;
  }

  const { email, password } = body.data;

  const accountLimit = limits.loginByIpAndEmail(ip, email);
  const limited = await enforceRateLimit([accountLimit]);
  if (limited) {
    return limited;
  }

  const user = await prisma.user.findUnique({
    where: {
      email,
    },
  });

  const passwordIsValid = user
    ? await verifyPassword(user.passwordHash, password)
    : await verifyDummyPassword(password);

  if (!user || !passwordIsValid) {
    log.warn("auth.login_failed", { ip, emailHash: hashKeyPart(email) });
    return errorResponse(401, "Invalid email or password");
  }

  await resetRateLimit(accountLimit);
  await createSession(user.id);
  log.info("auth.login", { userId: user.id });

  return NextResponse.json({ user: toPublicUser(user) }, { status: 200 });
}
