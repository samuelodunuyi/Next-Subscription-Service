import { describe, expect, it } from "vitest";
import { z } from "zod";

import { parseJsonBody } from "./http";

const schema = z.object({ a: z.number() });
const post = (body: string, contentType?: string) =>
  new Request("http://localhost/api/x", {
    method: "POST",
    body,
    headers: contentType ? { "content-type": contentType } : {},
  });

describe("parseJsonBody", () => {
  it("accepts JSON with a JSON content type (including charset)", async () => {
    const result = await parseJsonBody(post('{"a":1}', "application/json; charset=utf-8"), schema);
    expect(result).toEqual({ ok: true, data: { a: 1 } });
  });

  it("rejects form/text content types with 415 (simple-request CSRF)", async () => {
    for (const type of ["text/plain", "application/x-www-form-urlencoded", "multipart/form-data"]) {
      const result = await parseJsonBody(post('{"a":1}', type), schema);
      expect(result.ok === false && result.response.status).toBe(415);
    }
  });

  it("returns 400 for malformed JSON and invalid shape, 413 for oversized bodies", async () => {
    const bad = await parseJsonBody(post("{nope", "application/json"), schema);
    expect(bad.ok === false && bad.response.status).toBe(400);
    const wrong = await parseJsonBody(post('{"a":"x"}', "application/json"), schema);
    expect(wrong.ok === false && wrong.response.status).toBe(400);
    const big = await parseJsonBody(
      post(JSON.stringify({ a: "x".repeat(70_000) }), "application/json"),
      schema,
    );
    expect(big.ok === false && big.response.status).toBe(413);
  });

  it("treats an empty body as {} only when optional", async () => {
    const optional = z.object({ immediate: z.boolean().default(false) });
    expect(await parseJsonBody(post(""), optional, "x", { optional: true })).toEqual({
      ok: true,
      data: { immediate: false },
    });
    const required = await parseJsonBody(post(""), schema);
    expect(required.ok === false && required.response.status).toBe(400);
  });
});
