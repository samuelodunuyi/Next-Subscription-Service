import { createHash } from "node:crypto";
import { log } from "../log";

const HIBP_RANGE_URL = "https://api.pwnedpasswords.com/range/";
const TIMEOUT_MS = 2000;

export async function isPasswordBreached(
  password: string,
  fetchImpl: typeof fetch = fetch,
  env: NodeJS.ProcessEnv = process.env,
): Promise<boolean> {
  if (env.PASSWORD_BREACH_CHECK === "off") {
    return false;
  }

  const sha1 = createHash("sha1").update(password).digest("hex").toUpperCase();
  const prefix = sha1.slice(0, 5);
  const suffix = sha1.slice(5);

  try {
    const response = await fetchImpl(`${HIBP_RANGE_URL}${prefix}`, {
      headers: { "Add-Padding": "true", "User-Agent": "subscription-platform" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) {
      throw new Error(`HIBP responded ${response.status}`);
    }

    return (await response.text()).split("\n").some((line) => {
      const [candidate, count] = line.trim().split(":");
      return candidate === suffix && Number(count) > 0;
    });
  } catch (error) {
    log.warn("auth.breach_check_unavailable", { error });
    return false;
  }
}
