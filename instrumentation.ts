import type { Instrumentation } from "next";
import { log } from "@/lib/log";

export const onRequestError: Instrumentation.onRequestError = async (error, request, context) => {
  const header = request.headers["x-request-id"];

  log.error("http.unhandled_error", {
    requestId: Array.isArray(header) ? header[0] : header,
    method: request.method,
    path: request.path.split("?")[0],
    route: context.routePath,
    routeType: context.routeType,
    error,
    digest:
      typeof error === "object" && error !== null && "digest" in error
        ? String(error.digest)
        : undefined,
  });
};
