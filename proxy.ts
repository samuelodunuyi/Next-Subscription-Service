import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { log, resolveRequestId } from "@/lib/log";
import { allowedOriginsFromEnv, isCrossSiteWrite } from "@/lib/origin";

export function proxy(request: NextRequest) {
  const requestId = resolveRequestId(request.headers.get("x-request-id"));

  const crossSite = isCrossSiteWrite({
    method: request.method,
    pathname: request.nextUrl.pathname,
    origin: request.headers.get("origin"),
    secFetchSite: request.headers.get("sec-fetch-site"),
    host: request.headers.get("host"),
    allowedOrigins: allowedOriginsFromEnv(),
  });

  if (crossSite) {
    log.warn("security.csrf_blocked", {
      requestId,
      method: request.method,
      path: request.nextUrl.pathname,
      origin: request.headers.get("origin"),
    });
    return NextResponse.json(
      { error: "Cross-site request blocked", requestId },
      { status: 403, headers: { "x-request-id": requestId } },
    );
  }

  const headers = new Headers(request.headers);
  headers.set("x-request-id", requestId);

  const response = NextResponse.next({ request: { headers } });
  response.headers.set("x-request-id", requestId);
  return response;
}

export const config = {
  matcher: "/api/:path*",
};
