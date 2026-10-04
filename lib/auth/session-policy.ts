export const SESSION_ABSOLUTE_DAYS = 30;
export const SESSION_IDLE_DAYS = 14;

const DAY_MS = 24 * 60 * 60 * 1000;

export type SessionValidity = "valid" | "expired" | "idle";

export function sessionValidity(
  session: { expiresAt: Date; lastUsedAt: Date },
  now: Date,
): SessionValidity {
  if (session.expiresAt <= now) {
    return "expired";
  }
  if (now.getTime() - session.lastUsedAt.getTime() > SESSION_IDLE_DAYS * DAY_MS) {
    return "idle";
  }
  return "valid";
}
