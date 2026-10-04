export function getClientIp(headers: Headers, trustedProxyHops: number): string {
  if (trustedProxyHops > 0) {
    const forwarded = headers
      .get("x-forwarded-for")
      ?.split(",")
      .map((part) => part.trim())
      .filter(Boolean);

    const ip = forwarded?.[forwarded.length - trustedProxyHops];
    if (ip) {
      return ip;
    }
  }

  return "unknown";
}

export function trustedProxyHopsFromEnv(env: NodeJS.ProcessEnv = process.env): number {
  const hops = Number(env.TRUSTED_PROXY_HOPS ?? 0);
  return Number.isInteger(hops) && hops >= 0 ? hops : 0;
}
