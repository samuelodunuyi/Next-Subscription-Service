import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import type { NextResponse } from "next/server";
import { prisma } from "../prisma";
import { SESSION_ABSOLUTE_DAYS, sessionValidity } from "./session-policy";
import { errorResponse } from "../http";
import type { User } from "../../generated/prisma/client";

const SESSION_COOKIE_NAME = "session";
const SESSION_COOKIE_DAYS = SESSION_ABSOLUTE_DAYS;

const LAST_USED_UPDATE_INTERVAL_MS = 60 * 60 * 1000;
type SessionDb = Pick<typeof prisma, "session">;

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

type IssuedSession = { token: string; expiresAt: Date };

export async function issueSession(userId: string, db: SessionDb = prisma): Promise<IssuedSession> {
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_COOKIE_DAYS * 24 * 60 * 60 * 1000);

  const presented = (await cookies()).get(SESSION_COOKIE_NAME)?.value;
  if (presented) {
    await db.session.deleteMany({ where: { tokenHash: hashToken(presented) } });
  }
  await db.session.deleteMany({ where: { userId, expiresAt: { lt: new Date() } } });

  await db.session.create({
    data: {
      tokenHash: hashToken(token),
      userId,
      expiresAt,
    },
  });

  return { token, expiresAt };
}

export async function setSessionCookie({ token, expiresAt }: IssuedSession) {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, token, {
    path: "/",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    expires: expiresAt,
  });
}

export async function createSession(userId: string) {
  await setSessionCookie(await issueSession(userId));
}

export async function revokeUserSessions(userId: string, db: SessionDb = prisma) {
  await db.session.deleteMany({ where: { userId } });
}

export async function purgeExpiredSessions() {
  const { count } = await prisma.session.deleteMany({
    where: { expiresAt: { lt: new Date() } },
  });
  return count;
}

export async function getCurrentUser() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!token) {
    return null;
  }

  const tokenHash = hashToken(token);

  const session = await prisma.session.findUnique({
    where: {
      tokenHash: tokenHash,
    },
    include: {
      user: true,
    },
  });

  if (!session) {
    return null;
  }

  const now = new Date();

  if (sessionValidity(session, now) !== "valid") {
    await prisma.session.deleteMany({
      where: {
        tokenHash: tokenHash,
      },
    });
    return null;
  }

  if (now.getTime() - session.lastUsedAt.getTime() > LAST_USED_UPDATE_INTERVAL_MS) {
    await prisma.session.updateMany({
      where: { id: session.id },
      data: { lastUsedAt: now },
    });
  }

  return session.user;
}

export async function destroyCurrentSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (token) {
    await prisma.session.deleteMany({
      where: {
        tokenHash: hashToken(token),
      },
    });
  }

  cookieStore.delete(SESSION_COOKIE_NAME);
}

type AuthResult = { ok: true; user: User } | { ok: false; response: NextResponse };

export async function requireUser(): Promise<AuthResult> {
  const user = await getCurrentUser();
  if (!user) {
    return { ok: false, response: errorResponse(401, "Unauthorized") };
  }
  return { ok: true, user };
}

export async function requireAdmin(): Promise<AuthResult> {
  const auth = await requireUser();
  if (auth.ok && auth.user.role !== "ADMIN") {
    return { ok: false, response: errorResponse(403, "Forbidden") };
  }
  return auth;
}

export function toPublicUser(user: User) {
  return {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    role: user.role,
  };
}
