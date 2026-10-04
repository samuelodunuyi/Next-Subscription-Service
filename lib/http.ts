import { NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "../generated/prisma/client";

export function errorResponse(status: number, error: string, details?: unknown) {
  return NextResponse.json(details === undefined ? { error } : { error, details }, { status });
}

type ParseResult<T> = { ok: true; data: T } | { ok: false; response: NextResponse };

export const MAX_BODY_BYTES = 64 * 1024;

export async function readBodyText(req: Request): Promise<string | null> {
  const declared = Number(req.headers.get("content-length"));
  if (declared > MAX_BODY_BYTES) {
    return null;
  }
  const text = await req.text();
  return Buffer.byteLength(text) > MAX_BODY_BYTES ? null : text;
}

export async function parseJsonBody<T>(
  req: Request,
  schema: z.ZodType<T>,
  message = "Invalid request body",
  { optional = false }: { optional?: boolean } = {},
): Promise<ParseResult<T>> {
  const text = await readBodyText(req);
  if (text === null) {
    return { ok: false, response: errorResponse(413, "Request body too large") };
  }

  if (
    text.trim() !== "" &&
    !req.headers.get("content-type")?.toLowerCase().startsWith("application/json")
  ) {
    return { ok: false, response: errorResponse(415, "Content-Type must be application/json") };
  }

  let body: unknown;
  if (optional && text.trim() === "") {
    body = {};
  } else {
    try {
      body = JSON.parse(text);
    } catch {
      return { ok: false, response: errorResponse(400, "Malformed JSON body") };
    }
  }

  const result = schema.safeParse(body);
  if (!result.success) {
    return {
      ok: false,
      response: errorResponse(400, message, z.flattenError(result.error).fieldErrors),
    };
  }

  return { ok: true, data: result.data };
}

export function isUniqueConstraintError(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}
