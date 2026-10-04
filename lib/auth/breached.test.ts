import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";

import { isPasswordBreached } from "./breached";

const sha1 = (value: string) => createHash("sha1").update(value).digest("hex").toUpperCase();
const reply = (body: string, status = 200) =>
  (async () => new Response(body, { status })) as unknown as typeof fetch;

describe("isPasswordBreached", () => {
  const hash = sha1("password123");

  it("only sends the 5-char hash prefix, never the password", async () => {
    let requested = "";
    const spy = (async (url: string) => {
      requested = url;
      return new Response("");
    }) as unknown as typeof fetch;

    await isPasswordBreached("password123", spy, {} as never);

    expect(requested.endsWith(hash.slice(0, 5))).toBe(true);
    expect(requested).not.toContain("password123");
    expect(requested).not.toContain(hash.slice(5));
  });

  it("detects a breached password from the range response", async () => {
    const body = `0000000000000000000000000000000000A:3\r\n${hash.slice(5)}:48201\r\nFFFF:1`;
    expect(await isPasswordBreached("password123", reply(body), {} as never)).toBe(true);
  });

  it("ignores zero-count padding entries and non-matches", async () => {
    expect(await isPasswordBreached("password123", reply(`${hash.slice(5)}:0`), {} as never)).toBe(
      false,
    );
    expect(await isPasswordBreached("password123", reply("ABC:5"), {} as never)).toBe(false);
  });

  it("fails open on errors, bad status, or timeouts", async () => {
    const boom = (async () => {
      throw new Error("network down");
    }) as unknown as typeof fetch;
    expect(await isPasswordBreached("x", boom, {} as never)).toBe(false);
    expect(await isPasswordBreached("x", reply("", 503), {} as never)).toBe(false);
  });

  it("can be switched off", async () => {
    const mustNotCall = (async () => {
      throw new Error("should not be called");
    }) as unknown as typeof fetch;
    expect(
      await isPasswordBreached("x", mustNotCall, { PASSWORD_BREACH_CHECK: "off" } as never),
    ).toBe(false);
  });
});
