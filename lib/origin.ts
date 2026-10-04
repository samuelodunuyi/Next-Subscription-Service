const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

type OriginCheckInput = {
  method: string;
  pathname: string;
  origin: string | null;
  secFetchSite: string | null;
  host: string | null;
  allowedOrigins: string[];
};

export function isCrossSiteWrite(input: OriginCheckInput): boolean {
  if (SAFE_METHODS.has(input.method.toUpperCase())) {
    return false;
  }
  if (input.pathname.startsWith("/api/webhooks/")) {
    return false;
  }

  if (input.origin) {
    if (input.allowedOrigins.includes(input.origin)) {
      return false;
    }
    try {
      return new URL(input.origin).host !== input.host;
    } catch {
      return true;
    }
  }

  return input.secFetchSite === "cross-site";
}

export function allowedOriginsFromEnv(env: NodeJS.ProcessEnv = process.env): string[] {
  return (env.ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}
